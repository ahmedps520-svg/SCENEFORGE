import type { Scene, ScheduleEvent, Shot } from '@/lib/types';

/** The filming day a shot belongs to: its own assignment, else the first filming day that includes its scene. */
export function filmingDayFor(shot: Pick<Shot, 'eventId' | 'sceneId'>, filmingEvents: ScheduleEvent[]): ScheduleEvent | undefined {
  if (shot.eventId) {
    const own = filmingEvents.find((e) => e.id === shot.eventId);
    if (own) return own;
  }
  return filmingEvents.find((e) => e.sceneIds.includes(shot.sceneId));
}

export function filmingEventsOf(events: ScheduleEvent[]): ScheduleEvent[] {
  return events
    .filter((e) => e.type === 'filming')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export interface ShotGroup {
  key: string;
  kind: 'scene' | 'day' | 'unscheduled';
  sceneId?: string;
  event?: ScheduleEvent;
  shots: Shot[];
}

/** Group shots by scene (story order) or by filming day (date order, unscheduled last). */
export function groupShots(
  shots: Shot[],
  mode: 'scene' | 'day',
  scenes: Scene[],
  filmingEvents: ScheduleEvent[],
): ShotGroup[] {
  if (mode === 'scene') {
    const order = new Map(scenes.map((s) => [s.id, s.order]));
    const byScene = new Map<string, Shot[]>();
    for (const s of shots) {
      const list = byScene.get(s.sceneId) ?? [];
      list.push(s);
      byScene.set(s.sceneId, list);
    }
    return [...byScene.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9))
      .map(([sceneId, list]) => ({ key: `scene:${sceneId}`, kind: 'scene' as const, sceneId, shots: list.sort((a, b) => a.order - b.order) }));
  }
  const sceneOrder = new Map(scenes.map((s) => [s.id, s.productionOrder]));
  const sortInDay = (a: Shot, b: Shot) => (sceneOrder.get(a.sceneId) ?? 0) - (sceneOrder.get(b.sceneId) ?? 0) || a.order - b.order;
  const byDay = new Map<string, Shot[]>();
  const unscheduled: Shot[] = [];
  for (const s of shots) {
    const day = filmingDayFor(s, filmingEvents);
    if (!day) unscheduled.push(s);
    else byDay.set(day.id, [...(byDay.get(day.id) ?? []), s]);
  }
  const groups: ShotGroup[] = filmingEvents
    .filter((e) => byDay.has(e.id))
    .map((e) => ({ key: `day:${e.id}`, kind: 'day' as const, event: e, shots: byDay.get(e.id)!.sort(sortInDay) }));
  if (unscheduled.length) groups.push({ key: 'unscheduled', kind: 'unscheduled', shots: unscheduled.sort(sortInDay) });
  return groups;
}

export function groupTotals(shots: Shot[]) {
  return {
    count: shots.length,
    completed: shots.filter((s) => s.status === 'completed').length,
    minutes: shots.reduce((n, s) => n + (s.setupMin ?? 0) + (s.filmMin ?? 0), 0),
  };
}

/** New order values for a scene after moving `activeId` onto `overId`. */
export function reorderedIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}
