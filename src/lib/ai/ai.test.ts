import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { createRecord } from '../data/crud';
import { makeCharacter } from '../data/factories';
import { createProject } from '../data/projects';
import { saveScript } from '../data/scripts';
import { uid } from '../ids';
import type { Proposal, ScriptElement } from '../types';
import { applyProposal, replaceSceneBody, resolveProposal, undoProposal } from './apply';
import { loadSnapshot, projectContext, runReadTool } from './context';
import { toolDefinitions, validateToolInput } from './tools';

const el = (type: ScriptElement['type'], text: string, sceneId?: string): ScriptElement => ({ id: uid(), type, text, ...(sceneId ? { sceneId } : {}) });

async function setup() {
  const project = await createProject({ title: 'Lighthouse', runtimeTarget: 12 });
  await createRecord('characters', makeCharacter(project.id, { name: 'Mara' }));
  await saveScript(project.primaryScriptId!, [
    el('scene', 'INT. LIGHTHOUSE - NIGHT', uid()),
    el('action', 'Waves hammer the glass.'),
    el('character', 'MARA'),
    el('dialogue', 'Do you hear that?'),
    el('scene', 'EXT. CLIFF - DAWN', uid()),
    el('action', 'Gulls.'),
  ]);
  return project;
}

async function propose(projectId: string, kind: string, args: unknown): Promise<Proposal> {
  const v = validateToolInput(kind as never, args);
  if (!v.ok) throw new Error(v.error);
  const r = resolveProposal(await loadSnapshot(projectId), kind as never, v.value);
  if (!r.ok) throw new Error(r.error);
  return { id: uid(), kind, input: r.payload, status: 'pending' };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('tool validation', () => {
  it('accepts well-formed input and coerces numbers', () => {
    const v = validateToolInput('propose_shots', { scene_number: '2', shots: [{ description: 'Wide', shot_type: 'WS', angle: 'eye', movement: 'static' }] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.scene_number).toBe(2);
  });
  it('rejects unknown enums, bad dates and empty changes', () => {
    expect(validateToolInput('propose_shots', { scene_number: 1, shots: [{ description: 'x', shot_type: 'HUGE', angle: 'eye', movement: 'static' }] }).ok).toBe(false);
    expect(validateToolInput('propose_tasks', { tasks: [{ title: 'x', priority: 'high', due_date: 'next week' }] }).ok).toBe(false);
    expect(validateToolInput('propose_scene_updates', { scene_number: 1, changes: {} }).ok).toBe(false);
    expect(validateToolInput('propose_shots', { scene_number: 1 }).ok).toBe(false);
  });
  it('defines every tool with eager input streaming', () => {
    const defs = toolDefinitions();
    expect(defs.length).toBe(14);
    expect(defs.every((d) => d.eager_input_streaming === true)).toBe(true);
  });
});

describe('context and read tools', () => {
  it('describes the project and reads scene script', async () => {
    const p = await setup();
    const s = await loadSnapshot(p.id);
    const ctx = projectContext(s);
    expect(ctx).toContain('Scene 1: INT. LIGHTHOUSE - NIGHT');
    expect(ctx).toContain('Mara');
    expect(runReadTool(s, 'read_scene_script', { scene_number: 1 }).content).toContain('Do you hear that?');
    expect(runReadTool(s, 'read_scene_script', { scene_number: 9 }).isError).toBe(true);
    expect(runReadTool(s, 'search_script', { query: 'gulls' }).content).toContain('Scene 2');
  });
  it('refuses proposals for scenes or characters that do not exist', async () => {
    const p = await setup();
    const s = await loadSnapshot(p.id);
    expect(resolveProposal(s, 'propose_shots', { scene_number: 7, shots: [] }).ok).toBe(false);
    expect(resolveProposal(s, 'propose_character_updates', { name: 'Nobody', changes: { age: '30' } }).ok).toBe(false);
    expect(resolveProposal(s, 'propose_character', { name: 'MARA' }).ok).toBe(false);
  });
});

describe('apply and undo', () => {
  it('creates shots only when applied, and removes them on undo', async () => {
    const p = await setup();
    const proposal = await propose(p.id, 'propose_shots', {
      scene_number: 1,
      shots: [
        { description: 'Wide of the lamp room', shot_type: 'WS', angle: 'low', movement: 'static' },
        { description: 'Mara listens', shot_type: 'CU', angle: 'eye', movement: 'dolly', lens: '50mm' },
      ],
    });
    expect(await db.shots.count()).toBe(0);
    const applied = await applyProposal(p.id, proposal);
    expect(applied.status).toBe('applied');
    expect(await db.shots.count()).toBe(2);
    const undone = await undoProposal(p.id, applied);
    expect(undone.status).toBe('pending');
    expect(await db.shots.count()).toBe(0);
  });

  it('restores previous values when undoing scene and character updates', async () => {
    const p = await setup();
    const scene = (await db.scenes.where('projectId').equals(p.id).sortBy('order'))[0];
    await db.scenes.update(scene.id, { summary: 'Original summary' });
    const sp = await applyProposal(p.id, await propose(p.id, 'propose_scene_updates', { scene_number: 1, changes: { summary: 'New summary', props_notes: 'Lantern' } }));
    expect((await db.scenes.get(scene.id))!.summary).toBe('New summary');
    await undoProposal(p.id, sp);
    const after = (await db.scenes.get(scene.id))!;
    expect(after.summary).toBe('Original summary');
    expect(after.propsNotes).toBe('');

    const cp = await applyProposal(p.id, await propose(p.id, 'propose_character_updates', { name: 'mara', changes: { fears: 'The dark' } }));
    const mara = (await db.characters.where('projectId').equals(p.id).first())!;
    expect(mara.fears).toBe('The dark');
    await undoProposal(p.id, cp);
    expect((await db.characters.get(mara.id))!.fears).toBe('');
  });

  it('revises only one scene, saves a version first, and undo restores the text', async () => {
    const p = await setup();
    const proposal = await propose(p.id, 'propose_script_revision', {
      scene_number: 1,
      rationale: 'Tighter',
      elements: [
        { type: 'action', text: 'The lamp gutters.' },
        { type: 'character', text: 'Mara' },
        { type: 'parenthetical', text: 'barely audible' },
        { type: 'dialogue', text: 'Someone is out there.' },
      ],
    });
    const applied = await applyProposal(p.id, proposal);
    expect(applied.backupVersionId).toBeTruthy();
    let script = (await db.scripts.get(p.primaryScriptId!))!;
    expect(script.elements.map((e) => e.text)).toEqual([
      'INT. LIGHTHOUSE - NIGHT',
      'The lamp gutters.',
      'MARA',
      '(barely audible)',
      'Someone is out there.',
      'EXT. CLIFF - DAWN',
      'Gulls.',
    ]);
    const versions = await db.scriptVersions.where('scriptId').equals(script.id).toArray();
    expect(versions.some((v) => v.label === 'Before assistant revision of scene 1')).toBe(true);
    await undoProposal(p.id, applied);
    script = (await db.scripts.get(p.primaryScriptId!))!;
    expect(script.elements.some((e) => e.text === 'Do you hear that?')).toBe(true);
  });

  it('applies tasks, schedule events and new characters', async () => {
    const p = await setup();
    const t = await applyProposal(p.id, await propose(p.id, 'propose_tasks', { tasks: [{ title: 'Secure the lighthouse', priority: 'high', due_date: '2026-11-02', scene_number: 1 }] }));
    const task = (await db.tasks.get(t.createdRecords![0].id))!;
    expect(task).toMatchObject({ title: 'Secure the lighthouse', priority: 'high', due: '2026-11-02' });
    expect(task.sceneId).toBeTruthy();

    const e = await applyProposal(p.id, await propose(p.id, 'propose_schedule', { events: [{ type: 'filming', title: 'Day 1', date: '2026-11-10', start_time: '7:30', duration_min: 600, scene_numbers: [1, 2] }] }));
    const ev = (await db.events.get(e.createdRecords![0].id))!;
    expect(ev).toMatchObject({ startTime: '07:30', callTime: '06:30', durationMin: 600 });
    expect(ev.sceneIds).toHaveLength(2);

    const c = await applyProposal(p.id, await propose(p.id, 'propose_character', { name: 'ELI', personality: 'Dry wit' }));
    expect((await db.characters.get(c.createdRecords![0].id))!.name).toBe('Eli');
    await undoProposal(p.id, c);
    expect(await db.characters.get(c.createdRecords![0].id)).toBeUndefined();
  });

  it('replaceSceneBody keeps the heading and neighbouring scenes', () => {
    const els = [el('scene', 'A', 'a'), el('action', 'a1'), el('scene', 'B', 'b'), el('action', 'b1')];
    const out = replaceSceneBody(els, 'a', [el('action', 'new')]);
    expect(out.map((e) => e.text)).toEqual(['A', 'new', 'B', 'b1']);
  });
});
