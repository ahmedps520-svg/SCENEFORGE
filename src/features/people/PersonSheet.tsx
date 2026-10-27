import { CheckCircle2, Circle, Lock, Trash2, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Comments } from '@/components/Comments';
import { PriorityBadge } from '@/components/StatusBadges';
import { AutoText, Badge, Button, Field, ImageUpload, MultiPicker, Section, Select, Sheet, toastError, useConfirm } from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { ACCESS_ROLES, CAST_ROLES, CREW_ROLES } from '@/lib/constants';
import { buildScheduleContext, requiredPeople } from '@/lib/conflicts';
import { updateRecord } from '@/lib/data/crud';
import { formatShortDate } from '@/lib/dates';
import type { AccessRole, Character, Location, Person, Scene, ScheduleEvent, Task } from '@/lib/types';
import { UnavailableDatesEditor } from '../schedule/DatesEditor';

export function roleOptions(people: Person[], extra: string[] = []) {
  const all = new Set<string>([...CREW_ROLES, ...CAST_ROLES, ...people.flatMap((p) => p.roles), ...extra]);
  return [...all].map((r) => ({ value: r, label: r }));
}

export function PersonSheet({
  projectId,
  person,
  people,
  characters,
  tasks,
  events,
  scenes,
  locations,
  open,
  onOpenChange,
}: {
  projectId: string;
  person: Person | undefined;
  people: Person[];
  characters: Character[];
  tasks: Task[];
  events: ScheduleEvent[];
  scenes: Scene[];
  locations: Location[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteEntity();
  const confirm = useConfirm();
  const ctx = useMemo(() => buildScheduleContext({ scenes, characters, people, locations }), [scenes, characters, people, locations]);
  if (!person) return null;
  const p = person;
  const save = (patch: Partial<Person>) => updateRecord<Person>('people', p.id, patch).catch((e) => toastError(e, 'Not saved'));

  const played = characters.filter((c) => c.actorId === p.id);
  const assigned = tasks.filter((t) => t.assigneeId === p.id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due ?? '9').localeCompare(b.due ?? '9'));
  const neededOn = [...new Set(events.filter((e) => requiredPeople(e, ctx).includes(p.id)).map((e) => e.date))].sort();
  const peopleById = new Map(people.map((x) => [x.id, x]));

  const setPlayed = async (ids: string[]) => {
    try {
      const before = new Set(played.map((c) => c.id));
      for (const c of characters) {
        if (ids.includes(c.id) && !before.has(c.id)) await updateRecord<Character>('characters', c.id, { actorId: p.id }, { summary: `Cast ${p.name} as ${c.name}` });
        if (!ids.includes(c.id) && before.has(c.id)) await updateRecord<Character>('characters', c.id, { actorId: undefined }, { summary: `Uncast ${c.name}` });
      }
    } catch (e) {
      toastError(e, 'Casting not saved');
    }
  };

  const onDelete = async () => {
    if (p.isYou) {
      const ok = await confirm({
        title: 'Remove yourself from this project?',
        message: 'This person is marked as you, the project owner. Removing them unassigns your tasks and roles. You can undo this right after.',
        confirmLabel: 'Remove me',
        danger: true,
      });
      if (!ok) return;
    }
    const ok = await remove('person', p.id, {
      skipConfirm: p.isYou,
      confirmTitle: `Remove ${p.name} from cast and crew?`,
      confirmMessage: `${played.length ? `${played.map((c) => c.name).join(', ')} will become uncast. ` : ''}${assigned.length ? `${assigned.length} task(s) will be unassigned. ` : ''}You can undo this right after.`,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={p.name || 'Unnamed'}
      description={p.roles.join(' · ') || 'No role yet'}
      headerExtra={p.isYou ? <Badge tone="accent">You</Badge> : undefined}
      footer={
        <>
          <Button variant="danger-ghost" icon={<Trash2 className="size-4" />} onClick={() => void onDelete()}>
            Remove person
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div key={p.id} className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row">
          <ImageUpload projectId={projectId} value={p.photoAssetId} onChange={(photoAssetId) => void save({ photoAssetId })} category="portrait" label="Photo" hint="Optional" aspect="aspect-square" className="w-32 shrink-0" />
          <div className="min-w-0 flex-1 space-y-4">
            <AutoText label="Name" value={p.name} onSave={(name) => save({ name: name.trim() })} required="A name is required." />
            <Field label="Roles">
              <MultiPicker value={p.roles} onChange={(roles) => void save({ roles })} options={roleOptions(people, p.roles)} placeholder="Add role" onCreate={(text) => text} createLabel={(t) => `Add custom role “${t}”`} />
            </Field>
          </div>
        </div>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" /> Contact · private
            </span>
          }
          description="Optional. Stays on this device; never shown in presentations and removed from backups exported with “strip private info”."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AutoText label="Email" type="email" value={p.email} onSave={(email) => save({ email: email.trim() })} optional />
            <AutoText label="Phone" type="tel" value={p.phone} onSave={(phone) => save({ phone: phone.trim() })} optional />
          </div>
        </Section>

        <Section title="Characters played" description={characters.length ? 'Picking a character someone else plays recasts it.' : undefined}>
          {characters.length ? (
            <MultiPicker
              value={played.map((c) => c.id)}
              onChange={(ids) => void setPlayed(ids)}
              options={characters.map((c) => ({
                value: c.id,
                label: c.name || 'Unnamed character',
                hint: c.actorId && c.actorId !== p.id ? `Currently ${peopleById.get(c.actorId)?.name ?? 'cast'}` : c.actorId ? undefined : 'Not cast',
              }))}
              placeholder="Assign character"
            />
          ) : (
            <p className="text-[12.5px] text-faint">
              No characters yet. Create them in <Link to="../characters" className="link">Characters</Link> or let the script detect speaking roles.
            </p>
          )}
        </Section>

        <Section title="Availability">
          <div className="space-y-4">
            {neededOn.some((d) => p.unavailableDates.includes(d)) && (
              <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                Needed on {neededOn.filter((d) => p.unavailableDates.includes(d)).map(formatShortDate).join(', ')} but marked unavailable. <Link to="../schedule" className="underline">Review schedule</Link>
              </p>
            )}
            <AutoText label="Availability notes" value={p.availabilityNotes} onSave={(availabilityNotes) => save({ availabilityNotes })} multiline rows={2} placeholder="e.g. Weekdays after 5pm, free all of August" />
            <div>
              <div className="label">Unavailable dates</div>
              <UnavailableDatesEditor value={p.unavailableDates} onChange={(unavailableDates) => void save({ unavailableDates })} highlight={neededOn} highlightLabel="Needed on set" />
            </div>
          </div>
        </Section>

        <Section title={`Assigned tasks · ${assigned.filter((t) => t.status !== 'done').length} open`}>
          {assigned.length ? (
            <ul className="divide-y divide-line rounded-md border border-line">
              {assigned.map((t) => (
                <li key={t.id}>
                  <Link to={`../tasks?task=${t.id}`} className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-hover/50">
                    {t.status === 'done' ? <CheckCircle2 className="size-3.5 shrink-0 text-success" /> : <Circle className="size-3.5 shrink-0 text-faint" />}
                    <span className={t.status === 'done' ? 'min-w-0 flex-1 truncate text-faint line-through' : 'min-w-0 flex-1 truncate'}>{t.title}</span>
                    {t.due && <span className="font-mono text-[11px] text-faint">{formatShortDate(t.due)}</span>}
                    <PriorityBadge priority={t.priority} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-faint">No tasks assigned. Assign tasks from the Tasks board.</p>
          )}
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3" /> Project access
            </span>
          }
          description="Records what this person may do in the project. Inviting collaborators and syncing changes between devices needs a sync service, which isn’t configured — see project Settings."
        >
          <Select
            value={p.accessRole ?? ''}
            onChange={(e) => void save({ accessRole: (e.target.value || undefined) as AccessRole | undefined })}
            aria-label="Project access"
            disabled={p.isYou && p.accessRole === 'owner'}
          >
            <option value="">Not a collaborator</option>
            {ACCESS_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.hint}
              </option>
            ))}
          </Select>
        </Section>

        <AutoText label="Notes" value={p.notes} onSave={(notes) => save({ notes })} multiline rows={3} placeholder="Sizes, dietary needs, transport, anything the production should know" />

        <Comments projectId={projectId} entityType="person" entityId={p.id} />
      </div>
    </Sheet>
  );
}
