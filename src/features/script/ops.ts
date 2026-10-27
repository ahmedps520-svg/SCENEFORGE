import { uid } from '@/lib/ids';
import { looksLikeHeading, parseHeading, TIMES_OF_DAY } from '@/lib/screenplay/heading';
import { cueName } from '@/lib/screenplay/sync';
import type { ElementType, ScriptElement } from '@/lib/types';

/**
 * Pure element operations for the block editor. Every function returns a new
 * array (never mutates) plus where the caret should land, so each edit can be
 * recorded as one undo step.
 */

export const UPPER_TYPES: ElementType[] = ['scene', 'character', 'transition', 'shot'];
export const isUpperType = (t: ElementType) => UPPER_TYPES.includes(t);

/** Element created by Enter at the end of each type. */
export const NEXT_TYPE: Record<ElementType, ElementType> = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'scene',
  shot: 'action',
  centered: 'action',
};

/** Tab cycling. */
export const TAB_NEXT: Record<ElementType, ElementType> = {
  action: 'character',
  character: 'action',
  dialogue: 'parenthetical',
  parenthetical: 'dialogue',
  scene: 'action',
  transition: 'scene',
  shot: 'action',
  centered: 'action',
};

/** Shift+Tab cycling. */
export const TAB_PREV: Record<ElementType, ElementType> = {
  action: 'scene',
  character: 'action',
  dialogue: 'character',
  parenthetical: 'dialogue',
  scene: 'action',
  transition: 'action',
  shot: 'scene',
  centered: 'action',
};

export const PLACEHOLDER: Record<ElementType, string> = {
  scene: 'INT. LOCATION - DAY',
  action: 'Action — what we see and hear',
  character: 'CHARACTER',
  parenthetical: '(beat)',
  dialogue: 'Dialogue',
  transition: 'CUT TO:',
  shot: 'CLOSE ON —',
  centered: 'Centered text',
};

export interface Sel {
  id: string;
  start: number;
  end?: number;
}

export interface OpResult {
  elements: ScriptElement[];
  sel: Sel;
}

export function newElement(type: ElementType, text = ''): ScriptElement {
  const e: ScriptElement = { id: uid(), type, text };
  if (type === 'scene') e.sceneId = uid();
  return e;
}

/** Change an element's type, adjusting its text to fit (case, parentheses). */
export function withType(el: ScriptElement, type: ElementType): { el: ScriptElement; caret?: number } {
  let text = el.text;
  let caret: number | undefined;
  if (el.type === 'parenthetical' && type !== 'parenthetical') {
    const t = text.trim();
    if (t === '()') text = '';
    else if (/^\([\s\S]*\)$/.test(t)) text = t.slice(1, -1);
  }
  if (type === 'parenthetical') {
    const t = text.trim();
    if (!t) {
      text = '()';
      caret = 1;
    } else if (!t.startsWith('(')) {
      text = `(${t}${t.endsWith(')') ? '' : ')'}`;
    }
  }
  if (isUpperType(type)) text = text.toUpperCase();
  const next: ScriptElement = { ...el, type, text };
  if (type === 'scene' && !next.sceneId) next.sceneId = uid();
  return { el: next, caret };
}

export function replaceAt(elements: ScriptElement[], idx: number, el: ScriptElement): ScriptElement[] {
  const out = elements.slice();
  out[idx] = el;
  return out;
}

/**
 * Enter: split the element at the selection. The text after the caret moves
 * into a new element whose type follows screenplay flow.
 */
export function splitAt(elements: ScriptElement[], idx: number, start: number, end: number): OpResult {
  const el = elements[idx];
  const before = el.text.slice(0, start);
  const after = el.text.slice(end);

  // Enter at the very start of a non-empty element pushes it down.
  if (start === 0 && end === 0 && el.text.length > 0) {
    const blank = newElement('action');
    return { elements: [...elements.slice(0, idx), blank, ...elements.slice(idx)], sel: { id: el.id, start: 0 } };
  }

  const keepType = el.type === 'action' || el.type === 'dialogue' || el.type === 'centered';
  const nextType = after.trim() && keepType ? el.type : NEXT_TYPE[el.type];
  const created = withType(newElement(nextType, after), nextType);
  const current = { ...el, text: before };
  const out = [...elements.slice(0, idx), current, created.el, ...elements.slice(idx + 1)];
  return { elements: out, sel: { id: created.el.id, start: created.caret ?? 0 } };
}

