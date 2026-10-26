import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';
import { Popover } from './Popover';

export interface PickOption {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

/**
 * Choose several items from a searchable list; selections show as removable chips.
 * Used for characters in a scene, scenes for a prop, people on an event, etc.
 */
export function MultiPicker({
  value,
  onChange,
  options,
  placeholder = 'Add…',
  emptyText = 'Nothing to choose from yet',
  onCreate,
  createLabel,
  className,
  max,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: PickOption[];
  placeholder?: string;
  emptyText?: string;
  /** Offer to create a new option from the search text. */
  onCreate?: (text: string) => Promise<string | void> | string | void;
  createLabel?: (text: string) => string;
  className?: string;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = value.map((v) => options.find((o) => o.value === v)).filter((o): o is PickOption => !!o);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !s || o.label.toLowerCase().includes(s) || o.hint?.toLowerCase().includes(s));
  }, [q, options]);
  const exact = options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!max || value.length < max) onChange([...value, v]);
  };
  const create = async () => {
    if (!onCreate || !q.trim()) return;
    const id = await onCreate(q.trim());
    if (id) onChange([...value, id]);
    setQ('');
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {selected.map((o) => (
        <span key={o.value} className="chip pr-1">
          {o.icon}
          <span className="max-w-[180px] truncate">{o.label}</span>
          <button type="button" aria-label={`Remove ${o.label}`} onClick={() => toggle(o.value)} className="rounded-xs p-0.5 text-faint hover:text-ink hover:bg-hover">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ('');
        }}
        className="w-[280px] p-0"
        trigger={
          <button type="button" className="inline-flex h-6 items-center gap-1 rounded-xs border border-dashed border-line-strong px-2 text-[12px] text-muted hover:text-ink hover:border-[color-mix(in_srgb,var(--c-ink)_30%,transparent)]">
            <Plus className="size-3" />
            {placeholder}
          </button>
        }
      >
        <div className="flex items-center gap-2 border-b border-line px-2.5">
          <Search className="size-3.5 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length === 1) toggle(filtered[0].value);
                else if (onCreate && q.trim() && !exact) void create();
              }
            }}
            placeholder="Search…"
            className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && !onCreate && <p className="px-2 py-3 text-[12.5px] text-faint">{options.length ? 'No matches' : emptyText}</p>}
          {filtered.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-hover"
              >
                <span className={cn('flex size-4 items-center justify-center rounded-xs border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}>
                  {on && <Check className="size-3" />}
                </span>
                {o.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-[11.5px] text-faint">{o.hint}</span>}
                </span>
              </button>
            );
          })}
          {onCreate && q.trim() && !exact && (
            <button type="button" onClick={() => void create()} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-accent hover:bg-hover">
              <Plus className="size-3.5" />
              {createLabel ? createLabel(q.trim()) : `Create “${q.trim()}”`}
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
}

/** Single choice from a searchable list, with an optional "none". */
export function SinglePicker({
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  noneLabel = 'None',
  allowNone = true,
  className,
  onCreate,
  createLabel,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: PickOption[];
  placeholder?: string;
  noneLabel?: string;
  allowNone?: boolean;
  className?: string;
  onCreate?: (text: string) => Promise<string | void> | string | void;
  createLabel?: (text: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const filtered = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ('');
      }}
      className="w-[min(300px,calc(100vw-24px))] p-0"
      trigger={
        <button type="button" className={cn('input flex items-center justify-between gap-2 text-left', className)}>
          <span className={cn('flex min-w-0 items-center gap-2 truncate', !current && 'text-faint')}>
            {current?.icon}
            <span className="truncate">{current?.label ?? placeholder}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-faint" />
        </button>
      }
    >
      {options.length > 6 && (
        <div className="flex items-center gap-2 border-b border-line px-2.5">
          <Search className="size-3.5 text-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-faint" />
        </div>
      )}
      <div className="max-h-64 overflow-y-auto p-1">
        {allowNone && (
          <button type="button" onClick={() => pick(undefined)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-muted hover:bg-hover">
            {noneLabel}
          </button>
        )}
        {filtered.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-hover', o.value === value && 'text-accent')}
          >
            {o.icon}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{o.label}</span>
              {o.hint && <span className="block truncate text-[11.5px] text-faint">{o.hint}</span>}
            </span>
            {o.value === value && <Check className="size-3.5" />}
          </button>
        ))}
        {!filtered.length && !onCreate && <p className="px-2 py-3 text-[12.5px] text-faint">Nothing here yet</p>}
        {onCreate && q.trim() && (
          <button
            type="button"
            onClick={async () => {
              const id = await onCreate(q.trim());
              if (id) pick(id);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-accent hover:bg-hover"
          >
            <Plus className="size-3.5" />
            {createLabel ? createLabel(q.trim()) : `Create “${q.trim()}”`}
          </button>
        )}
      </div>
    </Popover>
  );
}

/** Free-form tags. Enter or comma adds; Backspace on empty removes the last. */
export function TagInput({ value, onChange, placeholder = 'Add tag', suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, '');
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText('');
  };
  const listId = useMemo(() => `tags-${Math.random().toString(36).slice(2)}`, []);
  return (
    <div className="input flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5">
      {value.map((t) => (
        <span key={t} className="chip pr-1">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-faint hover:text-ink">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        list={suggestions.length ? listId : undefined}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[80px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
