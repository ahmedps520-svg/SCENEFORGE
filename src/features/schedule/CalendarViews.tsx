import { useDraggable, useDroppable } from '@dnd-kit/core';
import { AlertTriangle, MapPin, Plus } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Badge, cn } from '@/components/ui';
import { eventTypeMeta } from '@/lib/constants';
import type { Conflict } from '@/lib/conflicts';
import { formatDate, formatTime, minutesToTime, timeToMinutes, todayStr } from '@/lib/dates';
import type { Location, ScheduleEvent } from '@/lib/types';
import { dayNumber, monthGrid, sameMonth, WEEKDAY_LABELS, weekdayShort } from './calendar';
import { endTime, errorsOf, eventTitle } from './eventUtils';

export interface CalendarProps {
  events: ScheduleEvent[];
  conflicts: Map<string, Conflict[]>;
  dayIndex: Map<string, number>;
  locations: Map<string, Location>;
  onOpen: (id: string) => void;
  onCreate: (date: string, startTime?: string) => void;
  draggingId: string | null;
}

// ─── Chips ──────────────────────────────────────────────────────────────────

export function EventChipBody({ e, dayIndex, conflicted, compact }: { e: ScheduleEvent; dayIndex: Map<string, number>; conflicted: boolean; compact?: boolean }) {
  const meta = eventTypeMeta(e.type);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="h-3 w-[3px] shrink-0 rounded-full" style={{ background: meta.color }} />
      {!compact && <span className="shrink-0 font-mono text-[10px] text-faint">{e.startTime}</span>}
      <span className="min-w-0 truncate">{eventTitle(e, dayIndex)}</span>
      {conflicted && <AlertTriangle className="size-3 shrink-0 text-danger" aria-label="Has conflicts" />}
    </span>
  );
}

function DraggableChip({ e, children, className, onOpen, style, dragging }: { e: ScheduleEvent; children: ReactNode; className?: string; onOpen: (id: string) => void; style?: React.CSSProperties; dragging: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: e.id, data: { event: e } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(ev: MouseEvent) => {
        ev.stopPropagation();
        onOpen(e.id);
      }}
      style={style}
      className={cn('touch-manipulation text-left', dragging && 'opacity-35', className)}
    >
      {children}
    </button>
  );
}

// ─── Month ──────────────────────────────────────────────────────────────────

