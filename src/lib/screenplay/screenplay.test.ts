import { describe, expect, it } from 'vitest';
import type { ScriptElement } from '../types';
import { buildHeading, looksLikeHeading, parseHeading } from './heading';
import { parseFountain, toFountain } from './fountain';
import { formatEighths, paginate, scriptStats, wrapText } from './paginate';
import { cueName, moveSceneBlock, normalizeElements, planSceneSync, segmentScenes } from './sync';

const E = (type: ScriptElement['type'], text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({
  id: Math.random().toString(36).slice(2),
  type,
  text,
  ...extra,
});

describe('scene headings', () => {
  it('parses the standard parts', () => {
    expect(parseHeading('INT. KITCHEN - NIGHT')).toEqual({ intExt: 'INT', locationName: 'KITCHEN', timeOfDay: 'NIGHT' });
    expect(parseHeading('ext. park - bench - day')).toEqual({ intExt: 'EXT', locationName: 'PARK - BENCH', timeOfDay: 'DAY' });
    expect(parseHeading('INT./EXT. CAR - MOVING - CONTINUOUS').intExt).toBe('INT/EXT');
    expect(parseHeading('I/E. TRUCK - DUSK').intExt).toBe('INT/EXT');
    expect(parseHeading('INT. HOUSE - KITCHEN')).toEqual({ intExt: 'INT', locationName: 'HOUSE - KITCHEN', timeOfDay: '' });
    expect(parseHeading('INT. DINER - DAY #12A#').timeOfDay).toBe('DAY');
  });
  it('builds headings', () => {
    expect(buildHeading('INT/EXT', 'car', 'night')).toBe('INT./EXT. CAR - NIGHT');
    expect(buildHeading('EXT', 'Roof', '')).toBe('EXT. ROOF');
  });
  it('detects headings', () => {
    expect(looksLikeHeading('INT. ROOM')).toBe(true);
    expect(looksLikeHeading('Interior design')).toBe(false);
  });
});

describe('fountain', () => {
  const sample = `Title: The Long Night
Author: A. Writer

INT. LIGHTHOUSE - NIGHT

Waves hammer the glass.

MARA
(whispering)
Do you hear that?

ELI (O.S.)
It's just the wind.

CUT TO:

EXT. CLIFF - CONTINUOUS

!SILENCE.

> THE END <
`;
  it('parses elements and the title page', () => {
    const { titlePage, elements } = parseFountain(sample);
    expect(titlePage.title).toBe('The Long Night');
    expect(titlePage.author).toBe('A. Writer');
    expect(elements.map((e) => e.type)).toEqual([
      'scene', 'action', 'character', 'parenthetical', 'dialogue', 'character', 'dialogue', 'transition', 'scene', 'action', 'centered',
    ]);
    expect(elements.filter((e) => e.type === 'scene').every((e) => !!e.sceneId)).toBe(true);
  });
  it('round-trips through export', () => {
    const first = parseFountain(sample);
    const again = parseFountain(toFountain(first.elements, first.titlePage));
    expect(again.elements.map((e) => [e.type, e.text])).toEqual(first.elements.map((e) => [e.type, e.text]));
    expect(again.titlePage.title).toBe('The Long Night');
  });
  it('forces ambiguous action lines', () => {
    const out = toFountain([E('action', 'BOOM'), E('character', 'McCLANE'), E('dialogue', 'Yippee.')]);
    expect(out).toContain('!BOOM');
    expect(out).toContain('@McCLANE');
  });
});

describe('pagination', () => {
  it('wraps at word boundaries', () => {
    expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });
  it('produces about one page per 54 lines and estimates runtime', () => {
    const els: ScriptElement[] = [E('scene', 'INT. ROOM - DAY', { sceneId: 's1' })];
    for (let i = 0; i < 60; i++) els.push(E('action', 'A line of action that fits on one line.'));
    const p = paginate(els);
    expect(p.pages.length).toBeGreaterThanOrEqual(2);
    for (const page of p.pages) expect(page.length).toBeLessThanOrEqual(54);
    const stats = scriptStats(els);
    expect(stats.pageCount).toBe(p.pages.length);
    expect(stats.runtimeSec).toBeGreaterThan(60);
  });
  it('breaks long dialogue with (MORE) and (CONT’D)', () => {
    const els: ScriptElement[] = [E('scene', 'INT. ROOM - DAY', { sceneId: 's1' })];
    for (let i = 0; i < 45; i++) els.push(E('action', 'Filler.'));
    els.push(E('character', 'MARA'));
    els.push(E('dialogue', Array.from({ length: 40 }, (_, i) => `word${i} and more words to wrap`).join(' ')));
    const p = paginate(els);
    const all = p.pages.flat();
    expect(all.some((l) => l.text === '(MORE)')).toBe(true);
    expect(all.some((l) => l.text === "MARA (CONT'D)")).toBe(true);
  });
  it('never leaves a scene heading at the bottom of a page', () => {
    const els: ScriptElement[] = [];
    for (let i = 0; i < 52; i++) els.push(E('action', 'x'));
    els.push(E('scene', 'INT. NEXT - DAY', { sceneId: 's2' }));
    els.push(E('action', 'After the heading.'));
    const p = paginate(els);
    const headingPage = p.pages.findIndex((pg) => pg.some((l) => l.kind === 'scene'));
    expect(p.pages[headingPage].some((l) => l.text === 'AFTER THE HEADING.' || l.text === 'After the heading.')).toBe(true);
  });
  it('formats eighths', () => {
    expect(formatEighths(11)).toBe('1 3/8');
    expect(formatEighths(8)).toBe('1');
    expect(formatEighths(3)).toBe('3/8');
  });
});

describe('scene sync', () => {
  it('strips cue extensions', () => {
    expect(cueName("mara (V.O.) (CONT'D)")).toBe('MARA');
  });
  it('normalizes duplicate scene ids', () => {
    const els = [E('scene', 'INT. A - DAY', { sceneId: 'x' }), E('scene', 'INT. B - DAY', { sceneId: 'x' }), E('scene', 'INT. C - DAY')];
    const out = normalizeElements(els);
    const ids = out.map((e) => e.sceneId);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('x');
  });
  it('creates, updates and orphans scenes without deleting', () => {
    const els = [
      E('scene', 'INT. KITCHEN - NIGHT', { sceneId: 'a' }),
      E('action', 'Mara enters.'),
      E('character', 'MARA'),
      E('dialogue', 'Hello?'),
      E('scene', 'EXT. PORCH - NIGHT', { sceneId: 'b' }),
    ];
    const plan = planSceneSync({
      projectId: 'p',
      elements: els,
      scenes: [
        { id: 'b', order: 5, heading: 'EXT. YARD - NIGHT', inScript: true, characterIds: [], productionOrder: 0, locationName: 'YARD', scriptCues: [] } as any,
        { id: 'old', order: 1, heading: 'INT. GONE - DAY', inScript: true, characterIds: [], productionOrder: 1, scriptCues: [] } as any,
      ],
      characters: [{ id: 'c1', name: 'Mara', aliases: [] }],
      locations: [{ id: 'l1', name: 'Kitchen' }],
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({ id: 'a', order: 0, locationId: 'l1', characterIds: ['c1'], inScript: true });
    const b = plan.updates.find((u) => u.id === 'b')!.patch;
    expect(b).toMatchObject({ heading: 'EXT. PORCH - NIGHT', locationName: 'PORCH', order: 1 });
    const old = plan.updates.find((u) => u.id === 'old')!.patch;
    expect(old).toMatchObject({ inScript: false, order: 2 });
  });
  it('segments scenes and moves blocks', () => {
    const els = [
      E('scene', 'INT. A - DAY', { sceneId: 'a' }),
      E('action', 'a1'),
      E('scene', 'INT. B - DAY', { sceneId: 'b' }),
      E('action', 'b1'),
      E('scene', 'INT. C - DAY', { sceneId: 'c' }),
    ];
    expect(segmentScenes(els).map((s) => s.sceneId)).toEqual(['a', 'b', 'c']);
    const moved = moveSceneBlock(els, 'c', 'a');
    expect(segmentScenes(moved).map((s) => s.sceneId)).toEqual(['c', 'a', 'b']);
    expect(moved[2].text).toBe('a1');
  });
});
