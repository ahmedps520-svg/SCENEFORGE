import { describe, expect, it } from 'vitest';
import type { Scene, ScheduleEvent, Shot } from '@/lib/types';
import { filmingDayFor, filmingEventsOf, groupShots, groupTotals, reorderedIds } from './shotUtils';

const shot = (id: string, sceneId: string, order: number, extra: Partial<Shot> = {}) => ({ id, sceneId, order, status: 'planned', setupMin: 10, filmMin: 5, ...extra }) as Shot;
const scene = (id: string, order: number, productionOrder = order) => ({ id, order, productionOrder }) as Scene;
const ev = (id: string, date: string, sceneIds: string[], type: ScheduleEvent['type'] = 'filming') => ({ id, date, startTime: '09:00', sceneIds, type }) as ScheduleEvent;

describe('shot grouping', () => {
  const scenes = [scene('a', 0, 1), scene('b', 1, 0)];
  const shots = [shot('1', 'b', 1), shot('2', 'a', 0), shot('3', 'b', 0, { status: 'completed' }), shot('4', 'a', 1, { eventId: 'd2' })];
  const events = filmingEventsOf([ev('d2', '2026-11-02', []), ev('m', '2026-10-30', ['a'], 'meeting'), ev('d1', '2026-11-01', ['a'])]);

  it('orders filming events by date and drops other types', () => {
    expect(events.map((e) => e.id)).toEqual(['d1', 'd2']);
  });

  it('resolves filming days with explicit assignment first', () => {
    expect(filmingDayFor(shots[3], events)?.id).toBe('d2');
    expect(filmingDayFor(shots[1], events)?.id).toBe('d1');
    expect(filmingDayFor(shots[0], events)).toBeUndefined();
  });

  it('groups by scene in story order', () => {
    const g = groupShots(shots, 'scene', scenes, events);
    expect(g.map((x) => x.sceneId)).toEqual(['a', 'b']);
    expect(g[1].shots.map((s) => s.id)).toEqual(['3', '1']);
  });

  it('groups by day with unscheduled last', () => {
    const g = groupShots(shots, 'day', scenes, events);
    expect(g.map((x) => x.key)).toEqual(['day:d1', 'day:d2', 'unscheduled']);
    expect(g[2].shots.map((s) => s.id)).toEqual(['3', '1']);
  });

  it('totals and reorders', () => {
    expect(groupTotals(shots)).toEqual({ count: 4, completed: 1, minutes: 60 });
    expect(reorderedIds(['x', 'y', 'z'], 'z', 'x')).toEqual(['z', 'x', 'y']);
  });
});