/** Backspace at the start: merge into the previous element. */
export function mergeWithPrevious(elements: ScriptElement[], idx: number): OpResult | null {
  if (idx <= 0) return null;
  const prev = elements[idx - 1];
  const el = elements[idx];
  if (!el.text) {
    return { elements: [...elements.slice(0, idx), ...elements.slice(idx + 1)], sel: { id: prev.id, start: prev.text.length } };
  }
  const merged = { ...prev, text: prev.text + el.text };
  if (isUpperType(prev.type)) merged.text = merged.text.toUpperCase();
  return {
    elements: [...elements.slice(0, idx - 1), merged, ...elements.slice(idx + 1)],
    sel: { id: prev.id, start: prev.text.length },
  };
}

/** Delete at the end: pull the next element's text into this one. */
export function mergeWithNext(elements: ScriptElement[], idx: number): OpResult | null {
  if (idx >= elements.length - 1) return null;
  const el = elements[idx];
  const next = elements[idx + 1];
  const merged = { ...el, text: el.text + next.text };
  if (isUpperType(el.type)) merged.text = merged.text.toUpperCase();
  return {
    elements: [...elements.slice(0, idx), merged, ...elements.slice(idx + 2)],
    sel: { id: el.id, start: el.text.length },
  };
}

/** Insert parsed elements at the selection, splitting the current element around them. */
export function insertElements(elements: ScriptElement[], idx: number, start: number, end: number, inserted: ScriptElement[]): OpResult {
  if (!inserted.length) return { elements, sel: { id: elements[idx].id, start } };
  const el = elements[idx];
  const before = el.text.slice(0, start);
  const after = el.text.slice(end);
  const out: ScriptElement[] = elements.slice(0, idx);
  if (before.trim()) out.push({ ...el, text: before });
  out.push(...inserted);
  let sel: Sel = { id: inserted[inserted.length - 1].id, start: inserted[inserted.length - 1].text.length };
  if (after.trim()) {
    const tail = before.trim() ? newElement(el.type, after) : { ...el, text: after };
    out.push(tail);
  }
  out.push(...elements.slice(idx + 1));
  if (!out.length) out.push(newElement('scene'));
  if (!out.some((e) => e.id === sel.id)) sel = { id: out[0].id, start: 0 };
  return { elements: out, sel };
}

/**
 * When Enter is pressed at the end of an action line written in capitals,
 * recognise character cues and transitions.
 */
export function enterConversion(el: ScriptElement, knownNames: Set<string>): ElementType | null {
  if (el.type !== 'action') return null;
  const t = el.text.trim();
  if (!t || t.includes('\n') || t !== t.toUpperCase() || !/\p{L}/u.test(t)) return null;
  if (/TO:$/.test(t) || /^(FADE OUT|FADE TO BLACK|CUT TO BLACK)\.?$/.test(t)) return 'transition';
  if (knownNames.has(cueName(t))) return 'character';
  return null;
}

/** Live conversion while typing in an action element. */
export function typingConversion(prev: ScriptElement, nextText: string): ElementType | null {
  if (prev.type === 'action' && looksLikeHeading(nextText) && !looksLikeHeading(prev.text)) return 'scene';
  return null;
}

// ─── Autocomplete ───────────────────────────────────────────────────────────

export interface Suggestion {
  value: string;
  label: string;
  hint?: string;
}

const CUE_EXTENSIONS = ['(V.O.)', '(O.S.)', "(CONT'D)", '(O.C.)'];
const HEADING_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'I/E. '];
const PREFIX_RE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|I\/E\.?|EST\.)\s/;

export function characterSuggestions(text: string, names: string[]): Suggestion[] {
  const t = text.toUpperCase();
  const paren = t.indexOf('(');
  if (paren >= 0) {
    const base = t.slice(0, paren).trim();
    const partial = t.slice(paren).trim();
    if (!base) return [];
    return CUE_EXTENSIONS.filter((x) => x.startsWith(partial) && x !== partial).map((x) => ({
      value: `${base} ${x}`,
      label: `${base} ${x}`,
      hint: x === '(V.O.)' ? 'Voice-over' : x === '(O.S.)' ? 'Off screen' : x === '(O.C.)' ? 'Off camera' : 'Continued',
    }));
  }
  const trimmed = t.trim();
  const starts = names.filter((n) => n.startsWith(trimmed) && n !== trimmed);
  const contains = trimmed ? names.filter((n) => !n.startsWith(trimmed) && n.includes(trimmed)) : [];
  return [...starts, ...contains].slice(0, 8).map((n) => ({ value: n, label: n }));
}

