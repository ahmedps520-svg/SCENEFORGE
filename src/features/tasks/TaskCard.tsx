import { CalendarClock, Clapperboard, MapPin, Paperclip } from 'lucide-react';
import { Avatar, Badge, cn } from '@/components/ui';
import { TASK_PRIORITIES } from '@/lib/constants';
import { formatShortDate } from '@/lib/dates';
import type { Person, Task } from '@/lib/types';
import { dueState } from './taskUtils';

export interface TaskLookups {
  people: Map<string, Person>;
  sceneNumbers: Map<string, string>;
  locationNames: Map<string, string>;
  assetNames: Map<string, string>;
}

export function DueLabel({ task, className }: { task: Pick<Task, 'due' | 'status'>; className?: string }) {
  if (!task.due) return null;
  const s = dueState(task);
  const text = s === 'today' ? 'Due today' : s === 'overdue' ? `Overdue · ${formatShortDate(task.due)}` : formatShortDate(task.due);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[10.5px]',
        s === 'overdue' && 'text-danger',
        s === 'today' && 'text-warning',
        (s === 'soon' || s === 'later') && 'text-muted',
        s === 'done' && 'text-faint line-through',
        className,
      )}
    >
      <CalendarClock className="size-3" />
      {text}
    </span>
  );
}

export function TaskCardBody({ task, lookups, compact }: { task: Task; lookups: TaskLookups; compact?: boolean }) {
  const assignee = task.assigneeId ? lookups.people.get(task.assigneeId) : undefined;
  const pr = TASK_PRIORITIES.find((p) => p.value === task.priority);
  return (
    <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
      <div className="flex items-start gap-2">
        <p className={cn('min-w-0 flex-1 text-[13px] leading-snug text-ink', task.status === 'done' && 'text-muted line-through decoration-faint')}>{task.title}</p>
        {assignee && <Avatar name={assignee.name} assetId={assignee.photoAssetId} size={22} />}
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {pr && (task.priority === 'high' || task.priority === 'urgent') && <Badge tone={pr.tone}>{pr.label}</Badge>}
          <DueLabel task={task} />
          {task.sceneId && lookups.sceneNumbers.has(task.sceneId) && (
            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-faint">
              <Clapperboard className="size-3" />
              Sc {lookups.sceneNumbers.get(task.sceneId)}
            </span>
          )}
          {task.locationId && lookups.locationNames.has(task.locationId) && (
            <span className="inline-flex max-w-[140px] items-center gap-1 truncate text-[11px] text-faint">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{lookups.locationNames.get(task.locationId)}</span>
            </span>
          )}
          {task.assetId && lookups.assetNames.has(task.assetId) && <Paperclip className="size-3 text-faint" aria-label="Has a related asset" />}
        </div>
      )}
    </div>
  );
}
