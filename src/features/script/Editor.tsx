import { memo, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { elementLabel } from '@/lib/constants';
import type { ScriptElement } from '@/lib/types';
import { cn } from '@/components/ui';
import { PLACEHOLDER } from './ops';
import type { ScriptEditorApi } from './useScriptEditor';

export interface Highlight {
  start: number;
  end: number;
  current: boolean;
}

type Handlers = ScriptEditorApi['handlers'];

const ElementRow = memo(function ElementRow({
  el,
  number,
  breakPage,
  showNumbers,
  highlights,
  handlers,
}: {
  el: ScriptElement;
  number?: string;
  breakPage?: number;
  showNumbers: boolean;
  highlights?: Highlight[];
  handlers: Handlers;
}) {
  return (
    <>
      {breakPage !== undefined && (
        <div className="sf-break" aria-hidden>
          <span>PAGE {breakPage}</span>
        </div>
      )}
      <div className={cn('sf-row', `sf-${el.type}`)} data-label={elementLabel(el.type)} data-el={el.id}>
        {el.type === 'scene' && showNumbers && number && (
          <>
            <span className="sf-num sf-num-l" aria-hidden>
              {number}
            </span>
            <span className="sf-num sf-num-r" aria-hidden>
              {number}
            </span>
          </>
        )}
        <div className="grow-wrap sf-block" data-value={el.text}>
          {highlights && highlights.length > 0 && <HighlightLayer text={el.text} highlights={highlights} />}
          <textarea
            ref={(n) => handlers.registerRef(el.id, n)}
            rows={1}
            value={el.text}
            spellCheck={el.type === 'action' || el.type === 'dialogue'}
            autoCapitalize={el.type === 'action' || el.type === 'dialogue' ? 'sentences' : 'characters'}
            autoComplete="off"
            aria-label={`${elementLabel(el.type)}${number ? ` ${number}` : ''}`}
            placeholder={PLACEHOLDER[el.type]}
            onChange={(e) => handlers.onChange(el.id, e)}
            onKeyDown={(e) => handlers.onKeyDown(el.id, e)}
            onPaste={(e) => handlers.onPaste(el.id, e)}
            onFocus={(e) => handlers.onFocus(el.id, e)}
            onBlur={handlers.onBlur}
            onSelect={(e) => handlers.onSelect(el.id, e)}
          />
        </div>
      </div>
    </>
  );
});

function HighlightLayer({ text, highlights }: { text: string; highlights: Highlight[] }) {
  const parts: React.ReactNode[] = [];
  let pos = 0;
  highlights.forEach((h, i) => {
    if (h.start > pos) parts.push(text.slice(pos, h.start));
    parts.push(
      <mark key={i} className={h.current ? 'cur' : undefined}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    pos = h.end;
  });
  parts.push(text.slice(pos) + ' ');
  return (
    <div className="sf-hl" aria-hidden>
      {parts}
    </div>
  );
}

export function Editor({
  editor,
  paper,
  showSceneNumbers,
  numbers,
  breaks,
  highlights,
  scrollRef,
}: {
  editor: ScriptEditorApi;
  paper: 'dark' | 'light';
  showSceneNumbers: boolean;
  numbers: Map<string, string>;
  breaks: Map<string, number>;
  highlights: Map<string, Highlight[]> | null;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const [acPos, setAcPos] = useState<{ top: number; left: number } | null>(null);
  const { elements, suggestions, acIndex, focusedEl } = editor;
  const isEmpty = elements.length === 1 && !elements[0].text;

  useLayoutEffect(() => {
    if (!suggestions.length || !focusedEl || !colRef.current) {
      setAcPos(null);
      return;
    }
    const ta = editor.getTextarea(focusedEl.id);
    if (!ta) return;
    const col = colRef.current.getBoundingClientRect();
    const r = ta.getBoundingClientRect();
    setAcPos({ top: r.bottom - col.top + 4, left: Math.max(0, r.left - col.left) });
  }, [suggestions, focusedEl, elements, editor]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain" id="sf-scroll">
      <div className="sf-paper" data-paper={paper} data-empty={isEmpty ? '' : undefined}>
        <div className="sf-sheet">
          <div ref={colRef} className="sf-col">
            {elements.map((el) => (
              <ElementRow
                key={el.id}
                el={el}
                number={numbers.get(el.id)}
                breakPage={breaks.get(el.id)}
                showNumbers={showSceneNumbers}
                highlights={highlights?.get(el.id)}
                handlers={editor.handlers}
              />
            ))}
            {acPos && suggestions.length > 0 && focusedEl && (
              <div
                role="listbox"
                aria-label="Suggestions"
                className="absolute z-20 min-w-[220px] max-w-[min(360px,100%)] overflow-hidden rounded-md border border-line-strong bg-raised py-1 font-sans shadow-pop animate-pop"
                style={{ top: acPos.top, left: acPos.left }}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s.value}
                    role="option"
                    aria-selected={i === acIndex}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const idx = elements.findIndex((x) => x.id === focusedEl.id);
                      if (idx >= 0) editor.acceptSuggestion(idx, s);
                    }}
                    className={cn('flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-[13px] text-ink', i === acIndex ? 'bg-hover' : 'hover:bg-hover/60')}
                  >
                    <span className="truncate font-mono text-[12.5px]">{s.label}</span>
                    {s.hint && <span className="shrink-0 text-[11px] text-faint">{s.hint}</span>}
                  </button>
                ))}
                <div className="border-t border-line px-3 pt-1.5 pb-1 text-[10.5px] text-faint">Tab to accept · ↑↓ to choose · Esc to dismiss</div>
              </div>
            )}
          </div>
          {isEmpty && <EmptyLegend />}
        </div>
      </div>
    </div>
  );
}

const KEYS: [string, string][] = [
  ['Enter', 'Next element — action after a heading, dialogue after a character'],
  ['Tab', 'Switch action ↔ character, dialogue ↔ parenthetical'],
  ['Alt 1–8', 'Heading, action, character, parenthetical, dialogue, transition, shot, centered'],
  ['⌘/Ctrl Z', 'Undo (⇧ to redo)'],
  ['⌘/Ctrl F', 'Find & replace'],
  ['⌘/Ctrl S', 'Save a named version'],
  ['Esc', 'Leave the editor'],
];

function EmptyLegend() {
  return (
    <div className="mx-auto mt-14 max-w-[61ch] rounded-md border border-[var(--sf-line)] p-5 font-sans">
      <div className="eyebrow mb-1.5" style={{ color: 'var(--sf-muted)' }}>
        Fade in
      </div>
      <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--sf-muted)' }}>
        Start with a scene heading — type <span className="font-mono">INT.</span> or <span className="font-mono">EXT.</span> and SCENEFORGE formats as you write. Every
        heading becomes a scene in your breakdown automatically. You can also paste a script in Fountain format or import one from the toolbar.
      </p>
      <dl className="mt-4 grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-[auto_1fr]">
        {KEYS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-[11.5px]" style={{ color: 'var(--sf-ink)' }}>
              {k}
            </dt>
            <dd style={{ color: 'var(--sf-muted)' }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export const SHORTCUTS = KEYS;
