import { db, table, type ProjectTable } from '../db';
import { uid } from '../ids';
import type { Activity, EntityType } from '../types';
import { actorName } from './settings';

export const ENTITY_OF_TABLE: Partial<Record<ProjectTable, EntityType>> = {
  scripts: 'script',
  scenes: 'scene',
  frames: 'frame',
  shots: 'shot',
  characters: 'character',
  relationships: 'relationship',
  locations: 'location',
  items: 'item',
  people: 'person',
  events: 'event',
  tasks: 'task',
  assets: 'asset',
};

export const ENTITY_NOUN: Record<EntityType, string> = {
  project: 'project',
  script: 'draft',
  scene: 'scene',
  frame: 'storyboard frame',
  shot: 'shot',
  character: 'character',
  relationship: 'relationship',
  location: 'location',
  item: 'item',
  person: 'team member',
  event: 'schedule event',
  task: 'task',
  asset: 'asset',
};

/** A human label for any record, used in activity history and toasts. */
export function recordLabel(rec: Record<string, unknown> | undefined): string {
  if (!rec) return '';
  const v = rec.name ?? rec.title ?? rec.heading ?? rec.code ?? rec.label ?? rec.description ?? rec.action ?? '';
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s.length > 60 ? s.slice(0, 59) + '…' : s;
}

// ─── Activity history ───────────────────────────────────────────────────────

const COALESCE_MS = 2 * 60 * 1000;
const lastUpdate = new Map<string, { activityId: string; at: number }>();

export async function logActivity(a: Omit<Activity, 'id' | 'at' | 'actor'> & { actor?: string }) {
  const at = Date.now();
  // Rapid edits to the same record collapse into one history entry.
  if (a.action === 'updated') {
    const prev = lastUpdate.get(a.entityId);
    if (prev && at - prev.at < COALESCE_MS) {
      await db.activity.update(prev.activityId, { at, summary: a.summary });
      lastUpdate.set(a.entityId, { activityId: prev.activityId, at });
      return;
    }
  }
  const row: Activity = { id: uid(), at, actor: a.actor ?? actorName(), ...a };
  await db.activity.add(row);
  if (a.action === 'updated') lastUpdate.set(a.entityId, { activityId: row.id, at });
  else lastUpdate.delete(a.entityId);
}

/** Mark the project as edited now (drives "last edited" on the dashboard). */
export async function touchProject(projectId: string) {
  await db.projects.update(projectId, { updatedAt: Date.now() });
}

// ─── Generic writes ─────────────────────────────────────────────────────────

interface WriteOpts {
  /** Overrides the generated activity summary. */
  summary?: string;
  /** Skip activity logging (bulk/system writes). */
  silent?: boolean;
}

export async function createRecord<T extends { id: string; projectId: string }>(
  name: ProjectTable,
  record: T,
  opts: WriteOpts = {},
): Promise<T> {
  await table(name).add(record);
  await touchProject(record.projectId);
  const entityType = ENTITY_OF_TABLE[name];
  if (entityType && !opts.silent) {
    const label = recordLabel(record as unknown as Record<string, unknown>);
    await logActivity({
      projectId: record.projectId,
      action: 'created',
      entityType,
      entityId: record.id,
      summary: opts.summary ?? `Created ${ENTITY_NOUN[entityType]}${label ? ` “${label}”` : ''}`,
    });
  }
  return record;
}

export async function updateRecord<T extends { projectId: string }>(
  name: ProjectTable,
  id: string,
  patch: Partial<T>,
  opts: WriteOpts = {},
): Promise<void> {
  const t = table(name);
  const existing = (await t.get(id)) as T | undefined;
  if (!existing) throw new Error(`That ${name.replace(/s$/, '')} no longer exists.`);
  await t.update(id, { ...patch, updatedAt: Date.now() });
  await touchProject(existing.projectId);
  const entityType = ENTITY_OF_TABLE[name];
  if (entityType && !opts.silent) {
    const label = recordLabel({ ...(existing as object), ...(patch as object) } as Record<string, unknown>);
    const fields = Object.keys(patch).filter((k) => k !== 'updatedAt');
    await logActivity({
      projectId: existing.projectId,
      action: 'updated',
      entityType,
      entityId: id,
      summary: opts.summary ?? `Edited ${ENTITY_NOUN[entityType]}${label ? ` “${label}”` : ''}${fields.length && fields.length <= 3 ? ` (${fields.map(humanField).join(', ')})` : ''}`,
    });
  }
}

const FIELD_NAMES: Record<string, string> = {
  characterIds: 'characters',
  locationId: 'location',
  sceneIds: 'scenes',
  personIds: 'people',
  actorId: 'actor',
  assigneeId: 'assignee',
  photoAssetIds: 'photos',
  portraitAssetId: 'portrait',
  imageAssetId: 'image',
  unavailableDates: 'availability',
  estDurationSec: 'duration',
  propsNotes: 'props',
  wardrobeNotes: 'wardrobe',
  sfxNotes: 'effects',
  timeOfDay: 'time of day',
  intExt: 'INT/EXT',
  shotType: 'shot type',
  frameRate: 'frame rate',
  durationMin: 'duration',
  startTime: 'start time',
};

function humanField(k: string): string {
  return FIELD_NAMES[k] ?? k.replace(/([A-Z])/g, ' $1').toLowerCase();
}

// ─── Undo support ───────────────────────────────────────────────────────────

/** Rows as they were before a change, keyed by table. */
export type Snapshot = Partial<Record<ProjectTable | 'projects' | 'blobs' | 'thumbs', any[]>>;

/** Put every snapshot row back exactly as it was. */
export async function restoreSnapshot(snap: Snapshot, projectId?: string, summary?: string) {
  const names = Object.keys(snap) as (keyof Snapshot)[];
  await db.transaction('rw', names.map((n) => (db as any)[n]), async () => {
    for (const n of names) {
      const rows = snap[n];
      if (rows?.length) await (db as any)[n].bulkPut(rows);
    }
  });
  if (projectId && summary) {
    await logActivity({ projectId, action: 'restored', entityType: 'project', entityId: projectId, summary });
  }
}

export type Restore = () => Promise<void>;
