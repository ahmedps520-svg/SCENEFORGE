import { addDaysStr, todayStr } from '@/lib/dates';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeTask } from '@/lib/data/factories';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';

export type DeadlineFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export interface TaskFilters {
  assignee: 'all' | 'unassigned' | string;
  deadline: DeadlineFilter;
  priority: 'all' | TaskPriority;
  status: 'all' | 'open' | TaskStatus;
  q: string;
}

export const DEFAULT_FILTERS: TaskFilters = { assignee: 'all', deadline: 'all', priority: 'all', status: 'all', q: '' };

export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export type DueState = 'done' | 'overdue' | 'today' | 'soon' | 'later' | 'none';

/** How urgent a task's deadline is, relative to today. */
export function dueState(t: Pick<Task, 'due' | 'status'>, today = todayStr()): DueState {
  if (t.status === 'done') return 'done';
  if (!t.due) return 'none';
  if (t.due < today) return 'overdue';
  if (t.due === today) return 'today';
  if (t.due <= addDaysStr(today, 6)) return 'soon';
  return 'later';
}

export function filterTasks(tasks: Task[], f: TaskFilters, today = todayStr()): Task[] {
  const q = f.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.assignee === 'unassigned' ? !!t.assigneeId : f.assignee !== 'all' && t.assigneeId !== f.assignee) return false;
    if (f.priority !== 'all' && t.priority !== f.priority) return false;
    if (f.status === 'open' ? t.status === 'done' : f.status !== 'all' && t.status !== f.status) return false;
    const d = dueState(t, today);
    if (f.deadline === 'overdue' && d !== 'overdue') return false;
    if (f.deadline === 'today' && d !== 'today') return false;
    if (f.deadline === 'week' && !(t.due && t.due >= today && t.due <= addDaysStr(today, 6) && t.status !== 'done')) return false;
    if (f.deadline === 'none' && t.due) return false;
    if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function activeFilterCount(f: TaskFilters): number {
  return (f.assignee !== 'all' ? 1 : 0) + (f.deadline !== 'all' ? 1 : 0) + (f.priority !== 'all' ? 1 : 0) + (f.status !== 'all' ? 1 : 0) + (f.q.trim() ? 1 : 0);
}

/** Update a task, keeping completedAt in step with the status. */
export async function updateTask(id: string, patch: Partial<Task>, current?: Task) {
  const next: Partial<Task> = { ...patch };
  if (patch.status && patch.status !== current?.status) next.completedAt = patch.status === 'done' ? Date.now() : undefined;
  await updateRecord<Task>('tasks', id, next);
}

export async function createTask(projectId: string, p: Partial<Task> & { title: string }): Promise<Task> {
  const title = p.title.trim();
  if (!title) throw new Error('A task needs a title.');
  return createRecord('tasks', makeTask(projectId, { ...p, title, order: p.order ?? Date.now() }));
}
