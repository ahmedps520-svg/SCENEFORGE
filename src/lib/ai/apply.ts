import { db, type ProjectTable } from '../db';
import { minutesToTime, timeToMinutes } from '../dates';
import { createRecord, logActivity, updateRecord } from '../data/crud';
import { deleteEntity } from '../data/deletes';
import { makeCharacter, makeEvent, makeFrame, makeShot, makeTask } from '../data/factories';
import { updateScene } from '../data/scenes';
import { getPrimaryScript, restoreVersion, saveScript, saveVersion } from '../data/scripts';
import { uid } from '../ids';
import { titleCase } from '../data/projects';
import type { Character, EntityType, Proposal, Scene, ScriptElement } from '../types';
import { characterByName, sceneByNumber, type Snapshot } from './context';
import type { ToolInput, ToolName } from './tools';

/**
 * Assistant suggestions. A proposal stores the validated tool input plus the
 * records it refers to (resolved when it was suggested, so later renumbering
 * can't retarget it). Nothing touches project data until `applyProposal`.
 */

export interface ProposalRefs {
  sceneId?: string;
  sceneLabel?: string;
  characterId?: string;
  /** For proposals with one optional scene per item (tasks). */
  itemSceneIds?: (string | undefined)[];
  /** For schedule events: scene ids per event. */
  eventSceneIds?: string[][];
}

export interface ProposalPayload<N extends ToolName = ToolName> {
  args: ToolInput<N>;
  refs: ProposalRefs;
}

const sceneLabel = (s: Snapshot, scene: Scene) => `Scene ${s.numbers.get(scene.id)} · ${scene.heading || 'Untitled'}`;

