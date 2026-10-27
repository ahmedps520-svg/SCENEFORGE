import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn, toastError } from '@/components/ui';
import { TASK_STATUSES } from '@/lib/constants';
import { db } from '@/lib/db';
import type { Task, TaskStatus } from '@/lib/types';
import { TaskCardBody, type TaskLookups } from './TaskCard';
import { createTask, dueState, updateTask } from './taskUtils';

type Columns = Record<TaskStatus, string[]>;

function toColumns(tasks: Task[]): Columns {
  const cols: Columns = { todo: [], 'in-progress': [], blocked: [], done: [] };
  for (const t of [...tasks].sort((a, b) => a.order - b.order)) cols[t.status].push(t.id);
  return cols;
}

function findColumn(cols: Columns, id: string): TaskStatus | undefined {
  if (id.startsWith('col:')) return id.slice(4) as TaskStatus;
  return (Object.keys(cols) as TaskStatus[]).find((k) => cols[k].includes(id));
}

export function TaskBoard({ projectId, tasks, lookups, onOpen }: { projectId: string; tasks: Task[]; lookups: TaskLookups; onOpen: (id: string) => void }) {
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [cols, setCols] = useState<Columns>(() => toColumns(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  // Follow database changes except while a drag is in progress.
  useEffect(() => {
    if (!activeId) setCols(toColumns(tasks));
  }, [tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    // Space picks up / drops a card; Enter stays free for opening it.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(cols, String(active.id));
    const to = findColumn(cols, String(over.id));
    if (!from || !to || from === to) return;
    setCols((c) => {
      const fromList = c[from].filter((x) => x !== active.id);
      const toList = [...c[to]];
      const overIdx = toList.indexOf(String(over.id));
      toList.splice(overIdx >= 0 ? overIdx : toList.length, 0, String(active.id));
      return { ...c, [from]: fromList, [to]: toList };
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return setCols(toColumns(tasks));
    const id = String(active.id);
    const col = findColumn(cols, id);
    if (!col) return;
    let list = cols[col];
    const overIdx = list.indexOf(String(over.id));
    const curIdx = list.indexOf(id);
    if (overIdx >= 0 && curIdx >= 0 && overIdx !== curIdx) {
      list = [...list];
      list.splice(curIdx, 1);
      list.splice(overIdx, 0, id);
      setCols((c) => ({ ...c, [col]: list }));
    }
    const task = byId.get(id);
    if (!task) return;
    try {
      if (task.status !== col) await updateTask(id, { status: col }, task);
      // Renumber the column so the new order sticks.
      const t = Date.now();
      await db.transaction('rw', db.tasks, async () => {
        for (let i = 0; i < list.length; i++) {
          const existing = byId.get(list[i]);
          if (existing && existing.order !== i * 1024) await db.tasks.update(list[i], { order: i * 1024, updatedAt: t });
        }
      });
    } catch (err) {
      toastError(err, 'Couldn’t move the task');
      setCols(toColumns(tasks));
    }
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setActiveId(null)}>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        {TASK_STATUSES.map((s) => (
          <Column key={s.value} projectId={projectId} status={s.value} label={s.label} ids={cols[s.value]} byId={byId} lookups={lookups} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {active && (
          <div className="rotate-[1.2deg] rounded-md border border-line-strong bg-raised p-3 shadow-pop">
            <TaskCardBody task={active} lookups={lookups} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  projectId,
  status,
  label,
  ids,
  byId,
  lookups,
  onOpen,
}: {
  projectId: string;
  status: TaskStatus;
  label: string;
  ids: string[];
  byId: Map<string, Task>;
  lookups: TaskLookups;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const [adding, setAdding] = useState('');
  const overdue = ids.filter((id) => {
    const t = byId.get(id);
    return t && dueState(t) === 'overdue';
  }).length;

  const add = async () => {
    const title = adding.trim();
    if (!title) return;
    try {
      await createTask(projectId, { title, status });
      setAdding('');
    } catch (e) {
      toastError(e, 'Task not added');
    }
  };

  return (
    <section className={cn('flex w-[82vw] max-w-[340px] shrink-0 snap-start flex-col rounded-md border bg-surface/60 sm:w-auto sm:max-w-none', isOver ? 'border-accent' : 'border-line')} aria-label={`${label} column`}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className={cn('size-2 rounded-full', status === 'done' ? 'bg-success' : status === 'blocked' ? 'bg-danger' : status === 'in-progress' ? 'bg-info' : 'bg-faint')} />
        <h3 className="text-[12.5px] font-medium text-ink">{label}</h3>
        <span className="font-mono text-[11px] text-faint">{ids.length}</span>
        {overdue > 0 && status !== 'done' && <span className="ml-auto font-mono text-[10.5px] text-danger">{overdue} overdue</span>}
      </header>
      <div ref={setNodeRef} className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableTask key={id} task={t} lookups={lookups} onOpen={onOpen} /> : null;
          })}
        </SortableContext>
        {!ids.length && <p className="px-2 py-6 text-center text-[12px] text-faint">Drop tasks here</p>}
      </div>
      <div className="border-t border-line p-2">
        <div className="flex items-center gap-1.5 rounded-sm px-1.5 focus-within:bg-raised">
          <Plus className="size-3.5 text-faint" />
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
              if (e.key === 'Escape') setAdding('');
            }}
            placeholder="Add a task…"
            aria-label={`Add a task to ${label}`}
            className="h-8 w-full bg-transparent text-[12.5px] outline-none placeholder:text-faint"
          />
        </div>
      </div>
    </section>
  );
}

function SortableTask({ task, lookups, onOpen }: { task: Task; lookups: TaskLookups; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const overdue = dueState(task) === 'overdue';
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(task.id);
        listeners?.onKeyDown?.(e);
      }}
      className={cn(
        'cursor-grab touch-manipulation rounded-md border bg-raised p-3 text-left transition-[border-color,box-shadow] hover:border-line-strong active:cursor-grabbing',
        overdue ? 'border-[color-mix(in_srgb,var(--c-danger)_35%,transparent)]' : 'border-line',
        isDragging && 'opacity-40',
      )}
    >
      <TaskCardBody task={task} lookups={lookups} />
    </div>
  );
}
