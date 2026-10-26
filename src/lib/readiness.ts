import { formatShortDate } from './dates';
import type { Character, Item, Location, Person, Scene, ScheduleEvent, Shot } from './types';

export interface Blocker {
  /** `block` means the scene cannot be filmed as things stand. */
  level: 'block' | 'warn';
  kind: 'location' | 'prop' | 'wardrobe' | 'cast' | 'shots';
  text: string;
}

export interface ReadinessContext {
  locations: Map<string, Location>;
  items: Item[];
  characters: Map<string, Character>;
  people: Map<string, Person>;
  shots: Shot[];
  events: ScheduleEvent[];
}

export function buildReadinessContext(d: {
  locations: Location[];
  items: Item[];
  characters: Character[];
  people: Person[];
  shots: Shot[];
  events: ScheduleEvent[];
}): ReadinessContext {
  return {
    locations: new Map(d.locations.map((l) => [l.id, l])),
    items: d.items,
    characters: new Map(d.characters.map((c) => [c.id, c])),
    people: new Map(d.people.map((p) => [p.id, p])),
    shots: d.shots,
    events: d.events,
  };
}

/** Filming dates on which this scene is scheduled. */
export function filmingDates(sceneId: string, events: ScheduleEvent[]): string[] {
  return events.filter((e) => e.type === 'filming' && e.sceneIds.includes(sceneId)).map((e) => e.date).sort();
}

export function sceneBlockers(scene: Scene, ctx: ReadinessContext): Blocker[] {
  const out: Blocker[] = [];
  const dates = filmingDates(scene.id, ctx.events);

  const loc = scene.locationId ? ctx.locations.get(scene.locationId) : undefined;
  if (!loc) {
    out.push({
      level: 'warn',
      kind: 'location',
      text: scene.locationName ? `“${scene.locationName}” has no location profile yet` : 'No location assigned',
    });
  } else {
    if (loc.status === 'unavailable') out.push({ level: 'block', kind: 'location', text: `${loc.name} is unavailable` });
    for (const d of dates) {
      if (loc.unavailableDates.includes(d)) out.push({ level: 'block', kind: 'location', text: `${loc.name} is unavailable on ${formatShortDate(d)}` });
    }
  }

  for (const it of ctx.items) {
    if (!it.sceneIds.includes(scene.id)) continue;
    const kind = it.kind === 'wardrobe' ? 'wardrobe' : 'prop';
    const noun = it.kind === 'wardrobe' ? 'Costume' : 'Prop';
    if (it.status === 'unavailable') out.push({ level: 'block', kind, text: `${noun} “${it.name}” is unavailable` });
    else if (it.status === 'needed') out.push({ level: 'block', kind, text: `${noun} “${it.name}” hasn't been sourced` });
  }

  for (const cid of scene.characterIds) {
    const c = ctx.characters.get(cid);
    if (!c) continue;
    const actor = c.actorId ? ctx.people.get(c.actorId) : undefined;
    if (!actor) {
      out.push({ level: 'warn', kind: 'cast', text: `${c.name} hasn't been cast` });
      continue;
    }
    for (const d of dates) {
      if (actor.unavailableDates.includes(d)) out.push({ level: 'block', kind: 'cast', text: `${actor.name} (${c.name}) is unavailable on ${formatShortDate(d)}` });
    }
  }

  if (!ctx.shots.some((s) => s.sceneId === scene.id)) out.push({ level: 'warn', kind: 'shots', text: 'No shots planned' });
  return out;
}

export type Readiness = 'blocked' | 'ready' | 'prep' | 'filmed';

export function sceneReadiness(scene: Scene, blockers: Blocker[]): Readiness {
  if (scene.status === 'filmed') return 'filmed';
  if (blockers.some((b) => b.level === 'block')) return 'blocked';
  if (scene.status === 'ready') return 'ready';
  return 'prep';
}
