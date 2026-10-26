import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { uid } from '../ids';
import type { ScriptElement } from '../types';
import { exportProject, importProjectFile } from './backup';
import { createRecord } from './crud';
import { deleteEntity, deleteProject } from './deletes';
import { makeCharacter, makeFrame, makeShot } from './factories';
import { createProject } from './projects';
import { addSceneToScript, createScene, reorderScenes, updateScene } from './scenes';
import { createDraft, restoreVersion, saveScript, saveVersion, setPrimaryDraft } from './scripts';

const el = (type: ScriptElement['type'], text: string, sceneId?: string): ScriptElement => ({ id: uid(), type, text, ...(sceneId ? { sceneId } : {}) });

async function setup() {
  const project = await createProject({ title: 'Night Shift', you: { name: 'Sam', role: 'Director' } });
  await createRecord('characters', makeCharacter(project.id, { name: 'Mara' }));
  const script = (await db.scripts.get(project.primaryScriptId!))!;
  const elements = [
    el('scene', 'INT. DINER - NIGHT', uid()),
    el('action', 'Rain on neon.'),
    el('character', 'MARA'),
    el('dialogue', 'Coffee?'),
    el('scene', 'EXT. PARKING LOT - NIGHT', uid()),
    el('action', 'A car idles.'),
  ];
  await saveScript(script.id, elements);
  return { project, scriptId: script.id };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('project + script sync', () => {
  it('creates scenes from the production draft and links characters', async () => {
    const { project } = await setup();
    const scenes = await db.scenes.where('projectId').equals(project.id).sortBy('order');
    expect(scenes.map((s) => s.heading)).toEqual(['INT. DINER - NIGHT', 'EXT. PARKING LOT - NIGHT']);
    const mara = (await db.characters.where('projectId').equals(project.id).first())!;
    expect(scenes[0].characterIds).toEqual([mara.id]);
    const people = await db.people.where('projectId').equals(project.id).toArray();
    expect(people[0]).toMatchObject({ name: 'Sam', accessRole: 'owner', isYou: true });
  });

  it('writes heading edits from the scene manager back into the script', async () => {
    const { project, scriptId } = await setup();
    const [first] = await db.scenes.where('projectId').equals(project.id).sortBy('order');
    await updateScene(first.id, { timeOfDay: 'DAWN' });
    const script = (await db.scripts.get(scriptId))!;
    expect(script.elements[0].text).toBe('INT. DINER - DAWN');
    expect((await db.scenes.get(first.id))!.heading).toBe('INT. DINER - DAWN');
  });

  it('reorders scenes by moving script blocks', async () => {
    const { project, scriptId } = await setup();
    const scenes = await db.scenes.where('projectId').equals(project.id).sortBy('order');
    await reorderScenes(project.id, [scenes[1].id, scenes[0].id], 'story');
    const script = (await db.scripts.get(scriptId))!;
    expect(script.elements[0].text).toBe('EXT. PARKING LOT - NIGHT');
    expect(script.elements[1].text).toBe('A car idles.');
    const after = await db.scenes.where('projectId').equals(project.id).sortBy('order');
    expect(after.map((s) => s.id)).toEqual([scenes[1].id, scenes[0].id]);
  });

  it('keeps removed headings as "not in script" and refuses to delete scripted scenes', async () => {
    const { project, scriptId } = await setup();
    const scenes = await db.scenes.where('projectId').equals(project.id).sortBy('order');
    await expect(deleteEntity('scene', scenes[0].id)).rejects.toThrow(/part of the script/);
    const script = (await db.scripts.get(scriptId))!;
    await saveScript(scriptId, script.elements.slice(0, 4));
    const orphan = (await db.scenes.get(scenes[1].id))!;
    expect(orphan.inScript).toBe(false);
    await addSceneToScript(orphan.id);
    expect((await db.scenes.get(orphan.id))!.inScript).toBe(true);
  });

  it('manual scenes can be added to the script', async () => {
    const { project, scriptId } = await setup();
    const s = await createScene(project.id, { intExt: 'EXT', locationName: 'Rooftop', timeOfDay: 'Dawn', summary: 'They watch the sun.' });
    expect(s.heading).toBe('EXT. ROOFTOP - DAWN');
    await addSceneToScript(s.id);
    const script = (await db.scripts.get(scriptId))!;
    expect(script.elements.some((e) => e.sceneId === s.id)).toBe(true);
  });
});

describe('deletes', () => {
  it('cascades a character delete and restores it on undo, leaving dialogue intact', async () => {
    const { project, scriptId } = await setup();
    const mara = (await db.characters.where('projectId').equals(project.id).first())!;
    const [scene] = await db.scenes.where('projectId').equals(project.id).sortBy('order');
    await createRecord('shots', makeShot(project.id, scene.id, { characterIds: [mara.id] }));
    const { restore } = await deleteEntity('character', mara.id);
    expect(await db.characters.get(mara.id)).toBeUndefined();
    expect((await db.scenes.get(scene.id))!.characterIds).toEqual([]);
    expect((await db.scripts.get(scriptId))!.elements.some((e) => e.text === 'MARA')).toBe(true);
    await restore();
    expect(await db.characters.get(mara.id)).toBeDefined();
    expect((await db.scenes.get(scene.id))!.characterIds).toEqual([mara.id]);
  });

  it('deletes an orphan scene with its frames and shots, and undoes it', async () => {
    const { project } = await setup();
    const s = await createScene(project.id, { locationName: 'Alley' });
    await createRecord('frames', makeFrame(project.id, s.id));
    await createRecord('shots', makeShot(project.id, s.id));
    const { restore } = await deleteEntity('scene', s.id);
    expect(await db.frames.where('sceneId').equals(s.id).count()).toBe(0);
    await restore();
    expect(await db.frames.where('sceneId').equals(s.id).count()).toBe(1);
    expect(await db.shots.where('sceneId').equals(s.id).count()).toBe(1);
  });

  it('deletes and restores a whole project', async () => {
    const { project } = await setup();
    const { restore } = await deleteProject(project.id);
    expect(await db.projects.get(project.id)).toBeUndefined();
    expect(await db.scenes.where('projectId').equals(project.id).count()).toBe(0);
    await restore();
    expect(await db.scenes.where('projectId').equals(project.id).count()).toBe(2);
  });
});

describe('drafts and versions', () => {
  it('restoring a version keeps the current text as a version', async () => {
    const { scriptId } = await setup();
    const v = await saveVersion(scriptId, 'Table read');
    const script = (await db.scripts.get(scriptId))!;
    await saveScript(scriptId, [...script.elements, el('action', 'New ending.')]);
    await restoreVersion(v.id);
    const versions = await db.scriptVersions.where('scriptId').equals(scriptId).toArray();
    expect(versions.some((x) => x.label.startsWith('Before restoring'))).toBe(true);
    expect((await db.scripts.get(scriptId))!.elements.some((e) => e.text === 'New ending.')).toBe(false);
  });

  it('duplicated drafts keep scene links and can become the production draft', async () => {
    const { project, scriptId } = await setup();
    const copy = await createDraft(project.id, { fromScriptId: scriptId });
    const ids = copy.elements.filter((e) => e.type === 'scene').map((e) => e.sceneId);
    const original = (await db.scripts.get(scriptId))!.elements.filter((e) => e.type === 'scene').map((e) => e.sceneId);
    expect(ids).toEqual(original);
    await setPrimaryDraft(project.id, copy.id);
    expect((await db.projects.get(project.id))!.primaryScriptId).toBe(copy.id);
  });
});

describe('backup', () => {
  it('exports and imports a project as an independent copy', async () => {
    const { project } = await setup();
    const { blob } = await exportProject(project.id, { stripPrivate: true });
    const imported = await importProjectFile(blob);
    expect(imported.id).not.toBe(project.id);
    expect(imported.title).toBe('Night Shift (imported)');
    const scenes = await db.scenes.where('projectId').equals(imported.id).sortBy('order');
    expect(scenes).toHaveLength(2);
    const script = (await db.scripts.get(imported.primaryScriptId!))!;
    const headingIds = script.elements.filter((e) => e.type === 'scene').map((e) => e.sceneId);
    expect(headingIds).toEqual(scenes.map((s) => s.id));
    const original = await db.scenes.where('projectId').equals(project.id).toArray();
    expect(original.map((s) => s.id).some((id) => headingIds.includes(id))).toBe(false);
  });
});
