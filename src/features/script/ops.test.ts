import { describe, expect, it } from 'vitest';
import type { ScriptElement } from '@/lib/types';
import {
  adoptSceneIds,
  characterSuggestions,
  enterConversion,
  findMatches,
  insertElements,
  mergeWithNext,
  mergeWithPrevious,
  replaceAllMatches,
  sceneSuggestions,
  splitAt,
  typingConversion,
  withType,
} from './ops';

let n = 0;
const E = (type: ScriptElement['type'], text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({ id: `e${n++}`, type, text, ...extra });

describe('element ops', () => {
  it('splits with screenplay flow', () => {
    const els = [E('character', 'MARA')];
    const r = splitAt(els, 0, 4, 4);
    expect(r.elements.map((e) => e.type)).toEqual(['character', 'dialogue']);
    expect(r.sel.id).toBe(r.elements[1].id);
    const mid = splitAt([E('action', 'One. Two.')], 0, 4, 4);
    expect(mid.elements.map((e) => [e.type, e.text])).toEqual([['action', 'One.'], ['action', ' Two.']]);
    const top = splitAt([E('dialogue', 'Hi')], 0, 0, 0);
    expect(top.elements).toHaveLength(2);
    expect(top.elements[1].text).toBe('Hi');
  });

  it('creates parentheticals with parentheses and caret inside', () => {
    const r = splitAt([E('character', 'ELI'), E('dialogue', 'x')], 0, 3, 3);
    expect(r.elements[1].type).toBe('dialogue');
    const p = withType(E('dialogue', ''), 'parenthetical');
    expect(p.el.text).toBe('()');
    expect(p.caret).toBe(1);
    expect(withType(E('dialogue', 'beat'), 'parenthetical').el.text).toBe('(beat)');
    expect(withType(E('parenthetical', '(beat)'), 'dialogue').el.text).toBe('beat');
  });

  it('uppercases and assigns scene ids', () => {
    const s = withType(E('action', 'int. bar - night'), 'scene').el;
    expect(s.text).toBe('INT. BAR - NIGHT');
    expect(s.sceneId).toBeTruthy();
  });

  it('merges neighbours', () => {
    const els = [E('action', 'Hello'), E('action', ' world')];
    expect(mergeWithPrevious(els, 1)!.elements[0].text).toBe('Hello world');
    expect(mergeWithNext(els, 0)!.elements[0].text).toBe('Hello world');
    expect(mergeWithPrevious(els, 0)).toBeNull();
    expect(mergeWithPrevious([E('action', 'a'), E('dialogue', '')], 1)!.elements).toHaveLength(1);
  });

  it('inserts pasted elements around the caret', () => {
    const els = [E('action', 'BeforeAfter')];
    const r = insertElements(els, 0, 6, 6, [E('character', 'X'), E('dialogue', 'y')]);
    expect(r.elements.map((e) => e.text)).toEqual(['Before', 'X', 'y', 'After']);
  });

  it('converts capitals on Enter and headings while typing', () => {
    const names = new Set(['MARA']);
    expect(enterConversion(E('action', 'MARA (V.O.)'), names)).toBe('character');
    expect(enterConversion(E('action', 'CUT TO:'), names)).toBe('transition');
    expect(enterConversion(E('action', 'BANG!'), names)).toBeNull();
    expect(enterConversion(E('action', 'Mara'), names)).toBeNull();
    expect(typingConversion(E('action', 'int'), 'int.')).toBe('scene');
    expect(typingConversion(E('action', 'Inter'), 'Interior')).toBeNull();
  });

  it('suggests cues and heading parts', () => {
    expect(characterSuggestions('MA', ['MARA', 'MALCOLM', 'ELI']).map((s) => s.value)).toEqual(['MARA', 'MALCOLM']);
    expect(characterSuggestions('MARA (V', ['MARA'])[0].value).toBe('MARA (V.O.)');
    expect(sceneSuggestions('', []).map((s) => s.value)).toContain('INT. ');
    expect(sceneSuggestions('INT. KI', ['KITCHEN', 'PORCH']).map((s) => s.value)).toEqual(['INT. KITCHEN - ']);
    expect(sceneSuggestions('INT. KITCHEN - NI', [])[0].value).toBe('INT. KITCHEN - NIGHT');
  });

  it('keeps typed text when adopting scene ids', () => {
    const cur = [E('scene', 'INT. A - DAY', { sceneId: 'x' }), E('action', 'typed since')];
    const norm = [{ ...cur[0], sceneId: 'y' }, { ...cur[1], text: 'old' }];
    const out = adoptSceneIds(cur, norm);
    expect(out[0].sceneId).toBe('y');
    expect(out[1].text).toBe('typed since');
    expect(adoptSceneIds(cur, cur)).toBe(cur);
  });

  it('finds and replaces', () => {
    const els = [E('action', 'The cat sat. The CAT ran.'), E('character', 'CAT')];
    expect(findMatches(els, 'cat', false)).toHaveLength(3);
    expect(findMatches(els, 'cat', true)).toHaveLength(1);
    const r = replaceAllMatches(els, 'cat', 'dog', false);
    expect(r.count).toBe(3);
    expect(r.elements[0].text).toBe('The dog sat. The dog ran.');
    expect(r.elements[1].text).toBe('DOG');
  });
});
