import type { ProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import { buildReadinessContext, filmingDates, sceneBlockers, sceneReadiness, type Blocker, type Readiness } from '@/lib/readiness';
import type { Character, Item, Location, Scene, Shot, StoryboardFrame } from '@/lib/types';

/** Everything a scene card or detail panel needs, derived once per render. */
export interface SceneInfo {
  scene: Scene;
  number: string;
  blockers: Blocker[];
  readiness: Readiness;
  frames: StoryboardFrame[];
  shots: Shot[];
  items: Item[];
  dates: string[];
  location?: Location;
  characters: Character[];
  /** Manual override, else the script-derived estimate. 0 when unknown. */
  durationSec: number;
}

export function buildSceneInfo(data: ProjectData): { infos: Map<string, SceneInfo>; numbers: Map<string, string> } {
  const numbers = sceneNumbers(data.scenes);
  const ctx = buildReadinessContext(data);
  const framesBy = groupBy(data.frames, (f) => f.sceneId);
  const shotsBy = groupBy(data.shots, (s) => s.sceneId);
  const infos = new Map<string, SceneInfo>();
  for (const scene of data.scenes) {
    const blockers = sceneBlockers(scene, ctx);
    infos.set(scene.id, {
      scene,
      number: numbers.get(scene.id) ?? '–',
      blockers,
      readiness: sceneReadiness(scene, blockers),
      frames: (framesBy.get(scene.id) ?? []).sort((a, b) => a.order - b.order),
      shots: (shotsBy.get(scene.id) ?? []).sort((a, b) => a.order - b.order),
      items: data.items.filter((i) => i.sceneIds.includes(scene.id)),
      dates: filmingDates(scene.id, data.events),
      location: scene.locationId ? ctx.locations.get(scene.locationId) : undefined,
      characters: scene.characterIds.map((id) => ctx.characters.get(id)).filter((c): c is Character => !!c),
      durationSec: scene.estDurationSec ?? scene.scriptSec ?? 0,
    });
  }
  return { infos, numbers };
}

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/**
 * Parse a duration typed by the user: "1:30" (m:ss), "1:02:00" (h:mm:ss) or a
 * whole number of minutes ("2"). Returns seconds, null when empty, or NaN when invalid.
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60);
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return NaN;
  return nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2];
}

export const INT_EXT_OPTIONS = [
  { value: 'INT', label: 'INT.' },
  { value: 'EXT', label: 'EXT.' },
  { value: 'INT/EXT', label: 'INT./EXT.' },
  { value: '', label: '—' },
] as const;
