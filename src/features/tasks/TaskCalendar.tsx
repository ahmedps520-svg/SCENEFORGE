import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, cn, IconButton, toastError } from '@/components/ui';
import { formatDate, toDateStr, todayStr } from '@/lib/dates';
import type { Task } from '@/lib/types';
import { DueLabel, TaskCardBody, type TaskLookups } from './TaskCard';
import { dueState, updateTask } from './taskUtils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TaskCalendar({ tasks, lookups, onOpen }: { tasks: Task[]; lookups: TaskLookups; onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dragging, setDragging] = useState<Task | null>(null);
  const today = todayStr();

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }),
    [month],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) if (t.due) m.set(t.due, [...(m.get(t.due) ?? []), t]);
    return m;
  }, [tasks]);
  const undated = tasks.filter((t) => !t.due && t.status !== 'done');
  const monthTasks = tasks.filter((t) => t.due && isSameMonth(new Date(t.due + 'T00:00'), month)).sort((a, b) => a.due!.localeCompare(b.due!));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const target = e.over?.id ? String(e.over.id) : null;
    if (!task || !target) return;
    const due = target === 'day:none' ? undefined : target.slice(4);
    if (due === task.due) return;
    try {
      await updateTask(task.id, { due }, task);
    } catch (err) {
      toastError(err, 'Couldn’t change the deadline');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <h2 className="display min-w-[170px] text-[24px] text-ink">{format(month, 'MMMM yyyy')}</h2>
        <IconButton label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="size-4" />
        </IconButton>
        <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
          Today
        </Button>
        <span className="ml-auto hidden text-[12px] text-faint md:inline">Drag a task to another day to change its deadline.</span>
      </div>

      {/* Phones: an agenda of this month's deadlines. */}
      <div className="space-y-2 md:hidden">
        {monthTasks.length === 0 && <p className="py-6 text-center text-[13px] text-faint">No deadlines this month.</p>}
        {monthTasks.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} className="flex w-full items-center gap-3 rounded-md border border-line bg-surface p-3 text-left">
            <div className="w-12 shrink-0 text-center">
              <div className="slate text-[9.5px]">{formatDate(t.due, 'EEE')}</div>
              <div className="display text-[22px] text-ink">{formatDate(t.due, 'd')}</div>
            </div>
            <div className="min-w-0 flex-1">
              <TaskCardBody task={t} lookups={lookups} compact />
              <DueLabel task={t} />
            </div>
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null)} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setDragging(null)}>
        <div className="hidden gap-4 md:flex">
          <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-line">
            <div className="grid grid-cols-7 border-b border-line bg-surface">
              {WEEKDAYS.map((d) => (
                <div key={d} className="eyebrow px-2 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = toDateStr(d);
                return <DayCell key={key} date={key} inMonth={isSameMonth(d, month)} isToday={key === today} tasks={byDay.get(key) ?? []} onOpen={onOpen} />;
              })}
            </div>
          </div>
          <NoDeadline tasks={undated} onOpen={onOpen} />
        </div>
        <DragOverlay>{dragging && <div className="rounded-sm border border-line-strong bg-raised px-2 py-1 text-[12px] shadow-pop">{dragging.title}</div>}</DragOverlay>
      </DndContext>
    </div>
  );
}

function DayCell({ date, inMonth, isToday, tasks, onOpen }: { date: string; inMonth: boolean; isToday: boolean; tasks: Task[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  return (
    <div ref={setNodeRef} className={cn('min-h-[108px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-surface/40', isOver && 'bg-accent-soft')}>
      <div className={cn('mb-1 flex size-6 items-center justify-center rounded-full font-mono text-[11px]', isToday ? 'bg-accent text-accent-ink' : inMonth ? 'text-muted' : 'text-faint')}>{Number(date.slice(8))}</div>
      <div className="space-y-1">
        {tasks.slice(0, 4).map((t) => (
          <DraggableChip key={t.id} task={t} onOpen={onOpen} />
        ))}
        {tasks.length > 4 && <div className="px-1 text-[10.5px] text-faint">+{tasks.length - 4} more</div>}
      </div>
    </div>
  );
}

function DraggableChip({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const s = dueState(task);
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      title={task.title}
      className={cn(
        'block w-full truncate rounded-xs border px-1.5 py-0.5 text-left text-[11.5px] touch-manipulation',
        s === 'overdue' ? 'border-[color-mix(in_srgb,var(--c-danger)_40%,transparent)] bg-danger-soft text-danger' : s === 'done' ? 'border-line text-faint line-through' : 'border-line bg-raised text-ink hover:border-line-strong',
        isDragging && 'opacity-40',
      )}
    >
      {task.title}
    </button>
  );
}

function NoDeadline({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'day:none' });
  return (
    <aside ref={setNodeRef} className={cn('w-56 shrink-0 self-start rounded-md border p-3', isOver ? 'border-accent bg-accent-soft' : 'border-line bg-surface/60')}>
      <div className="eyebrow mb-1">No deadline</div>
      <p className="mb-2 text-[11.5px] text-faint">Drag onto a day to schedule. Drop here to clear a deadline.</p>
      <div className="space-y-1">
        {tasks.map((t) => (
          <DraggableChip key={t.id} task={t} onOpen={onOpen} />
        ))}
        {!tasks.length && <p className="text-[12px] text-faint">Every open task has a deadline.</p>}
      </div>
    </aside>
  );
}
