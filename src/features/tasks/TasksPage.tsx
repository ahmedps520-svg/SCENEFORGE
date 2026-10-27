import { CalendarDays, Columns3, List, ListChecks, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { personOptions, sceneOptions } from '@/components/options';
import { Button, Dialog, EmptyState, Field, Input, Loading, PageContainer, PageHeader, Segmented, Select, SinglePicker, Tip, toastError } from '@/components/ui';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants';
import { useAssets, useLocations, usePeople, useScenes, useTasks } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import type { Task, TaskPriority } from '@/lib/types';
import { TaskBoard } from './TaskBoard';
import { TaskCalendar } from './TaskCalendar';
import type { TaskLookups } from './TaskCard';
import { TaskList } from './TaskList';
import { TaskSheet } from './TaskSheet';
import { activeFilterCount, createTask, DEFAULT_FILTERS, dueState, filterTasks, type DeadlineFilter, type TaskFilters } from './taskUtils';

type View = 'board' | 'list' | 'calendar';
const VIEW_KEY = 'sceneforge:tasks-view';

export default function TasksPage() {
  const { project } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tasks = useTasks(project.id);
  const people = usePeople(project.id);
  const scenes = useScenes(project.id);
  const locations = useLocations(project.id);
  const assets = useAssets(project.id);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [creating, setCreating] = useState(false);
  const [view, setViewState] = useState<View>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || 'board';
    } catch {
      return 'board';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const numbers = useMemo(() => sceneNumbers(scenes ?? []), [scenes]);
  const lookups: TaskLookups = useMemo(
    () => ({
      people: new Map((people ?? []).map((p) => [p.id, p])),
      sceneNumbers: numbers,
      locationNames: new Map((locations ?? []).map((l) => [l.id, l.name])),
      assetNames: new Map((assets ?? []).map((a) => [a.id, a.name])),
    }),
    [people, numbers, locations, assets],
  );

  const openId = params.get('task');
  const openTask = openId ? tasks?.find((t) => t.id === openId) ?? null : null;
  const open = (id: string) => setParams((p) => {
    p.set('task', id);
    return p;
  });
  const close = () => setParams((p) => {
    p.delete('task');
    return p;
  });

  // A deep link to a deleted task just closes quietly.
  useEffect(() => {
    if (openId && tasks && !tasks.some((t) => t.id === openId)) close();
  }, [openId, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tasks || !people || !scenes || !locations || !assets) return <Loading label="Loading tasks" />;

  const visible = filterTasks(tasks, filters);
  const overdueCount = tasks.filter((t) => dueState(t) === 'overdue').length;
  const openCount = tasks.filter((t) => t.status !== 'done').length;
  const filterCount = activeFilterCount(filters);

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={`${openCount} open · ${tasks.length - openCount} done`}
        title="Tasks"
        description="Everything that has to happen before, during and after the shoot — assigned, dated and tied to the scenes, locations and files it concerns."
        actions={
          <>
            <Segmented
              label="Task view"
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Board', icon: <Columns3 className="size-3.5" /> },
                { value: 'list', label: 'List', icon: <List className="size-3.5" /> },
                { value: 'calendar', label: 'Calendar', icon: <CalendarDays className="size-3.5" /> },
              ]}
            />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New task
            </Button>
          </>
        }
      />

      {tasks.length > 0 && (
        <>
          <Tip id="tasks-board" className="mb-4">
            Drag cards between columns to change status. Overdue tasks are outlined in red — SCENEFORGE never sends reminders, it just keeps them visible.
          </Tip>
          <FilterBar filters={filters} setFilters={setFilters} people={people} overdueCount={overdueCount} count={filterCount} hideStatus={view === 'board'} />
        </>
      )}

      <div className="mt-4">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-6" />}
            title="No production tasks yet"
            actions={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Add the first task
              </Button>
            }
          >
            Track the work that gets a film made: securing the diner location, preparing costumes, rehearsing dialogue, charging camera batteries, recording room tone, editing scene 4. Give each task an owner and a deadline.
          </EmptyState>
        ) : visible.length === 0 && view !== 'board' ? (
          <EmptyState compact title="No tasks match these filters" actions={<Button onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>} />
        ) : view === 'board' ? (
          <TaskBoard projectId={project.id} tasks={visible} lookups={lookups} onOpen={open} />
        ) : view === 'list' ? (
          <TaskList tasks={visible} lookups={lookups} onOpen={open} />
        ) : (
          <TaskCalendar tasks={visible} lookups={lookups} onOpen={open} />
        )}
      </div>

      <TaskSheet task={openTask} projectId={project.id} people={people} scenes={scenes} numbers={numbers} locations={locations} assets={assets} onClose={close} />
      <NewTaskDialog
        open={creating}
        onOpenChange={setCreating}
        projectId={project.id}
        people={people}
        sceneOpts={sceneOptions(scenes, numbers)}
        defaultAssignee={filters.assignee !== 'all' && filters.assignee !== 'unassigned' ? filters.assignee : undefined}
        onCreated={(t) => open(t.id)}
      />
    </PageContainer>
  );
}

