import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, Checkbox, cn } from '@/components/ui';
import { PriorityBadge } from '@/components/StatusBadges';
import { TASK_STATUSES } from '@/lib/constants';
import type { Task } from '@/lib/types';
import { DueLabel, type TaskLookups } from './TaskCard';
import { PRIORITY_RANK, updateTask } from './taskUtils';

type SortKey = 'title' | 'assignee' | 'due' | 'priority' | 'status';
const STATUS_RANK = { todo: 0, 'in-progress': 1, blocked: 2, done: 3 } as const;

export function TaskList({ tasks, lookups, onOpen }: { tasks: Task[]; lookups: TaskLookups; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 });

  const rows = useMemo(() => {
    const name = (t: Task) => (t.assigneeId ? lookups.people.get(t.assigneeId)?.name ?? '' : '');
    const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
      title: (a, b) => a.title.localeCompare(b.title),
      assignee: (a, b) => (name(a) || '￿').localeCompare(name(b) || '￿'),
      // Tasks without a deadline sort last either way.
      due: (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'),
      priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
    };
    return [...tasks].sort((a, b) => cmp[sort.key](a, b) * sort.dir || a.order - b.order);
  }, [tasks, sort, lookups.people]);

  const Th = ({ k, children, className }: { k: SortKey; children: string; className?: string }) => (
    <th className={cn('px-3 py-2 text-left font-normal', className)} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="eyebrow inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-[13px]">
        <thead className="border-b border-line bg-surface">
          <tr>
            <th className="w-10 px-3 py-2">
              <span className="sr-only">Done</span>
            </th>
            <Th k="title">Task</Th>
            <Th k="assignee" className="hidden md:table-cell">
              Assigned
            </Th>
            <Th k="due" className="hidden sm:table-cell">
              Deadline
            </Th>
            <Th k="priority" className="hidden md:table-cell">
              Priority
            </Th>
            <Th k="status" className="hidden lg:table-cell">
              Status
            </Th>
            <th className="hidden px-3 py-2 text-left font-normal xl:table-cell">
              <span className="eyebrow">Related</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const who = t.assigneeId ? lookups.people.get(t.assigneeId) : undefined;
            const related = [
              t.sceneId && lookups.sceneNumbers.has(t.sceneId) ? `Scene ${lookups.sceneNumbers.get(t.sceneId)}` : null,
              t.locationId ? lookups.locationNames.get(t.locationId) : null,
              t.assetId ? lookups.assetNames.get(t.assetId) : null,
            ].filter(Boolean);
            return (
              <tr key={t.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-hover/50" onClick={() => onOpen(t.id)}>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={t.status === 'done'} onChange={(v) => void updateTask(t.id, { status: v ? 'done' : 'todo' }, t)} label={<span className="sr-only">Mark “{t.title}” done</span>} />
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('text-ink', t.status === 'done' && 'text-muted line-through decoration-faint')}>{t.title}</span>
                  <div className="mt-0.5 flex flex-wrap gap-2 sm:hidden">
                    <DueLabel task={t} />
                    {who && <span className="text-[11.5px] text-faint">{who.name}</span>}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  {who ? (
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={who.name} assetId={who.photoAssetId} size={20} />
                      <span className="truncate text-muted">{who.name}</span>
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">{t.due ? <DueLabel task={t} /> : <span className="text-faint">—</span>}</td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="hidden px-3 py-2.5 text-muted lg:table-cell">{TASK_STATUSES.find((s) => s.value === t.status)?.label}</td>
                <td className="hidden max-w-[220px] truncate px-3 py-2.5 text-[12px] text-faint xl:table-cell">{related.join(' · ') || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
