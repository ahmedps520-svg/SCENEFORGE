import { db } from '../db';
import { SESSION_ID, uid } from '../ids';
import { scriptStats } from '../screenplay/paginate';
import { normalizeElements, planSceneSync } from '../screenplay/sync';
import type { RevisionColor, Script, ScriptElement, ScriptVersion } from '../types';
import { logActivity, touchProject, type Restore } from './crud';
import { makeScript } from './factories';
import { settingsSnapshot } from './settings';

const AUTO_VERSION_EVERY_MS = 10 * 60 * 1000;
const MAX_AUTO_VERSIONS = 60;

function sameElements(a: ScriptElement[], b: ScriptElement[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type || a[i].text !== b[i].text) return false;
  }
  return true;
}

/**
 * Bring the scene breakdown in line with the production draft.
 * Returns character cue names that match no character profile.
 */
export async function syncScenes(projectId: string, elements: ScriptElement[]): Promise<string[]> {
  const [scenes, characters, locations] = await Promise.all([
    db.scenes.where('projectId').equals(projectId).toArray(),
    db.characters.where('projectId').equals(projectId).toArray(),
    db.locations.where('projectId').equals(projectId).toArray(),
  ]);
  const plan = planSceneSync({
    projectId,
    elements,
    scenes,
    characters,
    locations,
    pageSize: settingsSnapshot().editor.pageSize,
  });
  if (plan.creates.length || plan.updates.length) {
    const t = Date.now();
    await db.transaction('rw', db.scenes, async () => {
      if (plan.creates.length) await db.scenes.bulkAdd(plan.creates.map((s) => ({ ...s, createdAt: t, updatedAt: t })));
      for (const u of plan.updates) await db.scenes.update(u.id, { ...u.patch, updatedAt: t });
    });
  }
  return plan.unknownCues;
}

export interface SaveResult {
  elements: ScriptElement[];
  unknownCues: string[];
}

/**
 * Persist a draft. Normalises scene ids, refreshes stats, keeps periodic
 * automatic versions and, for the production draft, syncs the scene list.
 */
export async function saveScript(
  scriptId: string,
  elements: ScriptElement[],
  opts: { summary?: string; skipVersioning?: boolean } = {},
): Promise<SaveResult> {
  const script = await db.scripts.get(scriptId);
  if (!script) throw new Error('This draft no longer exists.');
  const normalized = normalizeElements(elements);
  const stats = scriptStats(normalized, settingsSnapshot().editor.pageSize);

  if (!opts.skipVersioning && !sameElements(script.elements, normalized)) {
    await maybeAutoVersion(script);
  }

  await db.scripts.update(scriptId, {
    elements: normalized,
    wordCount: stats.wordCount,
    pageCount: stats.pageCount,
    updatedAt: Date.now(),
    lastWriter: SESSION_ID,
  });
  await touchProject(script.projectId);
  await logActivity({
    projectId: script.projectId,
    action: 'updated',
    entityType: 'script',
    entityId: scriptId,
    summary: opts.summary ?? `Edited draft “${script.title}” (${stats.pageCount} pages)`,
  });

  const project = await db.projects.get(script.projectId);
  let unknownCues: string[] = [];
  if (project?.primaryScriptId === scriptId) unknownCues = await syncScenes(script.projectId, normalized);
  return { elements: normalized, unknownCues };
}

async function maybeAutoVersion(script: Script) {
  const versions = await db.scriptVersions.where('scriptId').equals(script.id).sortBy('createdAt');
  const last = versions[versions.length - 1];
  if (last && Date.now() - last.createdAt < AUTO_VERSION_EVERY_MS) return;
  if (!script.elements.some((e) => e.text.trim())) return;
  if (last && sameElements(last.elements, script.elements)) return;
  await db.scriptVersions.add({
    id: uid(),
    projectId: script.projectId,
    scriptId: script.id,
    label: 'Autosave',
    revisionColor: script.revisionColor,
    elements: script.elements,
    wordCount: script.wordCount,
    pageCount: script.pageCount,
    auto: true,
    createdAt: Date.now(),
  });
  const autos = versions.filter((v) => v.auto);
  if (autos.length >= MAX_AUTO_VERSIONS) {
    await db.scriptVersions.bulkDelete(autos.slice(0, autos.length - MAX_AUTO_VERSIONS + 1).map((v) => v.id));
  }
}

/** Save a named version the writer chose to keep. */
export async function saveVersion(scriptId: string, label: string, revisionColor?: RevisionColor): Promise<ScriptVersion> {
  const script = await db.scripts.get(scriptId);
  if (!script) throw new Error('This draft no longer exists.');
  const v: ScriptVersion = {
    id: uid(),
    projectId: script.projectId,
    scriptId,
    label: label.trim() || 'Saved version',
    revisionColor: revisionColor ?? script.revisionColor,
    elements: script.elements,
    wordCount: script.wordCount,
    pageCount: script.pageCount,
    auto: false,
    createdAt: Date.now(),
  };
  await db.scriptVersions.add(v);
  if (revisionColor && revisionColor !== script.revisionColor) {
    await db.scripts.update(scriptId, { revisionColor, updatedAt: Date.now() });
  }
  await logActivity({
    projectId: script.projectId,
    action: 'created',
    entityType: 'script',
    entityId: scriptId,
    summary: `Saved version “${v.label}” of “${script.title}”`,
  });
  return v;
}

