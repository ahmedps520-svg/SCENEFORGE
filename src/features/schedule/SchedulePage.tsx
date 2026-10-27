import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, MapPinned, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { Button, Checkbox, cn, EmptyState, IconButton, Loading, PageContainer, PageHeader, Segmented, Tip, toast, toastError } from '@/components/ui';
import { EVENT_TYPES } from '@/lib/constants';
import { buildScheduleContext, findConflicts } from '@/lib/conflicts';
import { updateRecord } from '@/lib/data/crud';
import { addDaysStr, formatDate, minutesToTime, timeToMinutes, todayStr } from '@/lib/dates';
import { useProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import type { EventType, ScheduleEvent } from '@/lib/types';
import { monthLabel, shiftMonth, weekDays } from './calendar';
import { AgendaView, EventChipBody, MonthView, PX_PER_MIN, TimeGridView, type CalendarProps } from './CalendarViews';
import { EventSheet } from './EventSheet';
import { errorsOf, filmingDayIndex } from './eventUtils';
import { NewEventDialog, type EventPrefill } from './NewEventDialog';
import { PlanByLocation } from './PlanByLocation';

type View = 'month' | 'week' | 'day' | 'agenda';

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

export default function SchedulePage() {
  const { project } = useWorkspace();
  const data = useProjectData(project.id);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => (isPhone() ? 'agenda' : 'month'));
  const [anchor, setAnchor] = useState(() => {
    const today = todayStr();
    return project.filmingStart && project.filmingStart > today ? project.filmingStart : today;
  });
  const [hidden, setHidden] = useState<Set<EventType>>(new Set());
  const [showPast, setShowPast] = useState(false);
  const [planOpen, setPlanOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches);
  const [prefill, setPrefill] = useState<EventPrefill | null>(null);
  const [dragging, setDragging] = useState<ScheduleEvent | null>(null);

  const eventId = params.get('event') ?? undefined;
  const setEventParam = (id: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('event', id);
        else next.delete('event');
        return next;
      },
      { replace: true },
    );

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));

  const ctx = useMemo(() => (data ? buildScheduleContext(data) : null), [data]);
  const conflicts = useMemo(() => (data && ctx ? findConflicts(data.events, ctx) : new Map()), [data, ctx]);
  const dayIndex = useMemo(() => filmingDayIndex(data?.events ?? []), [data?.events]);
  const numbers = useMemo(() => sceneNumbers(data?.scenes ?? []), [data?.scenes]);

  if (data === undefined) return <Loading label="Loading schedule" />;
  if (data === null) return null;

  const events = data.events.filter((e) => !hidden.has(e.type));
  const openEvent = data.events.find((e) => e.id === eventId);
  const conflictCount = [...conflicts.values()].filter((c) => errorsOf(c).length).length;
  const filmingDays = data.events.filter((e) => e.type === 'filming');
  const upcomingFilming = filmingDays.filter((e) => e.date >= todayStr()).length;

  const calendarProps: CalendarProps = {
    events,
    conflicts,
    dayIndex,
    locations: new Map(data.locations.map((l) => [l.id, l])),
    onOpen: (id) => setEventParam(id),
    onCreate: (date, startTime) => setPrefill({ date, startTime }),
    draggingId: dragging?.id ?? null,
  };

  const step = (n: number) => {
    if (view === 'month') setAnchor(shiftMonth(anchor, n));
    else setAnchor(addDaysStr(anchor, n * (view === 'week' ? 7 : 1)));
  };

  const rangeLabel = (() => {
    if (view === 'day') return formatDate(anchor, 'EEEE d MMMM yyyy');
    if (view === 'week') {
      const days = weekDays(anchor);
      return `${formatDate(days[0], 'd MMM')} – ${formatDate(days[6], 'd MMM yyyy')}`;
    }
    if (view === 'agenda') return showPast ? 'All events' : 'Upcoming';
    return monthLabel(anchor);
  })();

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current?.event as ScheduleEvent) ?? null);
  const onDragEnd = async ({ active, over, delta }: DragEndEvent) => {
    setDragging(null);
    const ev = active.data.current?.event as ScheduleEvent | undefined;
    if (!ev || !over) return;
    const [kind, date] = String(over.id).split(':');
    let startTime = ev.startTime;
    if (kind === 'col') {
      const shift = Math.round(delta.y / PX_PER_MIN / 15) * 15;
      startTime = minutesToTime(Math.max(0, Math.min(24 * 60 - 15, timeToMinutes(ev.startTime) + shift)));
    }
    if (date === ev.date && startTime === ev.startTime) return;
    const callShift = timeToMinutes(startTime) - timeToMinutes(ev.startTime);
    const callTime = minutesToTime(timeToMinutes(ev.callTime) + callShift);
    try {
      await updateRecord<ScheduleEvent>('events', ev.id, { date, startTime, callTime }, { summary: `Moved “${ev.title || ev.type}” to ${formatDate(date, 'EEE d MMM')} ${startTime}` });
      toast(`Moved to ${formatDate(date, 'EEE d MMM')}${startTime !== ev.startTime ? ` at ${startTime}` : ''}`, {
        action: {
          label: 'Undo',
          onClick: () => updateRecord<ScheduleEvent>('events', ev.id, { date: ev.date, startTime: ev.startTime, callTime: ev.callTime }, { summary: 'Undid move' }),
        },
      });
    } catch (err) {
      toastError(err, 'Event not moved');
    }
  };

  const toggleType = (t: EventType) => {
    const next = new Set(hidden);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setHidden(next);
  };

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Production schedule"
        title="Schedule"
        description={
          filmingDays.length
            ? `${filmingDays.length} filming day${filmingDays.length === 1 ? '' : 's'} planned · ${upcomingFilming} upcoming${conflictCount ? ` · ${conflictCount} with conflicts` : ''}`
            : 'Plan filming days, rehearsals, scouting, prep, meetings, editing and deadlines. Conflicts with cast and location availability show automatically.'
        }
        actions={
          <>
            <Button variant={planOpen ? 'secondary' : 'ghost'} icon={<MapPinned className="size-4" />} onClick={() => setPlanOpen((o) => !o)} aria-pressed={planOpen}>
              Plan by location
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPrefill({ date: anchor >= todayStr() ? anchor : todayStr() })}>
              New event
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1">
          {view !== 'agenda' && (
            <>
              <IconButton label="Previous" onClick={() => step(-1)}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <IconButton label="Next" onClick={() => step(1)}>
                <ChevronRight className="size-4" />
              </IconButton>
              <Button size="sm" variant="ghost" onClick={() => setAnchor(todayStr())}>
                Today
              </Button>
            </>
          )}
          <h2 className={cn('display text-[24px] text-ink', view !== 'agenda' && 'ml-2')}>{rangeLabel}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {view === 'agenda' && <Checkbox checked={showPast} onChange={setShowPast} label="Show past" />}
          <Segmented<View>
            label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
              { value: 'agenda', label: 'Agenda' },
            ]}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show event types">
        {EVENT_TYPES.map((t) => {
          const off = hidden.has(t.value);
          const n = data.events.filter((e) => e.type === t.value).length;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => toggleType(t.value)}
              aria-pressed={!off}
              className={cn('chip h-6 cursor-pointer gap-1.5 text-[11.5px] transition-opacity', off && 'opacity-45 line-through')}
            >
              <span className="size-2 rounded-full" style={{ background: t.color }} />
              {t.label}
              <span className="font-mono text-[10px] text-faint">{n}</span>
            </button>
          );
        })}
        {conflictCount > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-danger">
            <AlertTriangle className="size-3.5" /> {conflictCount} event{conflictCount === 1 ? ' has' : 's have'} conflicts
          </span>
        )}
      </div>

      {data.events.length === 0 && (
        <Tip id="schedule-start" className="mb-4">
          Click any day to add an event. Drag events to move them; in week and day views, drag up or down to change the time. Filming days get a call sheet.
        </Tip>
      )}

      <div className={cn('grid gap-6', planOpen && 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
        <div className="min-w-0">
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setDragging(null)}>
            {view === 'month' && (
              <MonthView
                anchor={anchor}
                props={calendarProps}
                onShowDay={(d) => {
                  setAnchor(d);
                  setView('day');
                }}
              />
            )}
            {view === 'week' && (
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <TimeGridView
                    days={weekDays(anchor)}
                    props={calendarProps}
                    onShowDay={(d) => {
                      setAnchor(d);
                      setView('day');
                    }}
                  />
                </div>
              </div>
            )}
            {view === 'day' && <TimeGridView days={[anchor]} props={calendarProps} />}
            {view === 'agenda' && (
              <AgendaView
                props={calendarProps}
                showPast={showPast}
                sceneLabel={(ids) => `Scenes ${ids.map((id) => numbers.get(id)).filter(Boolean).join(', ')}`}
              />
            )}
            <DragOverlay dropAnimation={null}>
              {dragging && (
                <div className="flex h-[24px] max-w-[220px] items-center rounded-xs border border-accent bg-raised px-1.5 text-[11.5px] text-ink shadow-pop">
                  <EventChipBody e={dragging} dayIndex={dayIndex} conflicted={errorsOf(conflicts.get(dragging.id)).length > 0} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
          {data.events.length === 0 && view !== 'agenda' && (
            <EmptyState compact icon={<CalendarDays className="size-5" />} title="Nothing scheduled yet" className="mt-2" actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPrefill({ date: todayStr() })}>Add the first event</Button>}>
              {data.scenes.length ? 'Use “Plan by location” to turn scenes into filming days.' : 'Schedule rehearsals, scouting and meetings now; filming days once you have scenes.'}
            </EmptyState>
          )}
        </div>
        {planOpen && (
          <aside className="min-w-0 xl:max-h-[calc(100dvh-180px)] xl:overflow-y-auto xl:pr-1">
            <PlanByLocation data={data} onSchedule={(sceneIds, locationId) => setPrefill({ date: anchor >= todayStr() ? anchor : todayStr(), type: 'filming', sceneIds, locationId })} />
          </aside>
        )}
      </div>

      <NewEventDialog open={!!prefill} onOpenChange={(o) => !o && setPrefill(null)} prefill={prefill} data={data} onCreated={(e) => {
        setAnchor(e.date);
        setEventParam(e.id);
      }} />
      <EventSheet event={openEvent} data={data} open={!!openEvent} onOpenChange={(o) => !o && setEventParam(undefined)} />
    </PageContainer>
  );
}
