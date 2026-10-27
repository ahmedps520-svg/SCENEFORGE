import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { toast } from '@/components/ui';
import { ELEMENT_TYPES } from '@/lib/constants';
import { emptyElements } from '@/lib/data/factories';
import { saveScript, saveVersion } from '@/lib/data/scripts';
import { parsePaste } from '@/lib/screenplay/fountain';
import type { ElementType, Script, ScriptElement } from '@/lib/types';
import { caretOnFirstLine, caretOnLastLine } from './caret';
import {
  adoptSceneIds,
  characterSuggestions,
  enterConversion,
  headingLocations,
  insertElements,
  isUpperType,
  mergeWithNext,
  mergeWithPrevious,
  newElement,
  NEXT_TYPE,
  replaceAt,
  sceneSuggestions,
  scriptCueNames,
  signature,
  splitAt,
  TAB_NEXT,
  TAB_PREV,
  typingConversion,
  withType,
  type Sel,
  type Suggestion,
} from './ops';
import { saveElementsAsVersion } from './versions';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

interface Snap {
  elements: ScriptElement[];
  sel?: Sel;
}

export interface Conflict {
  theirs: ScriptElement[];
  at: number;
}

export interface EditorOptions {
  /** Live script record (re-rendered whenever IndexedDB changes). */
  script: Script;
  /** Upper-case character profile names and aliases; cue names used in the script are added automatically. */
  knownNames: string[];
  /** Upper-case location profile names; locations used in headings are added automatically. */
  locations: string[];
  onUnknownCues: (cues: string[]) => void;
  onFind: () => void;
  onSaveVersion: () => void;
}

const SAVE_DELAY = 800;
const NO_SUGGESTIONS: Suggestion[] = [];
const COALESCE_GAP = 1500;
const COALESCE_RUN = 4000;

