import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  Asset,
  AssetBlob,
  AssistantThread,
  Character,
  Comment,
  Item,
  Location,
  Person,
  Project,
  Relationship,
  Scene,
  ScheduleEvent,
  Script,
  ScriptVersion,
  Shot,
  StoryboardFrame,
  Task,
} from './types';

export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * All project data lives in IndexedDB, in the browser profile of this device.
 * Uploaded files are stored as Blobs (table `blobs`), not as temporary object URLs,
 * so they survive reloads and restarts.
 */
export class SceneforgeDB extends Dexie {
  projects!: Table<Project, string>;
  scripts!: Table<Script, string>;
  scriptVersions!: Table<ScriptVersion, string>;
  scenes!: Table<Scene, string>;
  frames!: Table<StoryboardFrame, string>;
  shots!: Table<Shot, string>;
  characters!: Table<Character, string>;
  relationships!: Table<Relationship, string>;
  locations!: Table<Location, string>;
  items!: Table<Item, string>;
  people!: Table<Person, string>;
  events!: Table<ScheduleEvent, string>;
  tasks!: Table<Task, string>;
  assets!: Table<Asset, string>;
  blobs!: Table<AssetBlob, string>;
  thumbs!: Table<AssetBlob, string>;
  comments!: Table<Comment, string>;
  activity!: Table<Activity, string>;
  threads!: Table<AssistantThread, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'sceneforge') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt, lastOpenedAt',
      scripts: 'id, projectId, updatedAt',
      scriptVersions: 'id, scriptId, projectId, createdAt',
      scenes: 'id, projectId, order',
      frames: 'id, projectId, sceneId, order',
      shots: 'id, projectId, sceneId, order, eventId',
      characters: 'id, projectId, name',
      relationships: 'id, projectId, fromId, toId',
      locations: 'id, projectId',
      items: 'id, projectId, kind',
      people: 'id, projectId',
      events: 'id, projectId, date',
      tasks: 'id, projectId, status, due',
      assets: 'id, projectId, folder, createdAt',
      blobs: 'id',
      thumbs: 'id',
      comments: 'id, projectId, entityId, createdAt',
      activity: 'id, projectId, at',
      threads: 'id, projectId, updatedAt',
      settings: 'key',
    });
  }
}

export const db = new SceneforgeDB();

/** Tables that hold per-project records (everything keyed by projectId). */
export const PROJECT_TABLES = [
  'scripts',
  'scriptVersions',
  'scenes',
  'frames',
  'shots',
  'characters',
  'relationships',
  'locations',
  'items',
  'people',
  'events',
  'tasks',
  'assets',
  'comments',
  'activity',
  'threads',
] as const;

export type ProjectTable = (typeof PROJECT_TABLES)[number];

export function table(name: ProjectTable | 'projects'): Table<any, string> {
  return (db as unknown as Record<string, Table<any, string>>)[name];
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* not supported */
  }
  return false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    }
  } catch {
    /* not supported */
  }
  return null;
}
