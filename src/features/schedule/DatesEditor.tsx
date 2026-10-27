import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { Button, cn, IconButton, Input } from '@/components/ui';
import { formatDate, isDateStr, todayStr } from '@/lib/dates';
import type { DateStr } from '@/lib/types';
import { dayNumber, monthGrid, monthLabel, sameMonth, shiftMonth, WEEKDAY_LABELS } from './calendar';

/**
 * Pick dates something is unavailable: tap days on a small month calendar,
 * or type a date. Upcoming dates are listed as removable chips.
 */
export function UnavailableDatesEditor({
  value,
  onChange,
  highlight = [],
  highlightLabel = 'Scheduled',
}: {
  value: DateStr[];
  onChange: (dates: DateStr[]) => void;
  /** Dates to mark (e.g. filming days) so conflicts are visible while editing. */
  highlight?: DateStr[];
  highlightLabel?: string;
}) {
  const today = todayStr();
  const [anchor, setAnchor] = useState(() => value.find((d) => d >= today) ?? today);
  const [typed, setTyped] = useState('');
  const set = new Set(value);
  const marks = new Set(highlight);

  const toggle = (d: DateStr) => {
    onChange(set.has(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  };
  const addTyped = () => {
    if (!isDateStr(typed)) return;
    if (!set.has(typed)) onChange([...value, typed].sort());
    setAnchor(typed);
    setTyped('');
  };

  const upcoming = value.filter((d) => d >= today).sort();
  const past = value.filter((d) => d < today).length;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <IconButton label="Previous month" size="sm" onClick={() => setAnchor(shiftMonth(anchor, -1))}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <span className="text-[12.5px] font-medium text-ink">{monthLabel(anchor)}</span>
          <IconButton label="Next month" size="sm" onClick={() => setAnchor(shiftMonth(anchor, 1))}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="pb-1 font-mono text-[9.5px] uppercase tracking-wider text-faint">
              {d.slice(0, 2)}
            </div>
          ))}
          {monthGrid(anchor).flat().map((d) => {
            const off = set.has(d);
            const inMonth = sameMonth(d, anchor);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggle(d)}
                aria-pressed={off}
                aria-label={`${formatDate(d)}${off ? ', unavailable' : ''}${marks.has(d) ? `, ${highlightLabel.toLowerCase()}` : ''}`}
                className={cn(
                  'relative flex h-8 items-center justify-center rounded-xs text-[12px] transition-colors',
                  !inMonth && 'text-faint/60',
                  inMonth && !off && 'text-ink hover:bg-hover',
                  off && 'bg-danger-soft text-danger line-through decoration-danger/60',
                  d === today && !off && 'ring-1 ring-inset ring-accent/60',
                )}
              >
                {dayNumber(d)}
                {marks.has(d) && <span className="absolute bottom-1 size-1 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-danger-soft ring-1 ring-danger/40" /> Unavailable
          </span>
          {highlight.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-accent" /> {highlightLabel}
            </span>
          )}
          <span>Tap a day to toggle</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Input type="date" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Add an unavailable date" className="flex-1" />
        <Button variant="secondary" onClick={addTyped} disabled={!isDateStr(typed)}>
          Add date
        </Button>
      </div>

      {upcoming.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {upcoming.map((d) => (
            <span key={d} className="chip pr-1">
              {formatDate(d, 'EEE d MMM')}
              <button type="button" onClick={() => toggle(d)} aria-label={`Remove ${formatDate(d)}`} className="rounded-xs p-0.5 text-faint hover:bg-hover hover:text-ink">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-faint">No upcoming unavailable dates.</p>
      )}
      {past > 0 && (
        <button type="button" className="text-[11.5px] text-faint hover:text-ink" onClick={() => onChange(value.filter((d) => d >= today))}>
          Clear {past} past date{past === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
