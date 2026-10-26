import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type {
  Activity,
  Asset,
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

/*
 * Reactive reads. Each hook re-renders when the underlying IndexedDB rows
 * change — in this tab or any other tab of the same browser.
 * They return `undefined` while the first read is in flight.
 */

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function useProjects(): Project[] | undefined {
  return useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
}

export function useProject(id: string | undefined): Project | null | undefined {
  return useLiveQuery(async () => (id ? (await db.projects.get(id)) ?? null : null), [id]);
}

export function useScripts(projectId: string | undefined): Script[] | undefined {
  return useLiveQuery(
    async () => (projectId ? db.scripts.where('projectId').equals(projectId).sortBy('createdAt') : []),
    [projectId],
  );
}

export function useScript(id: string | undefined): Script | null | undefined {
  return useLiveQuery(async () => (id ? (await db.scripts.get(id)) ?? null : null), [id]);
}

export function useVersions(scriptId: string | undefined): ScriptVersion[] | undefined {
  return useLiveQuery(
    async () => (scriptId ? (await db.scriptVersions.where('scriptId').equals(scriptId).sortBy('createdAt')).reverse() : []),
    [scriptId],
  );
}

export function useScenes(projectId: string | undefined): Scene[] | undefined {
  return useLiveQuery(
    async () => (projectId ? db.scenes.where('projectId').equals(projectId).sortBy('order') : []),
    [projectId],
  );
}

export function useScene(id: string | undefined): Scene | null | undefined {
  return useLiveQuery(async () => (id ? (await db.scenes.get(id)) ?? null : null), [id]);
}

export function useFrames(projectId: string | undefined): StoryboardFrame[] | undefined {
  return useLiveQuery(
    async () => (projectId ? db.frames.where('projectId').equals(projectId).sortBy('order') : []),
    [projectId],
  );
}

export function useShots(projectId: string | undefined): Shot[] | undefined {
  return useLiveQuery(
    async () => (projectId ? db.shots.where('projectId').equals(projectId).sortBy('order') : []),
    [projectId],
  );
}

export function useCharacters(projectId: string | undefined): Character[] | undefined {
  return useLiveQuery(
    async () => (projectId ? (await db.characters.where('projectId').equals(projectId).toArray()).sort(byName) : []),
    [projectId],
  );
}

export function useRelationships(projectId: string | undefined): Relationship[] | undefined {
  return useLiveQuery(
    async () => (projectId ? db.relationships.where('projectId').equals(projectId).toArray() : []),
    [projectId],
  );
}

export function useLocations(projectId: string | undefined): Location[] | undefined {
  return useLiveQuery(
    async () => (projectId ? (await db.locations.where('projectId').equals(projectId).toArray()).sort(byName) : []),
    [projectId],
  );
}

export function useItems(projectId: string | undefined): Item[] | undefined {
  return useLiveQuery(
    async () => (projectId ? (await db.items.where('projectId').equals(projectId).toArray()).sort(byName) : []),
    [projectId],
  );
}

export function usePeople(projectId: string | undefined): Person[] | undefined {
  return useLiveQuery(
    async () => (projectId ? (await db.people.where('projectId').equals(projectId).toArray()).sort(byName) : []),
    [projectId],
  );
}

export function useEvents(projectId: string | undefined): ScheduleEvent[] | undefined {
  return useLiveQuery(
    async () =>
      projectId
        ? (await db.events.where('projectId').equals(projectId).toArray()).sort(
            (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
          )
        : [],
    [projectId],
  );
}

export function useTasks(projectId: string | undefined): Task[] | undefined {
  return useLiveQuery(
    async () => (projectId ? db.tasks.where('projectId').equals(projectId).sortBy('order') : []),
    [projectId],
  );
}

export function useAssets(projectId: string | undefined): Asset[] | undefined {
  return useLiveQuery(
    async () => (projectId ? (await db.assets.where('projectId').equals(projectId).toArray()).sort((a, b) => b.createdAt - a.createdAt) : []),
    [projectId],
  );
}

export function useAsset(id: string | undefined): Asset | null | undefined {
  return useLiveQuery(async () => (id ? (await db.assets.get(id)) ?? null : null), [id]);
}

export function useComments(entityId: string | undefined): Comment[] | undefined {
  return useLiveQuery(
    async () => (entityId ? db.comments.where('entityId').equals(entityId).sortBy('createdAt') : []),
    [entityId],
  );
}

export function useActivity(projectId: string | undefined, limit = 100): Activity[] | undefined {
  return useLiveQuery(
    async () =>
      projectId
        ? (await db.activity.where('projectId').equals(projectId).sortBy('at')).reverse().slice(0, limit)
        : [],
    [projectId, limit],
  );
}

export function useThreads(projectId: string | undefined): AssistantThread[] | undefined {
  return useLiveQuery(
    async () => (projectId ? (await db.threads.where('projectId').equals(projectId).sortBy('updatedAt')).reverse() : []),
    [projectId],
  );
}

export interface ProjectData {
  project: Project;
  scripts: Script[];
  scenes: Scene[];
  frames: StoryboardFrame[];
  shots: Shot[];
  characters: Character[];
  relationships: Relationship[];
  locations: Location[];
  items: Item[];
  people: Person[];
  events: ScheduleEvent[];
  tasks: Task[];
  assets: Asset[];
}

/**
 * Everything in a project in one reactive read. Use on screens that combine
 * many record types (overview, readiness, presentations, AI context).
 */
export function useProjectData(projectId: string | undefined): ProjectData | null | undefined {
  return useLiveQuery(async () => {
    if (!projectId) return null;
    const project = await db.projects.get(projectId);
    if (!project) return null;
    const pid = projectId;
    const [scripts, scenes, frames, shots, characters, relationships, locations, items, people, events, tasks, assets] = await Promise.all([
      db.scripts.where('projectId').equals(pid).toArray(),
      db.scenes.where('projectId').equals(pid).toArray(),
      db.frames.where('projectId').equals(pid).toArray(),
      db.shots.where('projectId').equals(pid).toArray(),
      db.characters.where('projectId').equals(pid).toArray(),
      db.relationships.where('projectId').equals(pid).toArray(),
      db.locations.where('projectId').equals(pid).toArray(),
      db.items.where('projectId').equals(pid).toArray(),
      db.people.where('projectId').equals(pid).toArray(),
      db.events.where('projectId').equals(pid).toArray(),
      db.tasks.where('projectId').equals(pid).toArray(),
      db.assets.where('projectId').equals(pid).toArray(),
    ]);
    return {
      project,
      scripts,
      scenes: scenes.sort((a, b) => a.order - b.order),
      frames: frames.sort((a, b) => a.order - b.order),
      shots: shots.sort((a, b) => a.order - b.order),
      characters: characters.sort(byName),
      relationships,
      locations: locations.sort(byName),
      items: items.sort(byName),
      people: people.sort(byName),
      events: events.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
      tasks: tasks.sort((a, b) => a.order - b.order),
      assets: assets.sort((a, b) => b.createdAt - a.createdAt),
    };
  }, [projectId]);
}
