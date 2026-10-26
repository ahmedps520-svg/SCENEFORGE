import type { IntExt } from '../types';

export interface ParsedHeading {
  intExt: IntExt;
  locationName: string;
  timeOfDay: string;
}

export const TIMES_OF_DAY = [
  'DAY',
  'NIGHT',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'DAWN',
  'DUSK',
  'SUNRISE',
  'SUNSET',
  'MAGIC HOUR',
  'CONTINUOUS',
  'LATER',
  'MOMENTS LATER',
  'SAME TIME',
  'SAME',
];

const PREFIX_RE = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?)(\s+|$)/i;

/** True when text starts like a scene heading (INT. / EXT. / INT./EXT. / I/E / EST.). */
export function looksLikeHeading(text: string): boolean {
  return /^(INT|EXT|EST|I\/E|INT\.?\/EXT|EXT\.?\/INT)[.\s]/i.test(text.trim());
}

function normalizePrefix(p: string): IntExt {
  const s = p.toUpperCase().replace(/[\s.]/g, '');
  if (s === 'INT') return 'INT';
  if (s === 'EXT' || s === 'EST') return 'EXT';
  return 'INT/EXT';
}

function isTimeOfDay(segment: string): boolean {
  const s = segment.trim().toUpperCase().replace(/[().]/g, '');
  if (!s) return false;
  if (TIMES_OF_DAY.includes(s)) return true;
  return /\b(LATER|CONTINUOUS|DAY|NIGHT|MORNING|EVENING|DUSK|DAWN)\b/.test(s) && s.split(/\s+/).length <= 3;
}

/** Strip Fountain-style scene numbers: `INT. HOUSE - DAY #12A#`. */
export function stripSceneNumber(text: string): string {
  return text.replace(/\s*#[\w.-]+#\s*$/, '').trim();
}

/** Split a heading such as `EXT. PARK - BENCH - NIGHT` into its parts. */
export function parseHeading(raw: string): ParsedHeading {
  const text = stripSceneNumber(raw.replace(/^\.(?=[^.])/, '')).trim();
  const m = text.match(PREFIX_RE);
  let intExt: IntExt = '';
  let rest = text;
  if (m) {
    intExt = normalizePrefix(m[1]);
    rest = text.slice(m[0].length);
  }
  const parts = rest.split(/\s+[-–—]\s+/);
  let timeOfDay = '';
  if (parts.length > 1 && isTimeOfDay(parts[parts.length - 1])) {
    timeOfDay = parts.pop()!.trim().toUpperCase();
  }
  const locationName = parts.join(' - ').trim().toUpperCase();
  return { intExt, locationName, timeOfDay };
}

/** Build a heading from parts, e.g. ('INT', 'KITCHEN', 'NIGHT') → `INT. KITCHEN - NIGHT`. */
export function buildHeading(intExt: IntExt, locationName: string, timeOfDay: string): string {
  const prefix = intExt === 'INT/EXT' ? 'INT./EXT.' : intExt ? `${intExt}.` : '';
  const loc = locationName.trim().toUpperCase();
  const time = timeOfDay.trim().toUpperCase();
  return [prefix, loc].filter(Boolean).join(' ') + (time ? ` - ${time}` : '');
}
