import { eventTypeMeta } from '@/lib/constants';
import type { Conflict } from '@/lib/conflicts';
import { formatMinutes, minutesToTime, timeToMinutes } from '@/lib/dates';
import { formatEighths } from '@/lib/screenplay/paginate';
import type { Scene, ScheduleEvent } from '@/lib/types';

/** Filming days numbered in date order: Day 1, Day 2… */
export function filmingDayIndex(events: ScheduleEvent[]): Map<string, number> {
  const filming = events
    .filter((e) => e.type === 'filming')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return new Map(filming.map((e, i) => [e.id, i + 1]));
}

export function eventTitle(e: ScheduleEvent, dayIndex: Map<string, number>): string {
  if (e.title.trim()) return e.title.trim();
  if (e.type === 'filming') return `Filming · Day ${dayIndex.get(e.id) ?? '?'}`;
  return eventTypeMeta(e.type).label;
}

export function endTime(e: Pick<ScheduleEvent, 'startTime' | 'durationMin'>): string {
  return minutesToTime(timeToMinutes(e.startTime) + e.durationMin);
}

export function scenesSummary(sceneIds: string[], scenes: Map<string, Scene>): string {
  const list = sceneIds.map((id) => scenes.get(id)).filter((s): s is Scene => !!s);
  if (!list.length) return 'No scenes';
  const eighths = list.reduce((n, s) => n + (s.pageEighths || 0), 0);
  const sec = list.reduce((n, s) => n + (s.estDurationSec ?? s.scriptSec ?? 0), 0);
  return `${list.length} scene${list.length === 1 ? '' : 's'} · ${formatEighths(eighths)} pg${sec ? ` · ~${screenTime(sec)} screen time` : ''}`;
}

/** Estimated screen time: "45s", "3m", "1h 10m". */
export function screenTime(sec: number): string {
  return sec < 60 ? `${Math.max(1, Math.round(sec))}s` : formatMinutes(Math.round(sec / 60));
}

/** Hard conflicts (someone or somewhere unavailable, double bookings), as opposed to advisory warnings. */
export function errorsOf(list: Conflict[] | undefined): Conflict[] {
  return (list ?? []).filter((c) => c.level === 'error');
}

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 540, 600, 720, 840];

export function durationLabel(min: number): string {
  return formatMinutes(min);
}
