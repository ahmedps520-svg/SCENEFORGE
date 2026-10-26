import { addDaysStr, formatShortDate, timeToMinutes } from './dates';
import type { Character, Location, Person, Scene, ScheduleEvent } from './types';

export interface Conflict {
  level: 'error' | 'warning';
  text: string;
  personId?: string;
  locationId?: string;
}

export interface ScheduleContext {
  scenes: Map<string, Scene>;
  characters: Map<string, Character>;
  people: Map<string, Person>;
  locations: Map<string, Location>;
}

export function buildScheduleContext(d: { scenes: Scene[]; characters: Character[]; people: Person[]; locations: Location[] }): ScheduleContext {
  return {
    scenes: new Map(d.scenes.map((s) => [s.id, s])),
    characters: new Map(d.characters.map((c) => [c.id, c])),
    people: new Map(d.people.map((p) => [p.id, p])),
    locations: new Map(d.locations.map((l) => [l.id, l])),
  };
}

/** Cast needed for these scenes: the actors playing every character present. */
export function castForScenes(sceneIds: string[], ctx: ScheduleContext): { personId: string; characterIds: string[] }[] {
  const byPerson = new Map<string, Set<string>>();
  for (const sid of sceneIds) {
    const scene = ctx.scenes.get(sid);
    if (!scene) continue;
    for (const cid of scene.characterIds) {
      const actorId = ctx.characters.get(cid)?.actorId;
      if (!actorId) continue;
      if (!byPerson.has(actorId)) byPerson.set(actorId, new Set());
      byPerson.get(actorId)!.add(cid);
    }
  }
  return [...byPerson.entries()].map(([personId, cids]) => ({ personId, characterIds: [...cids] }));
}

/** Everyone an event needs: explicitly listed people plus derived cast. */
export function requiredPeople(event: ScheduleEvent, ctx: ScheduleContext): string[] {
  const ids = new Set(event.personIds);
  for (const c of castForScenes(event.sceneIds, ctx)) ids.add(c.personId);
  return [...ids];
}

/** Locations an event uses: its own plus the locations of its scenes. */
export function eventLocations(event: ScheduleEvent, ctx: ScheduleContext): string[] {
  const ids = new Set<string>();
  if (event.locationId) ids.add(event.locationId);
  for (const sid of event.sceneIds) {
    const l = ctx.scenes.get(sid)?.locationId;
    if (l) ids.add(l);
  }
  return [...ids];
}

function overlaps(a: ScheduleEvent, b: ScheduleEvent): boolean {
  if (a.date !== b.date) return false;
  const a0 = timeToMinutes(a.startTime);
  const b0 = timeToMinutes(b.startTime);
  return a0 < b0 + Math.max(b.durationMin, 1) && b0 < a0 + Math.max(a.durationMin, 1);
}

export function findConflicts(events: ScheduleEvent[], ctx: ScheduleContext): Map<string, Conflict[]> {
  const out = new Map<string, Conflict[]>();
  const add = (id: string, c: Conflict) => out.set(id, [...(out.get(id) ?? []), c]);
  const required = new Map(events.map((e) => [e.id, requiredPeople(e, ctx)]));

  for (const e of events) {
    for (const pid of required.get(e.id)!) {
      const p = ctx.people.get(pid);
      if (p?.unavailableDates.includes(e.date)) {
        add(e.id, { level: 'error', text: `${p.name} is unavailable on ${formatShortDate(e.date)}`, personId: pid });
      }
    }
    for (const lid of eventLocations(e, ctx)) {
      const l = ctx.locations.get(lid);
      if (!l) continue;
      if (l.status === 'unavailable') add(e.id, { level: 'error', text: `${l.name} is marked unavailable`, locationId: lid });
      else if (l.unavailableDates.includes(e.date)) {
        add(e.id, { level: 'error', text: `${l.name} is unavailable on ${formatShortDate(e.date)}`, locationId: lid });
      }
    }
    if (e.type === 'filming' && e.sceneIds.length === 0) add(e.id, { level: 'warning', text: 'No scenes assigned to this filming day' });
  }

  // Double bookings: the same person needed at two overlapping events.
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (!overlaps(a, b)) continue;
      const shared = required.get(a.id)!.filter((p) => required.get(b.id)!.includes(p));
      for (const pid of shared) {
        const name = ctx.people.get(pid)?.name ?? 'Someone';
        add(a.id, { level: 'error', text: `${name} is double-booked with “${b.title || b.type}”`, personId: pid });
        add(b.id, { level: 'error', text: `${name} is double-booked with “${a.title || a.type}”`, personId: pid });
      }
    }
  }
  return out;
}

/**
 * Dates in the next `days` days when everyone needed for these scenes and
 * every location involved is available, with no other event booking them.
 */
export function suggestDates(
  sceneIds: string[],
  ctx: ScheduleContext,
  events: ScheduleEvent[],
  from: string,
  days = 60,
  extraPeople: string[] = [],
): string[] {
  const people = new Set([...castForScenes(sceneIds, ctx).map((c) => c.personId), ...extraPeople]);
  const locs = new Set(sceneIds.map((s) => ctx.scenes.get(s)?.locationId).filter((x): x is string => !!x));
  if ([...locs].some((l) => ctx.locations.get(l)?.status === 'unavailable')) return [];
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysStr(from, i);
    const peopleOk = [...people].every((p) => !ctx.people.get(p)?.unavailableDates.includes(d));
    const locOk = [...locs].every((l) => !ctx.locations.get(l)?.unavailableDates.includes(d));
    const busy = events.some((e) => e.date === d && requiredPeople(e, ctx).some((p) => people.has(p)));
    if (peopleOk && locOk && !busy) out.push(d);
  }
  return out;
}