export function sceneSuggestions(text: string, locations: string[]): Suggestion[] {
  const t = text.toUpperCase();
  const m = t.match(PREFIX_RE);
  if (!m) {
    const s = t.trim();
    return HEADING_PREFIXES.filter((p) => p.startsWith(s) && p.trim() !== s).map((p) => ({
      value: p,
      label: p.trim(),
      hint: p.startsWith('INT./') || p.startsWith('I/E') ? 'Interior & exterior' : p.startsWith('INT') ? 'Interior' : 'Exterior',
    }));
  }
  const prefix = m[0];
  const rest = t.slice(prefix.length);
  const dash = rest.lastIndexOf(' - ');
  if (dash >= 0) {
    const partial = rest.slice(dash + 3).trim();
    const head = t.slice(0, prefix.length + dash + 3);
    return TIMES_OF_DAY.filter((x) => x.startsWith(partial) && x !== partial)
      .slice(0, 8)
      .map((x) => ({ value: head + x, label: x, hint: 'Time of day' }));
  }
  const partial = rest.trim();
  return locations
    .filter((l) => l.startsWith(partial) && l !== partial)
    .slice(0, 8)
    .map((l) => ({ value: `${prefix}${l} - `, label: l, hint: 'Location' }));
}

/** Location names already used in headings, for heading autocomplete. */
export function headingLocations(elements: ScriptElement[], extra: string[] = []): string[] {
  const set = new Set<string>();
  for (const e of elements) {
    if (e.type !== 'scene' || !e.text.trim()) continue;
    const loc = parseHeading(e.text).locationName;
    if (loc) set.add(loc);
  }
  for (const x of extra) if (x.trim()) set.add(x.trim().toUpperCase());
  return [...set].sort();
}

/** Character cue names used in the script, without extensions. */
export function scriptCueNames(elements: ScriptElement[]): string[] {
  const set = new Set<string>();
  for (const e of elements) if (e.type === 'character') {
    const n = cueName(e.text);
    if (n) set.add(n);
  }
  return [...set];
}

// ─── Bookkeeping ────────────────────────────────────────────────────────────

/** Content signature (type + text) used to tell our own saves from changes made elsewhere. */
export function signature(elements: ScriptElement[]): string {
  let s = '';
  for (const e of elements) s += e.type + '\u0001' + e.text + '\u0002';
  return s;
}

/** Take scene ids assigned during save without touching text the writer typed since. */
export function adoptSceneIds(current: ScriptElement[], normalized: ScriptElement[]): ScriptElement[] {
  const byId = new Map(normalized.map((e) => [e.id, e]));
  let changed = false;
  const out = current.map((e) => {
    const n = byId.get(e.id);
    if (n && e.type === 'scene' && n.type === 'scene' && n.sceneId && n.sceneId !== e.sceneId) {
      changed = true;
      return { ...e, sceneId: n.sceneId };
    }
    return e;
  });
  return changed ? out : current;
}

export interface Match {
  id: string;
  start: number;
  end: number;
}

export function findMatches(elements: ScriptElement[], query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const q = caseSensitive ? query : query.toLowerCase();
  const out: Match[] = [];
  for (const e of elements) {
    const text = caseSensitive ? e.text : e.text.toLowerCase();
    let i = text.indexOf(q);
    while (i >= 0) {
      out.push({ id: e.id, start: i, end: i + q.length });
      i = text.indexOf(q, i + Math.max(1, q.length));
    }
  }
  return out;
}

/** Replace every match; returns the new elements and how many were replaced. */
export function replaceAllMatches(elements: ScriptElement[], query: string, replacement: string, caseSensitive: boolean): { elements: ScriptElement[]; count: number } {
  if (!query) return { elements, count: 0 };
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  let count = 0;
  const out = elements.map((e) => {
    const matches = e.text.match(re);
    if (!matches) return e;
    count += matches.length;
    let text = e.text.replace(re, () => replacement);
    if (isUpperType(e.type)) text = text.toUpperCase();
    return { ...e, text };
  });
  return { elements: count ? out : elements, count };
}

/** Headings with their story numbers (1-based, empty headings are skipped). */
export function headingNumbers(elements: ScriptElement[]): Map<string, string> {
  const out = new Map<string, string>();
  let n = 0;
  for (const e of elements) {
    if (e.type === 'scene' && e.text.trim()) out.set(e.id, String(++n));
  }
  return out;
}
