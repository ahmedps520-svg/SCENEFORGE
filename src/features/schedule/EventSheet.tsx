import { AlertTriangle, CheckCircle2, ClipboardList, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { locationOptions, personOptions, sceneOptions } from '@/components/options';
import { AutoText, Button, Field, MultiPicker, Section, Select, Sheet, SinglePicker, toastError } from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { EVENT_TYPES, eventTypeMeta } from '@/lib/constants';
import { buildScheduleContext, castForScenes, findConflicts } from '@/lib/conflicts';
import { updateRecord } from '@/lib/data/crud';
import { formatDate, formatTime, isDateStr } from '@/lib/dates';
import type { ProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import type { EventType, ScheduleEvent } from '@/lib/types';
import { DURATION_OPTIONS, durationLabel, endTime, errorsOf, eventTitle, filmingDayIndex, scenesSummary } from './eventUtils';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function EventSheet({ event, data, open, onOpenChange }: { event: ScheduleEvent | undefined; data: ProjectData; open: boolean; onOpenChange: (o: boolean) => void }) {
  const remove = useDeleteEntity();
  const ctx = useMemo(() => buildScheduleContext(data), [data]);
  const numbers = useMemo(() => sceneNumbers(data.scenes), [data.scenes]);
  const sceneMap = useMemo(() => new Map(data.scenes.map((s) => [s.id, s])), [data.scenes]);
  const dayIndex = useMemo(() => filmingDayIndex(data.events), [data.events]);
  const conflictMap = useMemo(() => findConflicts(data.events, ctx), [data.events, ctx]);

  if (!event) return null;
  const e = event;
  const save = (patch: Partial<ScheduleEvent>) => updateRecord<ScheduleEvent>('events', e.id, patch).catch((err) => toastError(err, 'Not saved'));
  const conflicts = errorsOf(conflictMap.get(e.id));
  const warnings = (conflictMap.get(e.id) ?? []).filter((c) => c.level === 'warning');
  const sceneLocs = [...new Set(e.sceneIds.map((id) => sceneMap.get(id)?.locationId).filter((x): x is string => !!x))].map((id) => ctx.locations.get(id)?.name).filter(Boolean);
  const cast = castForScenes(e.sceneIds, ctx);
  const charById = new Map(data.characters.map((c) => [c.id, c]));
  const castIds = new Set(cast.map((c) => c.personId));
  const uncast = [...new Set(e.sceneIds.flatMap((id) => sceneMap.get(id)?.characterIds ?? []))].filter((cid) => !charById.get(cid)?.actorId).map((cid) => charById.get(cid)?.name);
  const meta = eventTypeMeta(e.type);
  const showScenes = e.type === 'filming' || e.type === 'rehearsal' || e.sceneIds.length > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={eventTitle(e, dayIndex)}
      description={`${meta.label} · ${formatDate(e.date)} · ${formatTime(e.startTime)}–${formatTime(endTime(e))}`}
      footer={
        <>
          <Button
            variant="danger-ghost"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              const ok = await remove('event', e.id, { confirmTitle: `Delete “${eventTitle(e, dayIndex)}”?`, confirmMessage: 'Scenes and people stay as they are. You can undo this right after.' });
              if (ok) onOpenChange(false);
            }}
          >
            Delete event
          </Button>
          <div className="flex gap-2">
            {e.type === 'filming' && (
              <Link to={`call-sheet/${e.id}`} className="btn btn-secondary">
                <ClipboardList className="size-4" /> Call sheet
              </Link>
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </>
      }
    >
      <div key={e.id} className="space-y-8">
        {conflicts.length > 0 ? (
          <div role="alert" className="rounded-md border border-danger/35 bg-danger-soft px-3.5 py-3">
            <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-danger">
              <AlertTriangle className="size-4" /> {conflicts.length} scheduling conflict{conflicts.length === 1 ? '' : 's'}
            </div>
            <ul className="space-y-1 text-[12.5px] text-danger">
              {conflicts.map((c, i) => (
                <li key={i}>
                  {c.text}
                  {c.personId && (
                    <Link to={`../people?person=${c.personId}`} className="ml-1.5 underline">
                      Availability
                    </Link>
                  )}
                  {c.locationId && (
                    <Link to={`../locations?location=${c.locationId}`} className="ml-1.5 underline">
                      Location
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[12.5px] text-success">
            <CheckCircle2 className="size-3.5" /> No conflicts with availability or other bookings.
          </p>
        )}
        {warnings.length > 0 && (
          <ul className="-mt-5 space-y-1 text-[12.5px] text-warning">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-center gap-2">
                <AlertTriangle className="size-3.5" /> {w.text}
              </li>
            ))}
          </ul>
        )}

        <Section title="When & where">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select value={e.type} onChange={(ev) => void save({ type: ev.target.value as EventType })}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <AutoText label="Title" value={e.title} onSave={(title) => save({ title })} placeholder={e.type === 'filming' ? `Filming · Day ${dayIndex.get(e.id) ?? ''}` : meta.label} optional />
            <AutoText label="Date" type="date" value={e.date} onSave={(date) => (isDateStr(date) ? save({ date }) : undefined)} required="Choose a date." />
            <Field label="Duration">
              <Select value={e.durationMin} onChange={(ev) => void save({ durationMin: Number(ev.target.value) })}>
                {[...new Set([...DURATION_OPTIONS, e.durationMin])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <AutoText label={e.type === 'filming' ? 'Shooting call' : 'Start time'} type="time" value={e.startTime} onSave={(startTime) => (TIME_RE.test(startTime) ? save({ startTime }) : undefined)} required="Enter a start time." />
            <AutoText label="Crew call" type="time" value={e.callTime} onSave={(callTime) => (TIME_RE.test(callTime) ? save({ callTime }) : undefined)} hint="When the crew should arrive." />
            <Field
              label="Location"
              className="sm:col-span-2"
              hint={!e.locationId && sceneLocs.length ? `The scheduled scenes are at ${sceneLocs.join(', ')} — used for conflicts and the call sheet.` : undefined}
            >
              <SinglePicker value={e.locationId} onChange={(locationId) => void save({ locationId })} options={locationOptions(data.locations)} placeholder="No location" noneLabel="No location" />
            </Field>
          </div>
        </Section>

        {showScenes && (
          <Section title="Scenes" description={scenesSummary(e.sceneIds, sceneMap)}>
            <MultiPicker value={e.sceneIds.filter((id) => sceneMap.has(id))} onChange={(sceneIds) => void save({ sceneIds })} options={sceneOptions(data.scenes, numbers)} placeholder="Add scene" emptyText="No scenes yet." />
            {e.sceneIds.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-md border border-line">
                {e.sceneIds.map((id) => sceneMap.get(id)).filter(Boolean).map((s) => (
                  <li key={s!.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                    <span className="w-6 font-mono text-[11px] text-faint">{numbers.get(s!.id)}</span>
                    <Link to={`../scenes?scene=${s!.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                      {s!.heading}
                    </Link>
                    <Link to={`../shots?scene=${s!.id}`} className="text-faint hover:text-ink">
                      Shots
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="People required" description="Cast comes from the characters in the scheduled scenes. Add crew and anyone else needed below.">
          {cast.length > 0 && (
            <ul className="mb-3 space-y-1 text-[13px]">
              {cast.map((c) => (
                <li key={c.personId} className="flex items-center gap-2">
                  <Link to={`../people?person=${c.personId}`} className="text-ink hover:text-accent">
                    {ctx.people.get(c.personId)?.name}
                  </Link>
                  <span className="text-faint">as {c.characterIds.map((id) => charById.get(id)?.name).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
          {uncast.length > 0 && <p className="mb-3 text-[12.5px] text-warning">Not cast yet: {uncast.join(', ')}</p>}
          <Field label="Crew & others">
            <MultiPicker
              value={e.personIds.filter((id) => ctx.people.has(id))}
              onChange={(personIds) => void save({ personIds })}
              options={personOptions(data.people.filter((p) => !castIds.has(p.id) || e.personIds.includes(p.id)))}
              placeholder="Add person"
              emptyText="Add people in Cast & Crew first."
            />
          </Field>
        </Section>

        <Section title="Equipment & notes">
          <div className="space-y-4">
            <AutoText label="Equipment" value={e.equipment} onSave={(equipment) => save({ equipment })} multiline rows={3} placeholder="Camera body, lenses, lights, sound kit, batteries…" />
            <AutoText label="Notes" value={e.notes} onSave={(notes) => save({ notes })} multiline rows={3} />
          </div>
        </Section>
      </div>
    </Sheet>
  );
}