function MonthCell({ date, anchor, events, props, onShowDay }: { date: string; anchor: string; events: ScheduleEvent[]; props: CalendarProps; onShowDay: (d: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const today = todayStr();
  const inMonth = sameMonth(date, anchor);
  const visible = events.slice(0, 3);
  return (
    <div
      ref={setNodeRef}
      onClick={() => props.onCreate(date)}
      className={cn(
        'group relative min-h-[64px] cursor-pointer border-b border-r border-line p-1 transition-colors sm:min-h-[112px] sm:p-1.5',
        !inMonth && 'bg-panel/60',
        isOver && 'bg-accent-soft',
        !isOver && 'hover:bg-hover/40',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full font-mono text-[11px]',
            date === today ? 'bg-accent text-accent-ink' : inMonth ? 'text-muted' : 'text-faint/60',
          )}
        >
          {dayNumber(date)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onCreate(date);
          }}
          className="hidden size-5 items-center justify-center rounded-xs text-faint opacity-0 hover:bg-hover hover:text-ink focus:opacity-100 group-hover:opacity-100 sm:flex"
          aria-label={`Add event on ${formatDate(date)}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {/* Phones: coloured dots */}
      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
        {events.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              props.onOpen(e.id);
            }}
            aria-label={eventTitle(e, props.dayIndex)}
            className={cn('size-2.5 rounded-full', errorsOf(props.conflicts.get(e.id)).length > 0 && 'ring-2 ring-danger/60')}
            style={{ background: eventTypeMeta(e.type).color }}
          />
        ))}
      </div>
      <div className="mt-1 hidden space-y-1 sm:block">
        {visible.map((e) => (
          <DraggableChip
            key={e.id}
            e={e}
            onOpen={props.onOpen}
            dragging={props.draggingId === e.id}
            className="flex h-[22px] w-full items-center rounded-xs border border-line bg-raised px-1.5 text-[11.5px] text-ink hover:border-line-strong"
          >
            <EventChipBody e={e} dayIndex={props.dayIndex} conflicted={errorsOf(props.conflicts.get(e.id)).length > 0} />
          </DraggableChip>
        ))}
        {events.length > 3 && (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onShowDay(date);
            }}
            className="px-1.5 text-[11px] text-muted hover:text-ink"
          >
            +{events.length - 3} more
          </button>
        )}
      </div>
    </div>
  );
}

export function MonthView({ anchor, props, onShowDay }: { anchor: string; props: CalendarProps; onShowDay: (d: string) => void }) {
  const weeks = monthGrid(anchor);
  const byDate = groupByDate(props.events);
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-panel">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="border-r border-line px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-faint last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
        {weeks.flat().map((d) => (
          <MonthCell key={d} date={d} anchor={anchor} events={byDate.get(d) ?? []} props={props} onShowDay={onShowDay} />
        ))}
      </div>
    </div>
  );
}

// ─── Week / Day time grid ───────────────────────────────────────────────────

export const PX_PER_MIN = 0.8;

function layoutLanes(events: ScheduleEvent[]) {
  const sorted = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const e of sorted) {
    const start = timeToMinutes(e.startTime);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = start + Math.max(e.durationMin, 15);
    lanes.set(e.id, lane);
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}

function TimeColumn({ date, events, props, startHour, endHour }: { date: string; events: ScheduleEvent[]; props: CalendarProps; startHour: number; endHour: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${date}` });
  const { lanes, count } = layoutLanes(events);
  const height = (endHour - startHour) * 60 * PX_PER_MIN;
  return (
    <div
      ref={setNodeRef}
      onClick={(ev) => {
        const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
        const min = startHour * 60 + (ev.clientY - rect.top) / PX_PER_MIN;
        props.onCreate(date, minutesToTime(Math.floor(min / 30) * 30));
      }}
      className={cn('relative cursor-pointer border-r border-line last:border-r-0', isOver && 'bg-accent-soft/60', date === todayStr() && 'bg-accent-soft/25')}
      style={{ height }}
    >
      {Array.from({ length: endHour - startHour }, (_, i) => (
        <div key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * 60 * PX_PER_MIN }} />
      ))}
      {events.map((e) => {
        const top = Math.max(0, (timeToMinutes(e.startTime) - startHour * 60) * PX_PER_MIN);
        const h = Math.max(22, Math.min(height - top, e.durationMin * PX_PER_MIN));
        const lane = lanes.get(e.id) ?? 0;
        const meta = eventTypeMeta(e.type);
        const conflicted = errorsOf(props.conflicts.get(e.id)).length > 0;
        const loc = e.locationId ? props.locations.get(e.locationId) : undefined;
        return (
          <DraggableChip
            key={e.id}
            e={e}
            onOpen={props.onOpen}
            dragging={props.draggingId === e.id}
            style={{ top, height: h, left: `calc(${(lane / count) * 100}% + 2px)`, width: `calc(${100 / count}% - 4px)`, borderLeftColor: meta.color }}
            className={cn('absolute flex flex-col items-stretch justify-start overflow-hidden rounded-xs border border-l-[3px] border-line bg-raised px-1.5 py-1 text-[11.5px] shadow-soft hover:border-line-strong', conflicted && 'ring-1 ring-danger/60')}
          >
            <span className="flex items-center gap-1 truncate font-medium text-ink">
              {conflicted && <AlertTriangle className="size-3 shrink-0 text-danger" />}
              <span className="truncate">{eventTitle(e, props.dayIndex)}</span>
            </span>
            {h > 34 && (
              <span className="block truncate font-mono text-[10px] text-faint">
                {e.startTime}–{endTime(e)}
              </span>
            )}
            {h > 52 && loc && (
              <span className="flex items-center gap-1 truncate text-[10.5px] text-muted">
                <MapPin className="size-2.5 shrink-0" />
                {loc.name}
              </span>
            )}
          </DraggableChip>
        );
      })}
    </div>
  );
}

