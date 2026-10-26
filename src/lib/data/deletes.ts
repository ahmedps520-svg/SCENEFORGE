import { db, PROJECT_TABLES, table, type ProjectTable } from '../db';
import type { Asset, EntityType } from '../types';
import { ENTITY_NOUN, logActivity, recordLabel, restoreSnapshot, touchProject, type Restore, type Snapshot } from './crud';

type TableName = ProjectTable | 'projects' | 'blobs' | 'thumbs';

/**
 * Collects every row a delete will remove or modify, applies the change in one
 * transaction, and can put everything back exactly as it was (Undo).
 */
class ChangeSet {
  private snap: Snapshot = {};
  private seen = new Set<string>();
  private deletes: [TableName, string][] = [];
  private edits: [TableName, string, Record<string, unknown>][] = [];

  private remember(name: TableName, row: { id: string }) {
    const key = `${name}:${row.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    (this.snap[name] ??= []).push(structuredClone(row));
  }

  del(name: TableName, rows: { id: string }[]) {
    for (const r of rows) {
      this.remember(name, r);
      this.deletes.push([name, r.id]);
    }
  }

  edit(name: TableName, row: { id: string }, patch: Record<string, unknown>) {
    this.remember(name, row);
    this.edits.push([name, row.id, patch]);
  }

  async commit() {
    const names = [...new Set([...this.deletes.map((d) => d[0]), ...this.edits.map((e) => e[0])])];
    if (!names.length) return;
    await db.transaction('rw', names.map((n) => table(n as ProjectTable)), async () => {
      for (const [name, id, patch] of this.edits) await table(name as ProjectTable).update(id, patch);
      for (const [name, id] of this.deletes) await table(name as ProjectTable).delete(id);
    });
  }

  restorer(projectId?: string, summary?: string): Restore {
    const snap = this.snap;
    return () => restoreSnapshot(snap, projectId, summary);
  }
}

async function rows<T = any>(name: ProjectTable, projectId: string): Promise<T[]> {
  return table(name).where('projectId').equals(projectId).toArray();
}

const without = (list: string[] | undefined, id: string) => (list ?? []).filter((x) => x !== id);

async function stripAssetLinks(cs: ChangeSet, projectId: string, key: keyof Asset['links'], ids: string[]) {
  if (!ids.length) return;
  const set = new Set(ids);
  for (const a of await rows<Asset>('assets', projectId)) {
    if (a.links[key].some((x) => set.has(x))) {
      cs.edit('assets', a, { links: { ...a.links, [key]: a.links[key].filter((x) => !set.has(x)) } });
    }
  }
}

async function deleteComments(cs: ChangeSet, projectId: string, entityIds: string[]) {
  const set = new Set(entityIds);
  cs.del('comments', (await rows('comments', projectId)).filter((c) => set.has(c.entityId)));
}

async function planScene(cs: ChangeSet, s: any) {
  if (s.inScript) {
    throw new Error('This scene is part of the script. Remove its heading in the script editor first — that keeps your writing safe.');
  }
  const p = s.projectId;
  const frames = (await rows('frames', p)).filter((f) => f.sceneId === s.id);
  const shots = (await rows('shots', p)).filter((x) => x.sceneId === s.id);
  cs.del('scenes', [s]);
  cs.del('frames', frames);
  cs.del('shots', shots);
  for (const it of await rows('items', p)) if (it.sceneIds.includes(s.id)) cs.edit('items', it, { sceneIds: without(it.sceneIds, s.id) });
  for (const e of await rows('events', p)) if (e.sceneIds.includes(s.id)) cs.edit('events', e, { sceneIds: without(e.sceneIds, s.id) });
  for (const t of await rows('tasks', p)) if (t.sceneId === s.id) cs.edit('tasks', t, { sceneId: undefined });
  await stripAssetLinks(cs, p, 'sceneIds', [s.id]);
  await stripAssetLinks(cs, p, 'frameIds', frames.map((f) => f.id));
  await deleteComments(cs, p, [s.id, ...frames.map((f) => f.id), ...shots.map((x) => x.id)]);
  return `Deleted scene “${recordLabel(s)}” with ${frames.length} frame${frames.length === 1 ? '' : 's'} and ${shots.length} shot${shots.length === 1 ? '' : 's'}`;
}

async function planCharacter(cs: ChangeSet, c: any) {
  const p = c.projectId;
  cs.del('characters', [c]);
  for (const s of await rows('scenes', p)) if (s.characterIds.includes(c.id)) cs.edit('scenes', s, { characterIds: without(s.characterIds, c.id) });
  for (const s of await rows('shots', p)) if (s.characterIds.includes(c.id)) cs.edit('shots', s, { characterIds: without(s.characterIds, c.id) });
  cs.del('relationships', (await rows('relationships', p)).filter((r) => r.fromId === c.id || r.toId === c.id));
  for (const it of await rows('items', p)) if (it.characterId === c.id) cs.edit('items', it, { characterId: undefined });
  await stripAssetLinks(cs, p, 'characterIds', [c.id]);
  await deleteComments(cs, p, [c.id]);
  return `Deleted character “${recordLabel(c)}” (script dialogue was kept)`;
}

async function planLocation(cs: ChangeSet, l: any) {
  const p = l.projectId;
  cs.del('locations', [l]);
  for (const s of await rows('scenes', p)) if (s.locationId === l.id) cs.edit('scenes', s, { locationId: undefined });
  for (const e of await rows('events', p)) if (e.locationId === l.id) cs.edit('events', e, { locationId: undefined });
  for (const t of await rows('tasks', p)) if (t.locationId === l.id) cs.edit('tasks', t, { locationId: undefined });
  await stripAssetLinks(cs, p, 'locationIds', [l.id]);
  await deleteComments(cs, p, [l.id]);
  return `Deleted location “${recordLabel(l)}”`;
}

async function planPerson(cs: ChangeSet, person: any) {
  const p = person.projectId;
  cs.del('people', [person]);
  for (const c of await rows('characters', p)) if (c.actorId === person.id) cs.edit('characters', c, { actorId: undefined });
  for (const it of await rows('items', p)) if (it.responsibleId === person.id) cs.edit('items', it, { responsibleId: undefined });
  for (const t of await rows('tasks', p)) if (t.assigneeId === person.id) cs.edit('tasks', t, { assigneeId: undefined });
  for (const e of await rows('events', p)) if (e.personIds.includes(person.id)) cs.edit('events', e, { personIds: without(e.personIds, person.id) });
  await deleteComments(cs, p, [person.id]);
  return `Removed “${recordLabel(person)}” from cast and crew`;
}

async function planEvent(cs: ChangeSet, e: any) {
  cs.del('events', [e]);
  for (const s of await rows('shots', e.projectId)) if (s.eventId === e.id) cs.edit('shots', s, { eventId: undefined });
  return `Deleted schedule event “${recordLabel(e) || e.date}”`;
}

async function planShot(cs: ChangeSet, s: any) {
  cs.del('shots', [s]);
  for (const f of await rows('frames', s.projectId)) if (f.shotId === s.id) cs.edit('frames', f, { shotId: undefined });
  await deleteComments(cs, s.projectId, [s.id]);
  return `Deleted shot${s.code ? ` ${s.code}` : ''}${s.description ? ` “${recordLabel({ name: s.description })}”` : ''}`;
}

async function planFrame(cs: ChangeSet, f: any) {
  cs.del('frames', [f]);
  await stripAssetLinks(cs, f.projectId, 'frameIds', [f.id]);
  await deleteComments(cs, f.projectId, [f.id]);
  return 'Deleted storyboard frame';
}

async function planAsset(cs: ChangeSet, a: Asset) {
  const p = a.projectId;
  cs.del('assets', [a]);
  const blob = await db.blobs.get(a.id);
  if (blob) cs.del('blobs', [blob]);
  const thumb = await db.thumbs.get(a.id);
  if (thumb) cs.del('thumbs', [thumb]);
  const project = await db.projects.get(p);
  if (project?.coverAssetId === a.id) cs.edit('projects', project, { coverAssetId: undefined });
  for (const c of await rows('characters', p)) if (c.portraitAssetId === a.id) cs.edit('characters', c, { portraitAssetId: undefined });
  for (const f of await rows('frames', p)) if (f.imageAssetId === a.id) cs.edit('frames', f, { imageAssetId: undefined });
  for (const l of await rows('locations', p)) if (l.photoAssetIds.includes(a.id)) cs.edit('locations', l, { photoAssetIds: without(l.photoAssetIds, a.id) });
  for (const it of await rows('items', p)) if (it.photoAssetId === a.id) cs.edit('items', it, { photoAssetId: undefined });
  for (const pe of await rows('people', p)) if (pe.photoAssetId === a.id) cs.edit('people', pe, { photoAssetId: undefined });
  for (const t of await rows('tasks', p)) if (t.assetId === a.id) cs.edit('tasks', t, { assetId: undefined });
  return `Deleted asset “${a.name}”`;
}

async function planSimple(cs: ChangeSet, name: ProjectTable, rec: any, entityType: EntityType) {
  cs.del(name, [rec]);
  await deleteComments(cs, rec.projectId, [rec.id]);
  const label = recordLabel(rec);
  return `Deleted ${ENTITY_NOUN[entityType]}${label ? ` “${label}”` : ''}`;
}

const TABLE_OF: Record<Exclude<EntityType, 'project' | 'script'>, ProjectTable> = {
  scene: 'scenes',
  frame: 'frames',
  shot: 'shots',
  character: 'characters',
  relationship: 'relationships',
  location: 'locations',
  item: 'items',
  person: 'people',
  event: 'events',
  task: 'tasks',
  asset: 'assets',
};

export interface DeleteResult {
  summary: string;
  restore: Restore;
}

/**
 * Delete a record and clean up every reference to it, returning a function
 * that restores all affected rows. Script text is never modified.
 */
export async function deleteEntity(type: Exclude<EntityType, 'project' | 'script'>, id: string): Promise<DeleteResult> {
  const name = TABLE_OF[type];
  const rec = await table(name).get(id);
  if (!rec) throw new Error(`That ${ENTITY_NOUN[type]} was already deleted.`);
  const cs = new ChangeSet();
  let summary: string;
  switch (type) {
    case 'scene':
      summary = await planScene(cs, rec);
      break;
    case 'character':
      summary = await planCharacter(cs, rec);
      break;
    case 'location':
      summary = await planLocation(cs, rec);
      break;
    case 'person':
      summary = await planPerson(cs, rec);
      break;
    case 'event':
      summary = await planEvent(cs, rec);
      break;
    case 'shot':
      summary = await planShot(cs, rec);
      break;
    case 'frame':
      summary = await planFrame(cs, rec);
      break;
    case 'asset':
      summary = await planAsset(cs, rec);
      break;
    default:
      summary = await planSimple(cs, name, rec, type);
  }
  await cs.commit();
  await touchProject(rec.projectId);
  await logActivity({ projectId: rec.projectId, action: 'deleted', entityType: type, entityId: id, summary });
  return { summary, restore: cs.restorer(rec.projectId, `Undid: ${summary}`) };
}

/** Delete a whole project and everything in it. */
export async function deleteProject(projectId: string): Promise<DeleteResult> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('That project was already deleted.');
  const cs = new ChangeSet();
  cs.del('projects', [project]);
  for (const name of PROJECT_TABLES) cs.del(name, await rows(name, projectId));
  const assetIds = (await rows<Asset>('assets', projectId)).map((a) => a.id);
  cs.del('blobs', (await db.blobs.bulkGet(assetIds)).filter((b): b is NonNullable<typeof b> => !!b));
  cs.del('thumbs', (await db.thumbs.bulkGet(assetIds)).filter((b): b is NonNullable<typeof b> => !!b));
  await cs.commit();
  return { summary: `Deleted “${project.title}”`, restore: cs.restorer() };
}
