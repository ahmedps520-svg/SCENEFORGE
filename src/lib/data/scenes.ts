import { db } from '../db';
import { uid } from '../ids';
import { buildHeading, parseHeading } from '../screenplay/heading';
import { moveSceneBlock } from '../screenplay/sync';
import type { Scene, ScriptElement } from '../types';
import { createRecord, updateRecord } from './crud';
import { makeScene } from './factories';
import { getPrimaryScript, saveScript } from './scripts';

export async function createScene(projectId: string, p: Partial<Scene> = {}): Promise<Scene> {
  const scenes = await db.scenes.where('projectId').equals(projectId).toArray();
  const intExt = p.intExt ?? 'INT';
  const locationName = (p.locationName ?? '').toUpperCase();
  const timeOfDay = (p.timeOfDay ?? 'DAY').toUpperCase();
  const scene = makeScene(projectId, {
    order: scenes.reduce((m, s) => Math.max(m, s.order), -1) + 1,
    productionOrder: scenes.reduce((m, s) => Math.max(m, s.productionOrder), -1) + 1,
    ...p,
    intExt,
    locationName,
    timeOfDay,
    heading: p.heading ?? buildHeading(intExt, locationName, timeOfDay),
    inScript: false,
  });
  return createRecord('scenes', scene);
}

const HEADING_FIELDS = ['heading', 'intExt', 'locationName', 'timeOfDay'] as const;

/**
 * Update a scene. Heading edits made here are written back into the production
 * draft, so the script and the breakdown never disagree.
 */
export async function updateScene(sceneId: string, patch: Partial<Scene>) {
  const scene = await db.scenes.get(sceneId);
  if (!scene) throw new Error('This scene no longer exists.');
  const next: Partial<Scene> = { ...patch };

  if (HEADING_FIELDS.some((f) => f in patch)) {
    if ('heading' in patch && patch.heading !== undefined) {
      const h = patch.heading.trim().toUpperCase();
      Object.assign(next, { heading: h, ...parseHeading(h) });
    } else {
      const intExt = patch.intExt ?? scene.intExt;
      const loc = (patch.locationName ?? scene.locationName).toUpperCase();
      const time = (patch.timeOfDay ?? scene.timeOfDay).toUpperCase();
      Object.assign(next, { intExt, locationName: loc, timeOfDay: time, heading: buildHeading(intExt, loc, time) });
    }
  }

  await updateRecord<Scene>('scenes', sceneId, next);

  if (next.heading !== undefined && next.heading !== scene.heading && scene.inScript) {
    const script = await getPrimaryScript(scene.projectId);
    if (script) {
      const elements = script.elements.map((e) =>
        e.type === 'scene' && e.sceneId === sceneId ? { ...e, text: next.heading! } : e,
      );
      await saveScript(script.id, elements, { summary: `Updated scene heading to “${next.heading}”` });
    }
  }
}

/** Insert a scene that only exists in the breakdown into the production draft. */
export async function addSceneToScript(sceneId: string): Promise<void> {
  const scene = await db.scenes.get(sceneId);
  if (!scene) throw new Error('This scene no longer exists.');
  const script = await getPrimaryScript(scene.projectId);
  if (!script) throw new Error('This project has no draft yet.');
  const scenes = await db.scenes.where('projectId').equals(scene.projectId).toArray();
  const heading: ScriptElement = { id: uid(), type: 'scene', text: scene.heading || buildHeading(scene.intExt, scene.locationName, scene.timeOfDay), sceneId };
  const body: ScriptElement = { id: uid(), type: 'action', text: scene.summary };

  // Insert before the first scripted scene that comes later in story order.
  const later = scenes
    .filter((s) => s.inScript && s.order > scene.order)
    .sort((a, b) => a.order - b.order)[0];
  // A brand-new draft holds a single empty heading; replace it rather than append after it.
  const isBlank = script.elements.length === 1 && !script.elements[0].text.trim();
  const elements = isBlank ? [] : script.elements;
  const idx = later ? elements.findIndex((e) => e.type === 'scene' && e.sceneId === later.id) : -1;
  const next = idx >= 0 ? [...elements.slice(0, idx), heading, body, ...elements.slice(idx)] : [...elements, heading, body];
  await saveScript(script.id, next, { summary: `Added “${heading.text}” to the script` });
}

/**
 * Reorder scenes. In story order, scenes that are in the script are moved in
 * the production draft (whole scene blocks), which re-numbers the breakdown.
 */
export async function reorderScenes(projectId: string, orderedIds: string[], mode: 'story' | 'production') {
  const scenes = await db.scenes.where('projectId').equals(projectId).toArray();
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const t = Date.now();

  if (mode === 'production') {
    await db.transaction('rw', db.scenes, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const s = byId.get(orderedIds[i]);
        if (s && s.productionOrder !== i) await db.scenes.update(s.id, { productionOrder: i, updatedAt: t });
      }
    });
    await db.projects.update(projectId, { updatedAt: t });
    return;
  }

  const scripted = orderedIds.filter((id) => byId.get(id)?.inScript);
  const unscripted = orderedIds.filter((id) => !byId.get(id)?.inScript);
  const script = await getPrimaryScript(projectId);
  if (script && scripted.length) {
    let elements = script.elements;
    // Rebuild by moving each block to the end in the requested order.
    for (const id of scripted) elements = moveSceneBlock(elements, id, undefined);
    await saveScript(script.id, elements, { summary: 'Reordered scenes' });
  }
  // Scenes outside the script keep their relative order after the scripted ones.
  const base = scripted.length;
  await db.transaction('rw', db.scenes, async () => {
    for (let i = 0; i < unscripted.length; i++) {
      await db.scenes.update(unscripted[i], { order: base + i, updatedAt: t });
    }
  });
}
