import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import type { DateStr } from './types';

/** Local calendar date for a Date, `YYYY-MM-DD`. */
export function toDateStr(d: Date): DateStr {
  return format(d, 'yyyy-MM-dd');
}

export function todayStr(): DateStr {
  return toDateStr(new Date());
}

/** Parse `YYYY-MM-DD` as a local date (not UTC). */
export function parseDateStr(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isDateStr(s: unknown): s is DateStr {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));
}

export function addDaysStr(s: DateStr, days: number): DateStr {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function formatDate(s: DateStr | undefined, pattern = 'EEE d MMM yyyy'): string {
  if (!s) return '';
  return format(parseDateStr(s), pattern);
}

export function formatShortDate(s: DateStr | undefined): string {
  return formatDate(s, 'd MMM');
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 45_000) return 'just now';
  return formatDistanceToNowStrict(ts, { addSuffix: true });
}

export function formatTime(hhmm: string): string {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, 'h:mm a');
}

/** Minutes since midnight for `HH:mm`. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** e.g. 95 → "1h 35m", 40 → "40m". */
export function formatMinutes(min: number | undefined): string {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** e.g. 83 → "1:23". */
export function formatSeconds(sec: number | undefined): string {
  if (!sec || sec < 0) return '0:00';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}
