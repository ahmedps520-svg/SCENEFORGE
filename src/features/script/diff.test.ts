import { describe, expect, it } from 'vitest';
import type { ScriptElement } from '@/lib/types';
import { diffElements, summarize } from './diff';

let n = 0;
const E = (type: ScriptElement['type'], text: string): ScriptElement => ({ id: `e${n++}`, type, text });

describe('diffElements', () => {
  it('reports identical drafts as unchanged', () => {
    const a = [E('scene', 'INT. A - DAY'), E('action', 'x')];
    const ops = diffElements(a, a.map((e) => ({ ...e, id: e.id + 'b' })));
    expect(summarize(ops)).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(ops).toHaveLength(2);
  });

  it('finds additions, removals and in-place changes', () => {
    const a = [E('scene', 'INT. A - DAY'), E('action', 'She waits.'), E('character', 'MARA'), E('dialogue', 'Hello?'), E('action', 'Gone.')];
    const b = [E('scene', 'INT. A - DAY'), E('action', 'She waits by the door.'), E('character', 'MARA'), E('dialogue', 'Hello?'), E('character', 'ELI'), E('dialogue', 'Here.')];
    const ops = diffElements(a, b);
    const s = summarize(ops);
    expect(s.changed).toBe(1);
    expect(ops.find((o) => o.kind === 'changed')).toMatchObject({ a: { text: 'She waits.' }, b: { text: 'She waits by the door.' } });
    expect(s.added + s.removed).toBeGreaterThanOrEqual(2);
    expect(ops.filter((o) => o.kind === 'same').map((o) => (o as { a: ScriptElement }).a.text)).toEqual(['INT. A - DAY', 'MARA', 'Hello?']);
  });

  it('handles empty sides', () => {
    expect(summarize(diffElements([], [E('action', 'new')]))).toEqual({ added: 1, removed: 0, changed: 0 });
    expect(summarize(diffElements([E('action', 'old')], []))).toEqual({ added: 0, removed: 1, changed: 0 });
  });

  it('copes with large scripts quickly', () => {
    const a = Array.from({ length: 2000 }, (_, i) => E('action', `line ${i}`));
    const b = a.map((e, i) => (i % 100 === 0 ? { ...e, text: e.text + '!' } : e));
    const t0 = Date.now();
    const s = summarize(diffElements(a, b));
    expect(s.changed).toBe(20);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
