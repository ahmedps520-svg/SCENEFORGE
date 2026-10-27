import { cueName } from '@/lib/screenplay/sync';
import type { Character, ScriptElement } from '@/lib/types';

export interface SpeechStats {
  /** Number of speeches (dialogue blocks under a matching cue). */
  speeches: number;
  words: number;
  /** Scenes (by sceneId of the heading above) where the character speaks. */
  sceneIds: Set<string>;
}

function namesOf(c: Pick<Character, 'name' | 'aliases'>): Set<string> {
  return new Set([c.name, ...c.aliases].map(cueName).filter(Boolean));
}

/** Who speaks how much, and where, in a draft. */
export function speechStats(elements: ScriptElement[], characters: Pick<Character, 'id' | 'name' | 'aliases'>[]): Map<string, SpeechStats> {
  const out = new Map<string, SpeechStats>(characters.map((c) => [c.id, { speeches: 0, words: 0, sceneIds: new Set<string>() }]));
  const lookup = new Map<string, string>();
  for (const c of characters) for (const n of namesOf(c)) if (!lookup.has(n)) lookup.set(n, c.id);
  let sceneId: string | undefined;
  let speaker: string | undefined;
  for (const e of elements) {
    if (e.type === 'scene') {
      sceneId = e.sceneId;
      speaker = undefined;
    } else if (e.type === 'character') {
      speaker = lookup.get(cueName(e.text));
      if (speaker && sceneId) out.get(speaker)!.sceneIds.add(sceneId);
    } else if (e.type === 'dialogue') {
      if (speaker) {
        const st = out.get(speaker)!;
        st.speeches++;
        st.words += (e.text.match(/\S+/g) ?? []).length;
      }
    } else if (e.type !== 'parenthetical') {
      speaker = undefined;
    }
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** All distinct cue names used in a draft, with how often each appears. */
export function cueCounts(elements: ScriptElement[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of elements) {
    if (e.type !== 'character') continue;
    const n = cueName(e.text);
    if (n) m.set(n, (m.get(n) ?? 0) + 1);
  }
  return m;
}

/**
 * Cue spellings that look like this character but aren't its name or an alias
 * (and don't belong to another character): "MARRA" for "MARA", "MR HALE" for "MR. HALE".
 */
export function cueVariants(
  elements: ScriptElement[],
  character: Pick<Character, 'id' | 'name' | 'aliases'>,
  others: Pick<Character, 'id' | 'name' | 'aliases'>[],
): { name: string; count: number }[] {
  const own = namesOf(character);
  const taken = new Set<string>();
  for (const o of others) if (o.id !== character.id) for (const n of namesOf(o)) taken.add(n);
  const base = cueName(character.name);
  if (!base) return [];
  const squash = (s: string) => s.replace(/[^A-Z0-9]/g, '');
  const out: { name: string; count: number }[] = [];
  for (const [name, count] of cueCounts(elements)) {
    if (own.has(name) || taken.has(name)) continue;
    const close = [...own].some((n) => {
      const a = squash(n);
      const b = squash(name);
      if (!a || !b) return false;
      if (a === b) return true;
      if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
      return Math.max(a.length, b.length) >= 4 && levenshtein(a, b) <= 2;
    });
    if (close) out.push({ name, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** How many cues in the draft use exactly this name (ignoring extensions). */
export function countCues(elements: ScriptElement[], name: string): number {
  const n = cueName(name);
  return elements.filter((e) => e.type === 'character' && cueName(e.text) === n).length;
}

/** Rewrite cues for `oldName` to `newName`, keeping extensions like (V.O.) or (CONT'D). */
export function renameCues(elements: ScriptElement[], oldName: string, newName: string): { elements: ScriptElement[]; count: number } {
  const from = cueName(oldName);
  const to = newName.trim().toUpperCase();
  let count = 0;
  const next = elements.map((e) => {
    if (e.type !== 'character' || cueName(e.text) !== from) return e;
    count++;
    const idx = e.text.search(/[(^]/);
    const ext = idx >= 0 ? e.text.slice(idx).trim() : '';
    return { ...e, text: ext ? `${to} ${ext}` : to };
  });
  return { elements: count ? next : elements, count };
}