function FilterBar({
  filters,
  setFilters,
  people,
  overdueCount,
  count,
  hideStatus,
}: {
  filters: TaskFilters;
  setFilters: (f: TaskFilters) => void;
  people: { id: string; name: string; roles: string[] }[];
  overdueCount: number;
  count: number;
  hideStatus: boolean;
}) {
  const set = <K extends keyof TaskFilters>(k: K, v: TaskFilters[K]) => setFilters({ ...filters, [k]: v });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
        <Input value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Search tasks" className="h-8 pl-8 text-[12.5px]" aria-label="Search tasks" />
      </div>
      <Select value={filters.assignee} onChange={(e) => set('assignee', e.target.value)} className="h-8 w-auto text-[12.5px]" aria-label="Filter by person">
        <option value="all">Anyone</option>
        <option value="unassigned">Unassigned</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select value={filters.deadline} onChange={(e) => set('deadline', e.target.value as DeadlineFilter)} className="h-8 w-auto text-[12.5px]" aria-label="Filter by deadline">
        <option value="all">Any deadline</option>
        <option value="overdue">Overdue</option>
        <option value="today">Due today</option>
        <option value="week">Due in the next 7 days</option>
        <option value="none">No deadline</option>
      </Select>
      <Select value={filters.priority} onChange={(e) => set('priority', e.target.value as 'all' | TaskPriority)} className="h-8 w-auto text-[12.5px]" aria-label="Filter by priority">
        <option value="all">Any priority</option>
        {TASK_PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {!hideStatus && (
        <Select value={filters.status} onChange={(e) => set('status', e.target.value as TaskFilters['status'])} className="h-8 w-auto text-[12.5px]" aria-label="Filter by status">
          <option value="all">Any status</option>
          <option value="open">Not done</option>
          {TASK_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
      {overdueCount > 0 && filters.deadline !== 'overdue' && (
        <button onClick={() => set('deadline', 'overdue')} className="h-8 rounded-sm px-2 font-mono text-[11.5px] text-danger hover:bg-danger-soft">
          {overdueCount} overdue
        </button>
      )}
      {count > 0 && (
        <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setFilters(DEFAULT_FILTERS)}>
          Clear {count > 1 ? `${count} filters` : 'filter'}
        </Button>
      )}
    </div>
  );
}

function NewTaskDialog({
  open,
  onOpenChange,
  projectId,
  people,
  sceneOpts,
  defaultAssignee,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  people: Parameters<typeof personOptions>[0];
  sceneOpts: ReturnType<typeof sceneOptions>;
  defaultAssignee?: string;
  onCreated: (t: Task) => void;
}) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssignee] = useState<string | undefined>(defaultAssignee);
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [sceneId, setSceneId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setAssignee(defaultAssignee);
      setDue('');
      setPriority('medium');
      setSceneId(undefined);
      setError(null);
    }
  }, [open, defaultAssignee]);

  const submit = async () => {
    if (!title.trim()) {
      setError('Give the task a title.');
      return;
    }
    setBusy(true);
    try {
      const t = await createTask(projectId, { title, assigneeId, due: due || undefined, priority, sceneId });
      onOpenChange(false);
      onCreated(t);
    } catch (e) {
      toastError(e, 'Task not created');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New task"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Create task
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Title" error={error}>
          <Input autoFocus value={title} invalid={!!error} onChange={(e) => (setTitle(e.target.value), setError(null))} placeholder="e.g. Secure the diner location" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Assigned to" optional>
            <SinglePicker value={assigneeId} onChange={setAssignee} options={personOptions(people)} placeholder="Unassigned" noneLabel="Unassigned" />
          </Field>
          <Field label="Deadline" optional>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scene" optional>
            <SinglePicker value={sceneId} onChange={setSceneId} options={sceneOpts} placeholder="None" noneLabel="None" />
          </Field>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