export function useScriptEditor(opts: EditorOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const scriptId = opts.script.id;

  const [elements, setElementsState] = useState<ScriptElement[]>(() => (opts.script.elements.length ? opts.script.elements : emptyElements()));
  const elementsRef = useRef(elements);

  const rowRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const selRef = useRef<Sel | null>(null);
  const pendingSel = useRef<Sel | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const run = useRef<{ key: string; at: number; started: number } | null>(null);

  const [saveState, setSaveStateRaw] = useState<SaveState>('saved');
  const saveStateRef = useRef<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(opts.script.updatedAt);
  const dirty = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef(signature(opts.script.elements));
  const sent = useRef<string[]>([]);
  const [conflict, setConflictState] = useState<Conflict | null>(null);
  const conflictRef = useRef<Conflict | null>(null);

  const [ac, setAcState] = useState<{ index: number; explicit: boolean; dismissedKey: string | null }>({ index: -1, explicit: false, dismissedKey: null });
  const acRef = useRef(ac);
  const suggestionsRef = useRef<Suggestion[]>([]);
  const acIndexRef = useRef(-1);

  // Apply a requested caret position after React has rendered the change.
  useLayoutEffect(() => {
    const s = pendingSel.current;
    if (!s) return;
    pendingSel.current = null;
    const ta = rowRefs.current.get(s.id);
    if (!ta) return;
    if (document.activeElement !== ta) ta.focus({ preventScroll: true });
    const len = ta.value.length;
    ta.setSelectionRange(Math.min(s.start, len), Math.min(s.end ?? s.start, len));
    selRef.current = { id: s.id, start: s.start, end: s.end ?? s.start };
    ta.closest('.sf-row')?.scrollIntoView({ block: 'nearest' });
  });

  const api = useMemo(() => {
    const setEls = (els: ScriptElement[]) => {
      elementsRef.current = els;
      setElementsState(els);
    };
    const setSaveState = (s: SaveState) => {
      saveStateRef.current = s;
      setSaveStateRaw(s);
    };
    const setConflict = (c: Conflict | null) => {
      conflictRef.current = c;
      setConflictState(c);
    };
    const setAc = (a: typeof acRef.current) => {
      acRef.current = a;
      setAcState(a);
    };
    const resetAc = () => setAc({ index: -1, explicit: false, dismissedKey: null });

    const schedule = (delay = SAVE_DELAY) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (conflictRef.current) return;
      timer.current = setTimeout(() => void runSave(), delay);
    };

    const markDirty = () => {
      dirty.current = true;
      if (saveStateRef.current !== 'error' && saveStateRef.current !== 'saving') setSaveState('pending');
      schedule();
    };

    async function runSave(): Promise<void> {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (conflictRef.current) return;
      if (saving.current) {
        await saving.current;
        if (dirty.current) return runSave();
        return;
      }
      if (!dirty.current) return;
      const els = elementsRef.current;
      dirty.current = false;
      sent.current = [...sent.current.slice(-9), signature(els)];
      setSaveState('saving');
      let failed = false;
      const p = (async () => {
        try {
          const res = await saveScript(scriptId, els);
          baseline.current = signature(res.elements);
          const adopted = adoptSceneIds(elementsRef.current, res.elements);
          if (adopted !== elementsRef.current) setEls(adopted);
          setLastSavedAt(Date.now());
          setSaveError(null);
          setSaveState(dirty.current ? 'pending' : 'saved');
          optsRef.current.onUnknownCues(res.unknownCues);
        } catch (e) {
          failed = true;
          dirty.current = true;
          setSaveError(e instanceof Error ? e.message : String(e));
          setSaveState('error');
        }
      })();
      saving.current = p;
      await p;
      saving.current = null;
      if (dirty.current) schedule(failed ? 5000 : SAVE_DELAY);
    }

    /** Record the current state for undo, then apply `next`. */
    const commit = (next: ScriptElement[], o: { sel?: Sel; key?: string; markDirty?: boolean } = {}) => {
      const now = Date.now();
      const r = run.current;
      const coalesce = !!o.key && !!r && r.key === o.key && now - r.at < COALESCE_GAP && now - r.started < COALESCE_RUN;
      if (!coalesce) {
        past.current.push({ elements: elementsRef.current, sel: selRef.current ?? undefined });
        if (past.current.length > 400) past.current.shift();
        setHistoryTick((t) => t + 1);
      }
      if (future.current.length) {
        future.current = [];
        setHistoryTick((t) => t + 1);
      }
      run.current = o.key ? { key: o.key, at: now, started: coalesce && r ? r.started : now } : null;
      if (o.sel) pendingSel.current = o.sel;
      setEls(next);
      if (o.markDirty !== false) markDirty();
    };

    const undo = () => {
      const s = past.current.pop();
      if (!s) return;
      future.current.push({ elements: elementsRef.current, sel: selRef.current ?? undefined });
      run.current = null;
      pendingSel.current = s.sel ?? null;
      setEls(s.elements);
      setHistoryTick((t) => t + 1);
      markDirty();
    };

    const redo = () => {
      const s = future.current.pop();
      if (!s) return;
      past.current.push({ elements: elementsRef.current, sel: selRef.current ?? undefined });
      run.current = null;
      pendingSel.current = s.sel ?? null;
      setEls(s.elements);
      setHistoryTick((t) => t + 1);
      markDirty();
    };

    const indexOf = (id: string) => elementsRef.current.findIndex((e) => e.id === id);

    const focusElement = (id: string, start?: number, end?: number, block: ScrollLogicalPosition = 'nearest') => {
      const ta = rowRefs.current.get(id);
      if (!ta) return;
      ta.focus({ preventScroll: true });
      const len = ta.value.length;
      const s = Math.min(start ?? len, len);
      ta.setSelectionRange(s, Math.min(end ?? s, len));
      selRef.current = { id, start: s, end: end ?? s };
      ta.closest('.sf-row')?.scrollIntoView({ block });
    };

    const setTypeAt = (idx: number, type: ElementType, caret?: number) => {
      const els = elementsRef.current;
      const el = els[idx];
      if (!el || el.type === type) return;
      const r = withType(el, type);
      commit(replaceAt(els, idx, r.el), { sel: { id: el.id, start: r.caret ?? Math.min(caret ?? r.el.text.length, r.el.text.length) } });
      resetAc();
    };

    const enter = (idx: number, start: number, end: number) => {
      const els = elementsRef.current;
      const el = els[idx];
      if (!el.text.trim()) {
        if (el.type !== 'action') {
          const r = withType({ ...el, text: '' }, 'action');
          commit(replaceAt(els, idx, r.el), { sel: { id: el.id, start: 0 } });
        }
        return;
      }
      const parenEnd = el.type === 'parenthetical' && el.text.endsWith(')') && end >= el.text.length - 1;
      const atEnd = start === end && (end === el.text.length || parenEnd);
      if (atEnd) {
        const conv = enterConversion(el, new Set([...optsRef.current.knownNames, ...scriptCueNames(elementsRef.current)]));
        if (conv) {
          const converted = withType(el, conv).el;
          const nt = NEXT_TYPE[conv];
          const created = withType(newElement(nt), nt);
          commit([...els.slice(0, idx), converted, created.el, ...els.slice(idx + 1)], { sel: { id: created.el.id, start: created.caret ?? 0 } });
          return;
        }
        const pos = parenEnd ? el.text.length : start;
        const r = splitAt(els, idx, pos, pos);
        commit(r.elements, { sel: r.sel });
        return;
      }
      const r = splitAt(els, idx, start, end);
      commit(r.elements, { sel: r.sel });
    };

    const acceptSuggestion = (idx: number, s: Suggestion): string => {
      const els = elementsRef.current;
      const el = els[idx];
      const r = withType({ ...el, text: s.value }, el.type);
      commit(replaceAt(els, idx, r.el), { sel: { id: el.id, start: r.el.text.length } });
      resetAc();
      return r.el.text;
    };

    const onChange = (id: string, e: ChangeEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      const idx = indexOf(id);
      if (idx < 0) return;
      const els = elementsRef.current;
      const el = els[idx];
      const selStart = ta.selectionStart;
      const selEnd = ta.selectionEnd;
      let value = ta.value;
      let restoreCaret = false;
      if (isUpperType(el.type)) {
        const up = value.toUpperCase();
        if (up !== value) {
          restoreCaret = up.length === value.length;
          value = up;
        }
      }
      // "(" typed into empty dialogue starts a parenthetical.
      if (el.type === 'dialogue' && el.text === '' && value === '(') {
        commit(replaceAt(els, idx, { ...el, text: '(' }), { key: `type:${id}` });
        const r = withType({ ...el, text: '' }, 'parenthetical');
        commit(replaceAt(elementsRef.current, idx, r.el), { sel: { id, start: 1 } });
        resetAc();
        return;
      }
      const typed = { ...el, text: value };
      commit(replaceAt(els, idx, typed), { key: `type:${id}`, sel: restoreCaret ? { id, start: selStart, end: selEnd } : undefined });
      const conv = typingConversion(el, value);
      if (conv) {
        // A separate undo step, so one undo reverts the auto-format but keeps the typing.
        const r = withType(typed, conv);
        commit(replaceAt(elementsRef.current, idx, r.el), { sel: { id, start: selStart, end: selEnd } });
      }
      if (acRef.current.explicit || acRef.current.dismissedKey) resetAc();
    };

    const onKeyDown = (id: string, e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      const ta = e.currentTarget;
      const idx = indexOf(id);
      if (idx < 0) return;
      const els = elementsRef.current;
      const el = els[idx];
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;

      if (mod && !e.altKey && k.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && !e.altKey && k.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && !e.altKey && k.toLowerCase() === 'f') {
        e.preventDefault();
        optsRef.current.onFind();
        return;
      }
      if (mod && !e.altKey && k.toLowerCase() === 's') {
        e.preventDefault();
        optsRef.current.onSaveVersion();
        return;
      }
      if (e.altKey && !mod && /^Digit[1-8]$/.test(e.code)) {
        e.preventDefault();
        setTypeAt(idx, ELEMENT_TYPES[Number(e.code.slice(5)) - 1].value, ta.selectionStart);
        return;
      }

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const sugg = suggestionsRef.current;
      if (sugg.length) {
        if (k === 'ArrowDown') {
          e.preventDefault();
          setAc({ index: (Math.max(-1, acIndexRef.current) + 1) % sugg.length, explicit: true, dismissedKey: null });
          return;
        }
        if (k === 'ArrowUp') {
          e.preventDefault();
          setAc({ index: acIndexRef.current <= 0 ? sugg.length - 1 : acIndexRef.current - 1, explicit: true, dismissedKey: null });
          return;
        }
        if (k === 'Escape') {
          e.preventDefault();
          setAc({ index: -1, explicit: false, dismissedKey: `${id}:${el.text}` });
          return;
        }
        if (k === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          acceptSuggestion(idx, sugg[Math.max(0, acIndexRef.current)]);
          return;
        }
        if (k === 'Enter' && !e.shiftKey && acIndexRef.current >= 0) {
          e.preventDefault();
          const text = acceptSuggestion(idx, sugg[acIndexRef.current]);
          if (el.type === 'character') enter(idx, text.length, text.length);
          return;
        }
      }

      switch (k) {
        case 'Enter': {
          if (e.shiftKey && (el.type === 'action' || el.type === 'dialogue')) return; // line break inside the element
          e.preventDefault();
          enter(idx, start, end);
          return;
        }
        case 'Tab': {
          e.preventDefault();
          setTypeAt(idx, e.shiftKey ? TAB_PREV[el.type] : TAB_NEXT[el.type], start);
          return;
        }
        case 'Backspace': {
          if (mod || e.altKey) return;
          if (el.type === 'parenthetical' && el.text === '()' && start === 1 && end === 1) {
            e.preventDefault();
            const r = withType({ ...el, text: '' }, 'dialogue');
            commit(replaceAt(els, idx, r.el), { sel: { id, start: 0 } });
            return;
          }
          if (start !== 0 || end !== 0) return;
          if (idx === 0) {
            if (!el.text && els.length > 1) {
              e.preventDefault();
              commit(els.slice(1), { sel: { id: els[1].id, start: 0 } });
            }
            return;
          }
          e.preventDefault();
          const r = mergeWithPrevious(els, idx);
          if (r) commit(r.elements, { sel: r.sel });
          return;
        }
        case 'Delete': {
          if (mod || e.altKey || start !== end || end !== el.text.length) return;
          const r = mergeWithNext(els, idx);
          if (r) {
            e.preventDefault();
            commit(r.elements, { sel: r.sel });
          }
          return;
        }
        case 'ArrowUp':
        case 'ArrowLeft': {
          if (e.shiftKey || mod || e.altKey || start !== end || idx === 0) return;
          const crossing = k === 'ArrowLeft' ? start === 0 : caretOnFirstLine(ta);
          if (!crossing) return;
          e.preventDefault();
          const prev = els[idx - 1];
          focusElement(prev.id, prev.text.length);
          return;
        }
        case 'ArrowDown':
        case 'ArrowRight': {
          if (e.shiftKey || mod || e.altKey || start !== end || idx === els.length - 1) return;
          const crossing = k === 'ArrowRight' ? end === el.text.length : caretOnLastLine(ta);
          if (!crossing) return;
          e.preventDefault();
          focusElement(els[idx + 1].id, 0);
          return;
        }
        case ')': {
          if (el.type === 'parenthetical' && start === end && el.text[start] === ')') {
            e.preventDefault();
            ta.setSelectionRange(start + 1, start + 1);
          }
          return;
        }
        case 'Escape': {
          ta.blur();
          return;
        }
      }
    };

    const onPaste = (id: string, e: ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData('text/plain');
      const parsed = parsePaste(text);
      if (!parsed) return;
      e.preventDefault();
      const idx = indexOf(id);
      if (idx < 0) return;
      const ta = e.currentTarget;
      const r = insertElements(elementsRef.current, idx, ta.selectionStart, ta.selectionEnd, parsed);
      commit(r.elements, { sel: r.sel });
      toast.info(`Pasted ${parsed.length} formatted elements`, 'Undo (⌘Z) reverts the whole paste.');
    };

    const onFocus = (id: string, e: SyntheticEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      selRef.current = { id, start: ta.selectionStart, end: ta.selectionEnd };
      setFocusedId(id);
      setHasFocus(true);
    };

    const onBlur = () => setHasFocus(false);

    const onSelect = (id: string, e: SyntheticEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      selRef.current = { id, start: ta.selectionStart, end: ta.selectionEnd };
    };

    const registerRef = (id: string, node: HTMLTextAreaElement | null) => {
      if (node) rowRefs.current.set(id, node);
      else rowRefs.current.delete(id);
    };

    /** Replace the whole document (import, restore, find & replace all, external change). */
    const replaceAll = (next: ScriptElement[], o: { sel?: Sel; markDirty?: boolean } = {}) => {
      commit(next.length ? next : emptyElements(), o);
    };

    const setFocusedType = (type: ElementType) => {
      const id = selRef.current?.id;
      if (!id) return;
      const idx = indexOf(id);
      if (idx >= 0) setTypeAt(idx, type, selRef.current?.start);
    };

    const flush = () => runSave();

    const retry = () => {
      dirty.current = true;
      void runSave();
    };

    /** Called when the stored draft changes. Decides whether it was us, and if not, what to do. */
    const onStoredChange = (stored: Script) => {
      const s = signature(stored.elements);
      if (s === baseline.current || sent.current.includes(s) || s === signature(elementsRef.current)) {
        baseline.current = s;
        return;
      }
      if (!dirty.current && !saving.current && !conflictRef.current) {
        commit(stored.elements.length ? stored.elements : emptyElements(), { markDirty: false });
        baseline.current = s;
        toast.info('Draft updated', 'Changes made elsewhere were loaded into the editor.');
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setConflict({ theirs: stored.elements, at: stored.updatedAt });
    };

    const resolveConflict = async (choice: 'mine' | 'theirs') => {
      const c = conflictRef.current;
      if (!c) return;
      if (choice === 'mine') {
        // The stored draft holds their version: keep it as a version, then save ours over it.
        await saveVersion(scriptId, 'Other version (replaced by my edits)');
        setConflict(null);
        baseline.current = signature(c.theirs);
        dirty.current = true;
        await runSave();
        toast('Kept your version', { detail: 'The other version is saved in version history.' });
      } else {
        const script = optsRef.current.script;
        await saveElementsAsVersion(script, elementsRef.current, 'My unsaved edits (before loading the other version)');
        setConflict(null);
        dirty.current = false;
        commit(c.theirs.length ? c.theirs : emptyElements(), { markDirty: false });
        baseline.current = signature(c.theirs);
        setSaveState('saved');
        toast('Loaded the other version', { detail: 'Your edits are saved in version history.' });
      }
    };

    /** Register content we are about to write from this tab, so it isn't mistaken for an outside edit. */
    const expect = (els: ScriptElement[]) => {
      sent.current = [...sent.current.slice(-9), signature(els)];
    };

    return {
      expect,
      getTextarea: (id: string) => rowRefs.current.get(id),
      commit,
      undo,
      redo,
      focusElement,
      setTypeAt,
      setFocusedType,
      acceptSuggestion,
      replaceAll,
      flush,
      retry,
      onStoredChange,
      resolveConflict,
      isDirty: () => dirty.current || !!saving.current || saveStateRef.current === 'error',
      handlers: { onChange, onKeyDown, onPaste, onFocus, onBlur, onSelect, registerRef },
    };
  }, [scriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect changes made in other tabs or by other parts of the app.
  useEffect(() => {
    api.onStoredChange(opts.script);
  }, [opts.script.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Never lose typing: flush on hide, unmount, and warn before leaving with unsaved work.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void api.flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (api.isDirty()) {
        void api.flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      void api.flush();
    };
  }, [api]);

  const focusedEl = focusedId ? elements.find((e) => e.id === focusedId) : undefined;
  const deferred = useDeferredValue(elements);
  const allNames = useMemo(() => [...new Set([...opts.knownNames, ...scriptCueNames(deferred)])].sort(), [opts.knownNames, deferred]);
  const allLocations = useMemo(() => headingLocations(deferred, opts.locations), [opts.locations, deferred]);
  const suggestions = useMemo(() => {
    if (!focusedEl || !hasFocus) return NO_SUGGESTIONS;
    if (ac.dismissedKey === `${focusedEl.id}:${focusedEl.text}`) return NO_SUGGESTIONS;
    const list =
      focusedEl.type === 'character'
        ? characterSuggestions(focusedEl.text, allNames)
        : focusedEl.type === 'scene'
          ? sceneSuggestions(focusedEl.text, allLocations)
          : NO_SUGGESTIONS;
    return list.length ? list : NO_SUGGESTIONS;
  }, [focusedEl, hasFocus, ac.dismissedKey, allNames, allLocations]);
  const acIndex = !suggestions.length
    ? -1
    : ac.explicit
      ? Math.min(ac.index, suggestions.length - 1)
      : focusedEl?.type === 'character' && focusedEl.text.trim().length >= 2
        ? 0
        : -1;
  suggestionsRef.current = suggestions;
  acIndexRef.current = acIndex;

  return {
    ...api,
    elements,
    focusedId,
    focusedEl,
    hasFocus,
    suggestions,
    acIndex,
    saveState,
    saveError,
    lastSavedAt,
    conflict,
    canUndo: historyTick >= 0 && past.current.length > 0,
    canRedo: historyTick >= 0 && future.current.length > 0,
  };
}

export type ScriptEditorApi = ReturnType<typeof useScriptEditor>;
