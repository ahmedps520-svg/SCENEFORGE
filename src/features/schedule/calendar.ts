import { addDays, addMonths, endOfMonth, format, startOfMonth, startOfWeek } from 'date-fns';
import { parseDateStr, toDateStr } from '@/lib/dates';
import type { DateStr } from '@/lib/types';

/** Weeks start on Monday, like most production calendars. */
export const WEEK_STARTS_ON = 1 as const;

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Six-week grid of dates covering the month containing `anchor`. */
export function monthGrid(anchor: DateStr): DateStr[][] {
  const first = startOfMonth(parseDateStr(anchor));
  const start = startOfWeek(first, { weekStartsOn: WEEK_STARTS_ON });
  const weeks: DateStr[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: DateStr[] = [];
    for (let d = 0; d < 7; d++) week.push(toDateStr(addDays(start, w * 7 + d)));
    weeks.push(week);
  }
  // Drop a trailing week that is entirely in the next month.
  const month = first.getMonth();
  if (parseDateStr(weeks[5][0]).getMonth() !== month) weeks.pop();
  return weeks;
}

export function weekDays(anchor: DateStr): DateStr[] {
  const start = startOfWeek(parseDateStr(anchor), { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(start, i)));
}

/** All dates of the month containing `anchor`. */
export function monthDays(anchor: DateStr): DateStr[] {
  const first = startOfMonth(parseDateStr(anchor));
  const last = endOfMonth(first).getDate();
  return Array.from({ length: last }, (_, i) => toDateStr(addDays(first, i)));
}

export function shiftMonth(anchor: DateStr, n: number): DateStr {
  return toDateStr(addMonths(startOfMonth(parseDateStr(anchor)), n));
}

export function sameMonth(a: DateStr, b: DateStr): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function monthLabel(anchor: DateStr): string {
  return format(parseDateStr(anchor), 'MMMM yyyy');
}

export function dayNumber(d: DateStr): number {
  return Number(d.slice(8, 10));
}

export function weekdayShort(d: DateStr): string {
  return format(parseDateStr(d), 'EEE');
}