/**
 * Replace the draft with an earlier version. The current text is kept as a
 * version first, so restoring never loses writing.
 */
export async function restoreVersion(versionId: string): Promise<SaveResult> {
  const v = await db.scriptVersions.get(versionId);
  if (!v) throw new Error('That version no longer exists.');
  const script = await db.scripts.get(v.scriptId);
  if (!script) throw new Error('This draft no longer exists.');
  await db.scriptVersions.add({
    id: uid(),
    projectId: script.projectId,
    scriptId: script.id,
    label: `Before restoring “${v.label}”`,
    revisionColor: script.revisionColor,
    elements: script.elements,
    wordCount: script.wordCount,
    pageCount: script.pageCount,
    auto: false,
    createdAt: Date.now(),
  });
  return saveScript(script.id, v.elements, {
    skipVersioning: true,
    summary: `Restored “${script.title}” to version “${v.label}”`,
  });
}

export async function createDraft(projectId: string, opts: { title?: string; fromScriptId?: string } = {}): Promise<Script> {
  const project = await db.projects.get(projectId);
  const source = opts.fromScriptId ? await db.scripts.get(opts.fromScriptId) : undefined;
  const record = makeScript(projectId, {
    title: opts.title?.trim() || (source ? `${source.title} (copy)` : 'New Draft'),
    revisionColor: source?.revisionColor ?? 'white',
    titlePage: source
      ? { ...source.titlePage }
      : { title: project?.title ?? '', credit: 'Written by', author: settingsSnapshot().userName, source: '', draftDate: '', contact: '' },
    // Copies keep the same scene ids so the breakdown follows whichever draft is in production.
    ...(source
      ? { elements: source.elements.map((e) => ({ ...e, id: uid() })), wordCount: source.wordCount, pageCount: source.pageCount }
      : {}),
  });
  await db.scripts.add(record);
  await touchProject(projectId);
  await logActivity({
    projectId,
    action: 'created',
    entityType: 'script',
    entityId: record.id,
    summary: source ? `Duplicated “${source.title}” as “${record.title}”` : `Created draft “${record.title}”`,
  });
  return record;
}

export async function setPrimaryDraft(projectId: string, scriptId: string) {
  const script = await db.scripts.get(scriptId);
  if (!script) throw new Error('This draft no longer exists.');
  await db.projects.update(projectId, { primaryScriptId: scriptId, updatedAt: Date.now() });
  await syncScenes(projectId, script.elements);
  await logActivity({
    projectId,
    action: 'updated',
    entityType: 'script',
    entityId: scriptId,
    summary: `Made “${script.title}” the production draft`,
  });
}

export async function renameDraft(scriptId: string, title: string) {
  const t = title.trim();
  if (!t) throw new Error('A draft needs a name.');
  await db.scripts.update(scriptId, { title: t, updatedAt: Date.now() });
}

/** Delete a draft and its versions. The last remaining draft cannot be deleted. */
export async function deleteDraft(scriptId: string): Promise<Restore> {
  const script = await db.scripts.get(scriptId);
  if (!script) throw new Error('This draft no longer exists.');
  const drafts = await db.scripts.where('projectId').equals(script.projectId).toArray();
  if (drafts.length <= 1) throw new Error('A project needs at least one draft.');
  const versions = await db.scriptVersions.where('scriptId').equals(scriptId).toArray();
  const project = await db.projects.get(script.projectId);
  const wasPrimary = project?.primaryScriptId === scriptId;
  const fallback = drafts.filter((d) => d.id !== scriptId).sort((a, b) => b.updatedAt - a.updatedAt)[0];

  await db.transaction('rw', db.scripts, db.scriptVersions, db.projects, async () => {
    await db.scripts.delete(scriptId);
    await db.scriptVersions.bulkDelete(versions.map((v) => v.id));
    if (wasPrimary) await db.projects.update(script.projectId, { primaryScriptId: fallback.id });
  });
  if (wasPrimary) await syncScenes(script.projectId, fallback.elements);
  await logActivity({
    projectId: script.projectId,
    action: 'deleted',
    entityType: 'script',
    entityId: scriptId,
    summary: `Deleted draft “${script.title}”`,
  });
  return async () => {
    await db.transaction('rw', db.scripts, db.scriptVersions, db.projects, async () => {
      await db.scripts.put(script);
      await db.scriptVersions.bulkPut(versions);
      if (wasPrimary) await db.projects.update(script.projectId, { primaryScriptId: scriptId });
    });
    if (wasPrimary) await syncScenes(script.projectId, script.elements);
  };
}

export async function getPrimaryScript(projectId: string): Promise<Script | undefined> {
  const project = await db.projects.get(projectId);
  if (project?.primaryScriptId) {
    const s = await db.scripts.get(project.primaryScriptId);
    if (s) return s;
  }
  const drafts = await db.scripts.where('projectId').equals(projectId).sortBy('createdAt');
  return drafts[0];
}
