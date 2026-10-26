import { uid } from '../ids';
import type { Character, Location, Scene, ScriptElement } from '../types';
import { parseHeading } from './heading';
import { displayText, sceneLengths, type PageSize } from './paginate';

/**
 * The production draft drives the scene breakdown. Every scene heading element
 * carries a sceneId; saving the draft creates, updates and re-orders Scene
 * records to match. Sync is deliberately conservative:
 *   - it never deletes a scene (removed headings become "not in script"),
 *   - it only ever adds characters/locations it can match, never removes them,
 *   - it never touches storyboards or shots, which hang off sceneId.
 */

/** Strip cue extensions: `JOHN (V.O.)`, `JOHN (CONT'D)`, `JOHN ^`. */
export function cueName(text: string): string {
  return text
    .replace(/\^\s*$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Give every heading a sceneId and make sure no two headings share one. */
export function normalizeElements(elements: ScriptElement[]): ScriptElement[] {
  const seen = new Set<string>();
  let changed = false;
  const out = elements.map((e) => {
    if (e.type !== 'scene') return e;
    if (!e.sceneId || seen.has(e.sceneId)) {
      changed = true;
      const next = { ...e, sceneId: uid() };
      seen.add(next.sceneId);
      return next;
    }
    seen.add(e.sceneId);
    return e;
  });
  return changed ? out : elements;
}

export interface SceneSegment {
  sceneId: string;
  headingId: string;
  heading: string;
  index: number;
  body: ScriptElement[];
  cues: string[];
}

/** Split elements into scenes. Content before the first heading is ignored. */
export function segmentScenes(elements: ScriptElement[]): SceneSegment[] {
  const segments: SceneSegment[] = [];
  let current: SceneSegment | null = null;
  for (const e of elements) {
    if (e.type === 'scene' && e.sceneId && e.text.trim()) {
      current = { sceneId: e.sceneId, headingId: e.id, heading: e.text.trim().toUpperCase(), index: segments.length, body: [], cues: [] };
      segments.push(current);
      continue;
    }
    if (!current) continue;
    current.body.push(e);
    if (e.type === 'character') {
      const name = cueName(e.text);
      if (name && !current.cues.includes(name)) current.cues.push(name);
    }
  }
  return segments;
}

export function excerpt(body: ScriptElement[], max = 220): string {
  const text = body
    .filter((e) => e.type === 'action' || e.type === 'dialogue')
    .map((e) => displayText(e))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function matchCharacter(name: string, characters: Pick<Character, 'id' | 'name' | 'aliases'>[]): string | undefined {
  const n = cueName(name);
  if (!n) return undefined;
  const hit = characters.find(
    (c) => cueName(c.name) === n || c.aliases.some((a) => cueName(a) === n),
  );
  return hit?.id;
}

export function matchLocation(locationName: string, locations: Pick<Location, 'id' | 'name'>[]): string | undefined {
  const n = locationName.trim().toUpperCase();
  if (!n) return undefined;
  const exact = locations.find((l) => l.name.trim().toUpperCase() === n);
  if (exact) return exact.id;
  // "HALE HOUSE - KITCHEN" matches a location profile named "Hale House".
  const prefix = locations.find((l) => {
    const ln = l.name.trim().toUpperCase();
    return ln.length >= 3 && (n.startsWith(ln + ' ') || n.startsWith(ln + ' -') || n.startsWith(ln + ','));
  });
  return prefix?.id;
}

export type NewScene = Omit<Scene, 'createdAt' | 'updatedAt'>;

export interface SyncPlan {
  creates: NewScene[];
  updates: { id: string; patch: Partial<Scene> }[];
  /** Cue names that match no character profile. */
  unknownCues: string[];
}

export function planSceneSync(args: {
  projectId: string;
  elements: ScriptElement[];
  scenes: Scene[];
  characters: Pick<Character, 'id' | 'name' | 'aliases'>[];
  locations: Pick<Location, 'id' | 'name'>[];
  pageSize?: PageSize;
}): SyncPlan {
  const { projectId, elements, scenes, characters, locations } = args;
  const segments = segmentScenes(elements);
  const lengths = sceneLengths(elements, args.pageSize);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const inScriptIds = new Set(segments.map((s) => s.sceneId));
  const creates: NewScene[] = [];
  const patches = new Map<string, Partial<Scene>>();
  const unknown = new Set<string>();
  const addPatch = (id: string, p: Partial<Scene>) => patches.set(id, { ...(patches.get(id) ?? {}), ...p });

  let maxProductionOrder = scenes.reduce((m, s) => Math.max(m, s.productionOrder), -1);

  // Story order: scenes in the script first (script order), then the rest as they were.
  const notInScript = scenes.filter((s) => !inScriptIds.has(s.id)).sort((a, b) => a.order - b.order);

  for (const seg of segments) {
    const parsed = parseHeading(seg.heading);
    const len = lengths.get(seg.sceneId) ?? { eighths: 1, seconds: 0, lines: 0 };
    const matchedChars = seg.cues
      .map((cue) => {
        const id = matchCharacter(cue, characters);
        if (!id) unknown.add(cue);
        return id;
      })
      .filter((id): id is string => !!id);
    const ex = excerpt(seg.body);
    const existing = byId.get(seg.sceneId);

    if (!existing) {
      creates.push({
        id: seg.sceneId,
        projectId,
        order: seg.index,
        productionOrder: ++maxProductionOrder,
        heading: seg.heading,
        intExt: parsed.intExt,
        locationName: parsed.locationName,
        timeOfDay: parsed.timeOfDay,
        summary: '',
        locationId: matchLocation(parsed.locationName, locations),
        characterIds: [...new Set(matchedChars)],
        propsNotes: '',
        wardrobeNotes: '',
        sfxNotes: '',
        status: 'planning',
        notes: '',
        inScript: true,
        pageEighths: len.eighths,
        scriptSec: len.seconds,
        scriptExcerpt: ex,
        scriptCues: seg.cues,
      });
      continue;
    }

    const p: Partial<Scene> = {};
    if (existing.heading !== seg.heading) {
      p.heading = seg.heading;
      p.intExt = parsed.intExt;
      p.locationName = parsed.locationName;
      p.timeOfDay = parsed.timeOfDay;
    }
    if (!existing.inScript) p.inScript = true;
    const newChars = matchedChars.filter((id) => !existing.characterIds.includes(id));
    if (newChars.length) p.characterIds = [...existing.characterIds, ...new Set(newChars)];
    if (!existing.locationId) {
      const loc = matchLocation(p.locationName ?? existing.locationName, locations);
      if (loc) p.locationId = loc;
    }
    if (existing.pageEighths !== len.eighths) p.pageEighths = len.eighths;
    if (existing.scriptSec !== len.seconds) p.scriptSec = len.seconds;
    if (existing.scriptExcerpt !== ex) p.scriptExcerpt = ex;
    if ((existing.scriptCues ?? []).join('|') !== seg.cues.join('|')) p.scriptCues = seg.cues;
    if (Object.keys(p).length) addPatch(existing.id, p);
  }

  for (const s of notInScript) {
    if (s.inScript) addPatch(s.id, { inScript: false });
  }

  // Re-number story order.
  const ordered: string[] = [...segments.map((s) => s.sceneId), ...notInScript.map((s) => s.id)];
  ordered.forEach((id, idx) => {
    const existing = byId.get(id);
    if (existing && existing.order !== idx) addPatch(id, { order: idx });
    const created = creates.find((c) => c.id === id);
    if (created) created.order = idx;
  });

  return {
    creates,
    updates: [...patches.entries()].map(([id, patch]) => ({ id, patch })),
    unknownCues: [...unknown],
  };
}

/**
 * Move a scene's block of script (heading through the line before the next
 * heading) so it sits before `beforeSceneId` (or at the end when undefined).
 */
export function moveSceneBlock(elements: ScriptElement[], sceneId: string, beforeSceneId: string | undefined): ScriptElement[] {
  const headingIdx = elements.findIndex((e) => e.type === 'scene' && e.sceneId === sceneId);
  if (headingIdx < 0) return elements;
  let end = headingIdx + 1;
  while (end < elements.length && !(elements[end].type === 'scene' && elements[end].sceneId)) end++;
  const block = elements.slice(headingIdx, end);
  const rest = [...elements.slice(0, headingIdx), ...elements.slice(end)];
  if (!beforeSceneId) return [...rest, ...block];
  const target = rest.findIndex((e) => e.type === 'scene' && e.sceneId === beforeSceneId);
  if (target < 0) return [...rest, ...block];
  return [...rest.slice(0, target), ...block, ...rest.slice(target)];
}
