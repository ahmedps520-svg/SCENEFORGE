import { describe, expect, it } from 'vitest';
import type { ScriptElement } from '@/lib/types';
import { countCues, cueVariants, levenshtein, renameCues, speechStats } from './characterUtils';

let n = 0;
const E = (type: ScriptElement['type'], text: string, sceneId?: string): ScriptElement => ({ id: `e${n++}`, type, text, ...(sceneId ? { sceneId } : {}) });

const script: ScriptElement[] = [
  E('scene', 'INT. DINER - NIGHT', 's1'),
  E('character', 'MARA'),
  E('dialogue', 'Coffee, black.'),
  E('character', 'MARA (CONT\'D)'),
  E('parenthetical', '(softer)'),
  E('dialogue', 'Please.'),
  E('character', 'MR. HALE'),
  E('dialogue', 'Coming right up.'),
  E('scene', 'EXT. LOT - NIGHT', 's2'),
  E('character', 'MARRA (V.O.)'),
  E('dialogue', 'Keep driving.'),
  E('character', 'HALE'),
  E('dialogue', 'Fine.'),
];

const mara = { id: 'c1', name: 'Mara', aliases: [] as string[] };
const hale = { id: 'c2', name: 'Mr. Hale', aliases: ['Hale'] };

describe('character helpers', () => {
  it('counts speeches, words and scenes', () => {
    const st = speechStats(script, [mara, hale]);
    expect(st.get('c1')).toMatchObject({ speeches: 2, words: 3 });
    expect([...st.get('c1')!.sceneIds]).toEqual(['s1']);
    expect(st.get('c2')!.speeches).toBe(2);
    expect([...st.get('c2')!.sceneIds].sort()).toEqual(['s1', 's2']);
  });

  it('finds spelling variants that are not aliases', () => {
    expect(cueVariants(script, mara, [mara, hale])).toEqual([{ name: 'MARRA', count: 1 }]);
    expect(cueVariants(script, hale, [mara, hale])).toEqual([]);
  });

  it('computes edit distance', () => {
    expect(levenshtein('MARA', 'MARRA')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('renames cues and keeps extensions', () => {
    const { elements, count } = renameCues(script, 'Mara', 'Marisol');
    expect(count).toBe(2);
    expect(elements[1].text).toBe('MARISOL');
    expect(elements[3].text).toBe("MARISOL (CONT'D)");
    expect(countCues(elements, 'Marisol')).toBe(2);
    expect(renameCues(script, 'Nobody', 'X').elements).toBe(script);
  });
});
