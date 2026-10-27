import { ArrowUpRight, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Comments } from '@/components/Comments';
import { locationOptions, personOptions, sceneOptions } from '@/components/options';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { AutoText, Button, Field, Input, Select, Sheet, SinglePicker, toastError } from '@/components/ui';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants';
import { formatDate, relativeTime } from '@/lib/dates';
import type { Asset, Location, Person, Scene, Task, TaskPriority, TaskStatus } from '@/lib/types';
import { DueLabel } from './TaskCard';
import { dueState, updateTask } from './taskUtils';

export function TaskSheet({
  task,
  projectId,
  people,
  scenes,
  numbers,
  locations,
  assets,
  onClose,
}: {
  task: Task | null;
  projectId: string;
  people: Person[];
  scenes: Scene[];
  numbers: Map<string, string>;
  locations: Location[];
  assets: Asset[];
  onClose: () => void;
}) {
  const del = useDeleteEntity();
  const save = (patch: Partial<Task>) => (task ? updateTask(task.id, patch, task).catch((e) => toastError(e, 'Change not saved')) : undefined);
  const overdue = task ? dueState(task) === 'overdue' : false;

  return (
    <Sheet
      open={!!task}
      onOpenChange={(o) => !o && onClose()}
      title={task?.title || 'Task'}
      description={task ? `Created ${relativeTime(task.createdAt)}${task.completedAt ? ` · Completed ${relativeTime(task.completedAt)}` : ''}` : undefined}
      footer={
        task && (
          <>
            <Button
              variant="danger-ghost"
              size="sm"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (await del('task', task.id, { confirmTitle: 'Delete this task?', confirmMessage: `“${task.title}” and its comments will be deleted. You can undo right after.` })) onClose();
              }}
            >
              Delete task
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      {task && (
        <div className="space-y-5">
          {overdue && (
            <div className="rounded-sm border border-[color-mix(in_srgb,var(--c-danger)_30%,transparent)] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              This task was due {formatDate(task.due)}.
            </div>
          )}
          <AutoText key={`${task.id}-title`} label="Title" value={task.title} required="A task needs a title" onSave={(v) => save({ title: v.trim() })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={task.status} onChange={(e) => void save({ status: e.target.value as TaskStatus })}>
                {TASK_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={task.priority} onChange={(e) => void save({ priority: e.target.value as TaskPriority })}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned to">
              <SinglePicker value={task.assigneeId} onChange={(v) => void save({ assigneeId: v })} options={personOptions(people)} placeholder="Unassigned" noneLabel="Unassigned" />
            </Field>
            <Field label="Deadline" aside={task.due ? <DueLabel task={task} /> : undefined}>
              <div className="flex gap-1.5">
                <Input type="date" value={task.due ?? ''} onChange={(e) => void save({ due: e.target.value || undefined })} />
                {task.due && (
                  <Button variant="ghost" size="sm" className="h-9" onClick={() => void save({ due: undefined })}>
                    Clear
                  </Button>
                )}
              </div>
            </Field>
          </div>
          {!people.length && <p className="-mt-2 text-[12px] text-faint">Add people in Cast &amp; Crew to assign tasks to them.</p>}
          <AutoText key={`${task.id}-desc`} label="Description" multiline rows={4} value={task.description} placeholder="Details, links, what “done” looks like…" onSave={(v) => save({ description: v })} />

          <div className="space-y-3 border-t border-line pt-4">
            <div className="eyebrow">Related to</div>
            <RelatedRow
              label="Scene"
              value={task.sceneId}
              options={sceneOptions(scenes, numbers)}
              onChange={(v) => void save({ sceneId: v })}
              link={task.sceneId ? `/p/${projectId}/scenes?scene=${task.sceneId}` : undefined}
            />
            <RelatedRow
              label="Location"
              value={task.locationId}
              options={locationOptions(locations)}
              onChange={(v) => void save({ locationId: v })}
              link={task.locationId ? `/p/${projectId}/locations?location=${task.locationId}` : undefined}
            />
            <RelatedRow
              label="Asset"
              value={task.assetId}
              options={assets.map((a) => ({ value: a.id, label: a.name, hint: a.folder || undefined }))}
              onChange={(v) => void save({ assetId: v })}
              link={task.assetId ? `/p/${projectId}/assets?asset=${task.assetId}` : undefined}
            />
          </div>

          <div className="border-t border-line pt-4">
            <Comments projectId={projectId} entityType="task" entityId={task.id} />
          </div>
        </div>
      )}
    </Sheet>
  );
}

function RelatedRow({ label, value, options, onChange, link }: { label: string; value?: string; options: { value: string; label: string; hint?: string }[]; onChange: (v?: string) => void; link?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[12px] text-muted">{label}</span>
      <SinglePicker value={value} onChange={onChange} options={options} placeholder={options.length ? 'None' : `No ${label.toLowerCase()}s yet`} noneLabel="None" className="min-w-0 flex-1" />
      {link && (
        <Link to={link} className="btn-icon shrink-0" aria-label={`Open ${label.toLowerCase()}`} title={`Open ${label.toLowerCase()}`}>
          <ArrowUpRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