export function TimeGridView({ days, props, onShowDay }: { days: string[]; props: CalendarProps; onShowDay?: (d: string) => void }) {
  const byDate = groupByDate(props.events);
  const inRange = props.events.filter((e) => days.includes(e.date));
  const earliest = Math.min(7, ...inRange.map((e) => Math.floor(timeToMinutes(e.startTime) / 60)));
  const latest = Math.max(22, ...inRange.map((e) => Math.ceil((timeToMinutes(e.startTime) + e.durationMin) / 60)));
  const startHour = Math.max(0, earliest);
  const endHour = Math.min(24, latest);
  const today = todayStr();

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="grid border-b border-line bg-panel" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="border-r border-line" />
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onShowDay?.(d)}
            disabled={!onShowDay}
            className="border-r border-line px-2 py-1.5 text-left last:border-r-0 enabled:hover:bg-hover"
          >
            <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{weekdayShort(d)}</span>
            <span className={cn('ml-1.5 font-mono text-[12px]', d === today ? 'text-accent' : 'text-ink')}>{dayNumber(d)}</span>
          </button>
        ))}
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="relative border-r border-line" style={{ height: (endHour - startHour) * 60 * PX_PER_MIN }}>
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <span key={i} className="absolute right-1.5 -translate-y-1/2 font-mono text-[9.5px] text-faint" style={{ top: i * 60 * PX_PER_MIN }}>
                {i === 0 ? '' : formatTime(`${String(startHour + i).padStart(2, '0')}:00`).replace(':00', '')}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <TimeColumn key={d} date={d} events={byDate.get(d) ?? []} props={props} startHour={startHour} endHour={endHour} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Agenda ─────────────────────────────────────────────────────────────────

export function AgendaView({ props, showPast, sceneLabel }: { props: CalendarProps; showPast: boolean; sceneLabel: (ids: string[]) => string }) {
  const today = todayStr();
  const list = props.events.filter((e) => showPast || e.date >= today);
  const byDate = groupByDate(list);
  const dates = [...byDate.keys()].sort();
  if (!dates.length) {
    return (
      <div className="rounded-md border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="display text-2xl text-ink">Nothing scheduled{showPast ? '' : ' ahead'}</p>
        <p className="mt-1 text-[13px] text-muted">Add filming days, rehearsals, scouting trips and deadlines to see them here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {dates.map((d) => (
        <div key={d} className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div className="pt-2">
            <div className={cn('font-mono text-[11px] uppercase tracking-wider', d === today ? 'text-accent' : 'text-faint')}>{d === today ? 'Today' : weekdayShort(d)}</div>
            <div className={cn('display text-[22px]', d < today ? 'text-muted' : 'text-ink')}>{formatDate(d, 'd MMM yyyy')}</div>
          </div>
          <div className="space-y-2">
            {byDate.get(d)!.map((e) => {
              const meta = eventTypeMeta(e.type);
              const conflicts = errorsOf(props.conflicts.get(e.id));
              const loc = e.locationId ? props.locations.get(e.locationId) : undefined;
              return (
                <button key={e.id} type="button" onClick={() => props.onOpen(e.id)} className="panel flex w-full flex-col gap-1.5 border-l-[3px] px-3.5 py-2.5 text-left transition-colors hover:border-line-strong" style={{ borderLeftColor: meta.color }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11.5px] text-muted">
                      {formatTime(e.startTime)}–{formatTime(endTime(e))}
                    </span>
                    <span className="text-[13.5px] font-medium text-ink">{eventTitle(e, props.dayIndex)}</span>
                    <Badge>{meta.label}</Badge>
                    {conflicts.length > 0 && (
                      <Badge tone="danger">
                        <AlertTriangle className="size-3" /> {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted">
                    {loc && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {loc.name}
                      </span>
                    )}
                    {e.sceneIds.length > 0 && <span>{sceneLabel(e.sceneIds)}</span>}
                    {e.type === 'filming' && <span>Crew call {formatTime(e.callTime)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function groupByDate(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const m = new Map<string, ScheduleEvent[]>();
  for (const e of [...events].sort((a, b) => a.startTime.localeCompare(b.startTime))) m.set(e.date, [...(m.get(e.date) ?? []), e]);
  return m;
}
