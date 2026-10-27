import { CaseSensitive, ChevronDown, ChevronUp, Replace, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, cn, IconButton, toast } from '@/components/ui';
import type { Highlight } from './Editor';
import { findMatches, isUpperType, replaceAllMatches, replaceAt } from './ops';
import type { ScriptEditorApi } from './useScriptEditor';

export function FindBar({ editor, onClose, onHighlights }: { editor: ScriptEditorApi; onClose: () => void; onHighlights: (h: Map<string, Highlight[]> | null) => void }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [current, setCurrent] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => findMatches(editor.elements, query, caseSensitive), [editor.elements, query, caseSensitive]);
  const idx = matches.length ? Math.min(current, matches.length - 1) : -1;

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => {
    if (!matches.length) {
      onHighlights(null);
      return;
    }
    const map = new Map<string, Highlight[]>();
    matches.forEach((m, i) => {
      const list = map.get(m.id) ?? [];
      list.push({ start: m.start, end: m.end, current: i === idx });
      map.set(m.id, list);
    });
    onHighlights(map);
  }, [matches, idx, onHighlights]);

  useEffect(() => () => onHighlights(null), [onHighlights]);

  const reveal = (i: number) => {
    const m = matches[i];
    if (!m) return;
    document.querySelector(`[data-el="${m.id}"]`)?.scrollIntoView({ block: 'center' });
  };

  const go = (dir: 1 | -1) => {
    if (!matches.length) return;
    const next = (idx + dir + matches.length) % matches.length;
    setCurrent(next);
    reveal(next);
  };

  const replaceOne = () => {
    const m = matches[idx];
    if (!m) return;
    const els = editor.elements;
    const i = els.findIndex((e) => e.id === m.id);
    if (i < 0) return;
    const el = els[i];
    let text = el.text.slice(0, m.start) + replacement + el.text.slice(m.end);
    if (isUpperType(el.type)) text = text.toUpperCase();
    editor.commit(replaceAt(els, i, { ...el, text }));
    setTimeout(() => reveal(idx), 0);
  };

  const replaceEvery = () => {
    const r = replaceAllMatches(editor.elements, query, replacement, caseSensitive);
    if (!r.count) return;
    editor.replaceAll(r.elements);
    toast(`Replaced ${r.count} ${r.count === 1 ? 'match' : 'matches'}`, { detail: 'Undo (⌘Z) reverts them all.' });
  };

  const close = () => {
    const m = matches[idx];
    onClose();
    if (m) setTimeout(() => editor.focusElement(m.id, m.start, m.end, 'center'), 0);
  };

  return (
    <div
      className="absolute right-3 top-3 z-30 w-[min(420px,calc(100%-24px))] rounded-md border border-line-strong bg-raised p-2 shadow-pop animate-pop"
      role="search"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <IconButton label={showReplace ? 'Hide replace' : 'Show replace'} size="sm" onClick={() => setShowReplace((v) => !v)} active={showReplace}>
          <Replace className="size-3.5" />
        </IconButton>
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrent(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go(e.shiftKey ? -1 : 1);
            }
          }}
          placeholder="Find in script"
          aria-label="Find in script"
          className="input h-8 flex-1 text-[13px]"
        />
        <span className={cn('w-16 shrink-0 text-center font-mono text-[11px]', query && !matches.length ? 'text-danger' : 'text-faint')}>
          {query ? (matches.length ? `${idx + 1}/${matches.length}` : 'None') : ''}
        </span>
        <IconButton label="Match case" size="sm" active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)}>
          <CaseSensitive className="size-4" />
        </IconButton>
        <IconButton label="Previous match (⇧Enter)" size="sm" onClick={() => go(-1)} disabled={!matches.length}>
          <ChevronUp className="size-4" />
        </IconButton>
        <IconButton label="Next match (Enter)" size="sm" onClick={() => go(1)} disabled={!matches.length}>
          <ChevronDown className="size-4" />
        </IconButton>
        <IconButton label="Close (Esc)" size="sm" onClick={close}>
          <X className="size-4" />
        </IconButton>
      </div>
      {showReplace && (
        <div className="mt-1.5 flex items-center gap-1.5 pl-[34px]">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                replaceOne();
              }
            }}
            placeholder="Replace with"
            aria-label="Replace with"
            className="input h-8 flex-1 text-[13px]"
          />
          <Button size="sm" onClick={replaceOne} disabled={idx < 0}>
            Replace
          </Button>
          <Button size="sm" onClick={replaceEvery} disabled={!matches.length}>
            All
          </Button>
        </div>
      )}
    </div>
  );
}