/** Check a proposal against the project and capture what it refers to. */
export function resolveProposal(s: Snapshot, name: ToolName, args: unknown): { ok: true; payload: ProposalPayload } | { ok: false; error: string } {
  const a = args as Record<string, any>;
  const needScene = (n: number) => {
    const scene = sceneByNumber(s, n);
    if (!scene) throw new Error(`There is no scene ${n}. Scenes are numbered 1–${s.scenes.length}.`);
    return scene;
  };
  try {
    switch (name) {
      case 'propose_shots':
      case 'propose_storyboard_frames':
      case 'propose_scene_updates': {
        const scene = needScene(a.scene_number);
        return { ok: true, payload: { args: a as never, refs: { sceneId: scene.id, sceneLabel: sceneLabel(s, scene) } } };
      }
      case 'propose_script_revision': {
        const scene = needScene(a.scene_number);
        if (!scene.inScript) throw new Error(`Scene ${a.scene_number} is not in the production draft, so its script can't be revised.`);
        return { ok: true, payload: { args: a as never, refs: { sceneId: scene.id, sceneLabel: sceneLabel(s, scene) } } };
      }
      case 'propose_tasks': {
        const itemSceneIds = (a.tasks as { scene_number?: number }[]).map((t) => (t.scene_number ? needScene(t.scene_number).id : undefined));
        return { ok: true, payload: { args: a as never, refs: { itemSceneIds } } };
      }
      case 'propose_schedule': {
        const eventSceneIds = (a.events as { scene_numbers: number[] }[]).map((e) => e.scene_numbers.map((n) => needScene(n).id));
        return { ok: true, payload: { args: a as never, refs: { eventSceneIds } } };
      }
      case 'propose_character': {
        const existing = characterByName(s, a.name);
        if (existing) throw new Error(`A character named ${existing.name} already exists. Use propose_character_updates instead.`);
        return { ok: true, payload: { args: a as never, refs: {} } };
      }
      case 'propose_character_updates': {
        const c = characterByName(s, a.name);
        if (!c) throw new Error(`No character named "${a.name}". Known: ${s.characters.map((x) => x.name).join(', ') || 'none'}.`);
        return { ok: true, payload: { args: a as never, refs: { characterId: c.id } } };
      }
      default:
        return { ok: false, error: `${name} is not a proposal tool.` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const CHARACTER_FIELD_MAP: Record<string, keyof Character> = {
  age: 'age',
  appearance: 'appearance',
  personality: 'personality',
  background: 'background',
  motivations: 'motivations',
  goals: 'goals',
  fears: 'fears',
  arc: 'arc',
  costume_notes: 'costumeNotes',
  casting_notes: 'castingNotes',
  dialogue_samples: 'dialogueSamples',
};

const SCENE_FIELD_MAP: Record<string, keyof Scene> = {
  summary: 'summary',
  notes: 'notes',
  props_notes: 'propsNotes',
  wardrobe_notes: 'wardrobeNotes',
  sfx_notes: 'sfxNotes',
};

export function mapCharacterFields(fields: Record<string, unknown>): Partial<Character> {
  const out: Partial<Character> = {};
  for (const [k, v] of Object.entries(fields)) {
    const key = CHARACTER_FIELD_MAP[k];
    if (key && typeof v === 'string') (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

export function mapSceneFields(fields: Record<string, unknown>): Partial<Scene> {
  const out: Partial<Scene> = {};
  for (const [k, v] of Object.entries(fields)) {
    const key = SCENE_FIELD_MAP[k];
    if (key && typeof v === 'string') (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

/** Turn proposed script elements into editor elements. */
export function toScriptElements(items: { type: string; text: string }[]): ScriptElement[] {
  return items
    .filter((e) => e.text.trim())
    .map((e) => {
      let t = e.text.trim();
      if (e.type === 'parenthetical' && !t.startsWith('(')) t = `(${t})`;
      if (e.type === 'character' || e.type === 'transition' || e.type === 'shot') t = t.toUpperCase();
      return { id: uid(), type: e.type as ScriptElement['type'], text: t };
    });
}

/** Replace a scene's body (everything after its heading, up to the next heading). */
export function replaceSceneBody(elements: ScriptElement[], sceneId: string, body: ScriptElement[]): ScriptElement[] {
  const start = elements.findIndex((e) => e.type === 'scene' && e.sceneId === sceneId);
  if (start < 0) throw new Error('That scene is no longer in the production draft.');
  let end = start + 1;
  while (end < elements.length && !(elements[end].type === 'scene' && elements[end].sceneId)) end++;
  return [...elements.slice(0, start + 1), ...body, ...elements.slice(end)];
}

export function proposalSummary(p: Pick<Proposal, 'kind' | 'input'>): string {
  const { args, refs } = p.input as ProposalPayload;
  const a = args as Record<string, any>;
  const scene = refs.sceneLabel ?? '';
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  switch (p.kind) {
    case 'propose_shots':
      return `${n(a.shots.length, 'shot')} for ${scene}`;
    case 'propose_storyboard_frames':
      return `${n(a.frames.length, 'storyboard frame')} for ${scene}`;
    case 'propose_tasks':
      return n(a.tasks.length, 'task');
    case 'propose_scene_updates':
      return `Breakdown changes for ${scene}`;
    case 'propose_character':
      return `New character: ${a.name}`;
    case 'propose_character_updates':
      return `Profile changes for ${a.name}`;
    case 'propose_schedule':
      return n(a.events.length, 'schedule event');
    case 'propose_script_revision':
      return `Script revision for ${scene}`;
  }
  return p.kind;
}

const TABLE_ENTITY: Partial<Record<ProjectTable, Exclude<EntityType, 'project' | 'script'>>> = {
  shots: 'shot',
  frames: 'frame',
  tasks: 'task',
  characters: 'character',
  events: 'event',
};

/** Apply a suggestion to the project. Returns the proposal updated with undo data. */
export async function applyProposal(projectId: string, proposal: Proposal): Promise<Proposal> {
  if (proposal.status === 'applied') return proposal;
  const { args, refs } = proposal.input as ProposalPayload;
  const a = args as Record<string, any>;
  const created: { table: string; id: string }[] = [];
  const previous: NonNullable<Proposal['previous']> = [];
  let backupVersionId: string | undefined;
  const summary = proposalSummary(proposal);

  const requireScene = async () => {
    const scene = refs.sceneId ? await db.scenes.get(refs.sceneId) : undefined;
    if (!scene) throw new Error('The scene this suggestion was for has been deleted.');
    return scene;
  };

  switch (proposal.kind) {
    case 'propose_shots': {
      const scene = await requireScene();
      const existing = await db.shots.where('sceneId').equals(scene.id).toArray();
      let order = existing.reduce((m, x) => Math.max(m, x.order), -1);
      for (const s of a.shots as ToolInput<'propose_shots'>['shots']) {
        const shot = makeShot(projectId, scene.id, {
          order: ++order,
          description: s.description,
          shotType: s.shot_type,
          angle: s.angle,
          movement: s.movement,
          lens: s.lens ?? '',
          notes: s.notes ?? '',
        });
        await createRecord('shots', shot, { silent: true });
        created.push({ table: 'shots', id: shot.id });
      }
      break;
    }
    case 'propose_storyboard_frames': {
      const scene = await requireScene();
      const existing = await db.frames.where('sceneId').equals(scene.id).toArray();
      let order = existing.reduce((m, x) => Math.max(m, x.order), -1);
      for (const f of a.frames as ToolInput<'propose_storyboard_frames'>['frames']) {
        const frame = makeFrame(projectId, scene.id, {
          order: ++order,
          action: f.action,
          shotType: f.shot_type,
          angle: f.angle,
          movement: f.movement,
          audio: f.audio ?? '',
          durationSec: f.duration_sec,
        });
        await createRecord('frames', frame, { silent: true });
        created.push({ table: 'frames', id: frame.id });
      }
      break;
    }
    case 'propose_tasks': {
      const tasks = a.tasks as ToolInput<'propose_tasks'>['tasks'];
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const sceneId = refs.itemSceneIds?.[i];
        const task = makeTask(projectId, {
          title: t.title,
          description: t.description ?? '',
          priority: t.priority,
          due: t.due_date,
          sceneId: sceneId && (await db.scenes.get(sceneId)) ? sceneId : undefined,
          order: Date.now() + i,
        });
        await createRecord('tasks', task, { silent: true });
        created.push({ table: 'tasks', id: task.id });
      }
      break;
    }
    case 'propose_scene_updates': {
      const scene = await requireScene();
      const patch = mapSceneFields(a.changes);
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (scene as unknown as Record<string, unknown>)[k];
      previous.push({ table: 'scenes', id: scene.id, values: before });
      await updateScene(scene.id, patch);
      break;
    }
    case 'propose_character': {
      const { name, ...fields } = a;
      const raw = String(name).trim();
      // Cue-style ALL CAPS names become "Title Case" profile names.
      const c = makeCharacter(projectId, { name: raw === raw.toUpperCase() ? titleCase(raw) : raw, ...mapCharacterFields(fields) });
      await createRecord('characters', c, { silent: true });
      created.push({ table: 'characters', id: c.id });
      break;
    }
    case 'propose_character_updates': {
      const c = refs.characterId ? await db.characters.get(refs.characterId) : undefined;
      if (!c) throw new Error('That character has been deleted.');
      const patch = mapCharacterFields(a.changes);
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (c as unknown as Record<string, unknown>)[k];
      previous.push({ table: 'characters', id: c.id, values: before });
      await updateRecord<Character>('characters', c.id, patch, { silent: true });
      break;
    }
    case 'propose_schedule': {
      const events = a.events as ToolInput<'propose_schedule'>['events'];
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const sceneIds: string[] = [];
        for (const id of refs.eventSceneIds?.[i] ?? []) if (await db.scenes.get(id)) sceneIds.push(id);
        const ev = makeEvent(projectId, {
          type: e.type,
          title: e.title,
          date: e.date,
          startTime: e.start_time.padStart(5, '0'),
          durationMin: e.duration_min,
          callTime: minutesToTime(timeToMinutes(e.start_time) - 60),
          sceneIds,
          notes: e.notes ?? '',
        });
        await createRecord('events', ev, { silent: true });
        created.push({ table: 'events', id: ev.id });
      }
      break;
    }
    case 'propose_script_revision': {
      const scene = await requireScene();
      const script = await getPrimaryScript(projectId);
      if (!script) throw new Error('This project has no draft.');
      const body = toScriptElements(a.elements);
      const next = replaceSceneBody(script.elements, scene.id, body);
      const label = (refs.sceneLabel ?? 'scene').replace(/^Scene (\S+).*/, 'scene $1');
      const v = await saveVersion(script.id, `Before assistant revision of ${label}`);
      backupVersionId = v.id;
      await saveScript(script.id, next, { skipVersioning: true, summary: `Applied assistant revision of ${label}` });
      break;
    }
    default:
      throw new Error('This kind of suggestion can’t be applied.');
  }

  await logActivity({
    projectId,
    action: 'applied',
    entityType: proposal.kind.includes('character') ? 'character' : proposal.kind.includes('script') ? 'script' : proposal.kind.includes('scene') ? 'scene' : proposal.kind.includes('task') ? 'task' : proposal.kind.includes('schedule') ? 'event' : proposal.kind.includes('frame') ? 'frame' : 'shot',
    entityId: refs.sceneId ?? refs.characterId ?? created[0]?.id ?? projectId,
    summary: `Applied assistant suggestion: ${summary}`,
  });

  return {
    ...proposal,
    status: 'applied',
    resolvedAt: Date.now(),
    error: undefined,
    createdRecords: created,
    previous,
    backupVersionId,
  };
}

/** Reverse an applied suggestion. The proposal returns to pending. */
export async function undoProposal(projectId: string, proposal: Proposal): Promise<Proposal> {
  if (proposal.status !== 'applied') return proposal;
  for (const r of proposal.createdRecords ?? []) {
    const type = TABLE_ENTITY[r.table as ProjectTable];
    if (!type) continue;
    const exists = await (db as unknown as Record<string, { get(id: string): Promise<unknown> }>)[r.table].get(r.id);
    if (exists) await deleteEntity(type, r.id);
  }
  for (const p of proposal.previous ?? []) {
    const exists = await (db as unknown as Record<string, { get(id: string): Promise<unknown> }>)[p.table].get(p.id);
    if (!exists) continue;
    if (p.table === 'scenes') await updateScene(p.id, p.values as Partial<Scene>);
    else await updateRecord(p.table as ProjectTable, p.id, p.values, { silent: true });
  }
  if (proposal.backupVersionId) await restoreVersion(proposal.backupVersionId);
  await logActivity({
    projectId,
    action: 'restored',
    entityType: 'project',
    entityId: projectId,
    summary: `Undid assistant suggestion: ${proposalSummary(proposal)}`,
  });
  return { ...proposal, status: 'pending', resolvedAt: undefined, createdRecords: undefined, previous: undefined, backupVersionId: undefined };
}
