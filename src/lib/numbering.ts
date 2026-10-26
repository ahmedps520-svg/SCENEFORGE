import type { Scene, Shot, StoryboardFrame } from './types';

/** Scene numbers follow story order: 1, 2, 3… */
export function sceneNumbers(scenes: Pick<Scene, 'id' | 'order'>[]): Map<string, string> {
  const sorted = [...scenes].sort((a, b) => a.order - b.order);
  return new Map(sorted.map((s, i) => [s.id, String(i + 1)]));
}

/** 0 → A, 25 → Z, 26 → AA */
export function letterIndex(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Shot identifiers like 4A, 4B… unless the shot has its own code. */
export function shotCodes(shots: Pick<Shot, 'id' | 'sceneId' | 'order' | 'code'>[], numbers: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const byScene = new Map<string, typeof shots>();
  for (const s of shots) {
    const list = byScene.get(s.sceneId) ?? [];
    list.push(s);
    byScene.set(s.sceneId, list);
  }
  for (const [sceneId, list] of byScene) {
    const n = numbers.get(sceneId) ?? '?';
    [...list]
      .sort((a, b) => a.order - b.order)
      .forEach((s, i) => out.set(s.id, s.code.trim() || `${n}${letterIndex(i)}`));
  }
  return out;
}

/** Storyboard frame numbers like 4.1, 4.2… unless the frame has its own number. */
export function frameNumbers(frames: Pick<StoryboardFrame, 'id' | 'sceneId' | 'order' | 'shotNumber'>[], numbers: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const byScene = new Map<string, typeof frames>();
  for (const f of frames) {
    const list = byScene.get(f.sceneId) ?? [];
    list.push(f);
    byScene.set(f.sceneId, list);
  }
  for (const [sceneId, list] of byScene) {
    const n = numbers.get(sceneId) ?? '?';
    [...list]
      .sort((a, b) => a.order - b.order)
      .forEach((f, i) => out.set(f.id, f.shotNumber.trim() || `${n}.${i + 1}`));
  }
  return out;
}
