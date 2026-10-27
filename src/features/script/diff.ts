import type { ScriptElement } from '@/lib/types';

/**
 * Element-level comparison of two drafts (LCS on type + text). Adjacent
 * removals and additions of the same element type are paired as changes.
 */

export type DiffOp =
  | { kind: 'same'; a: ScriptElement; b: ScriptElement }
  | { kind: 'added'; b: ScriptElement }
  | { kind: 'removed'; a: ScriptElement }
  | { kind: 'changed'; a: ScriptElement; b: ScriptElement };

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
}

const key = (e: ScriptElement) => `${e.type}\u0001${e.text.trim()}`;

/** Above this many cells, fall back to a positional comparison of the middle. */
const MAX_CELLS = 9_000_000;

export function diffElements(a: ScriptElement[], b: ScriptElement[]): DiffOp[] {
  const ka = a.map(key);
  const kb = b.map(key);
  let start = 0;
  while (start < a.length && start < b.length && ka[start] === kb[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && ka[endA - 1] === kb[endB - 1]) {
    endA--;
    endB--;
  }

  const head: DiffOp[] = [];
  for (let i = 0; i < start; i++) head.push({ kind: 'same', a: a[i], b: b[i] });
  const tail: DiffOp[] = [];
  for (let i = endA, j = endB; i < a.length; i++, j++) tail.push({ kind: 'same', a: a[i], b: b[j] });

  const n = endA - start;
  const m = endB - start;
  let middle: DiffOp[] = [];
  if (n * m > MAX_CELLS) {
    for (let i = 0; i < n; i++) middle.push({ kind: 'removed', a: a[start + i] });
    for (let j = 0; j < m; j++) middle.push({ kind: 'added', b: b[start + j] });
  } else {
    // dp[i][j] = LCS length of a[start+i..] and b[start+j..]
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = ka[start + i] === kb[start + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ka[start + i] === kb[start + j]) {
        middle.push({ kind: 'same', a: a[start + i], b: b[start + j] });
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        middle.push({ kind: 'removed', a: a[start + i] });
        i++;
      } else {
        middle.push({ kind: 'added', b: b[start + j] });
        j++;
      }
    }
    while (i < n) middle.push({ kind: 'removed', a: a[start + i++] });
    while (j < m) middle.push({ kind: 'added', b: b[start + j++] });
  }

  middle = pairChanges(middle);
  return [...head, ...middle, ...tail];
}

/** Turn runs of [removed…, added…] into "changed" pairs where the element types line up. */
function pairChanges(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].kind !== 'removed') {
      out.push(ops[i++]);
      continue;
    }
    const removed: ScriptElement[] = [];
    while (i < ops.length && ops[i].kind === 'removed') removed.push((ops[i++] as { a: ScriptElement }).a);
    const added: ScriptElement[] = [];
    while (i < ops.length && ops[i].kind === 'added') added.push((ops[i++] as { b: ScriptElement }).b);
    let r = 0;
    let ad = 0;
    while (r < removed.length || ad < added.length) {
      if (r < removed.length && ad < added.length && removed[r].type === added[ad].type) {
        out.push({ kind: 'changed', a: removed[r++], b: added[ad++] });
      } else if (r < removed.length && (ad >= added.length || removed.length - r >= added.length - ad)) {
        out.push({ kind: 'removed', a: removed[r++] });
      } else {
        out.push({ kind: 'added', b: added[ad++] });
      }
    }
  }
  return out;
}

export function summarize(ops: DiffOp[]): DiffSummary {
  const s = { added: 0, removed: 0, changed: 0 };
  for (const o of ops) if (o.kind !== 'same') s[o.kind]++;
  return s;
}
