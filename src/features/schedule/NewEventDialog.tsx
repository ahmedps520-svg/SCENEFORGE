import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { locationOptions, sceneOptions } from '@/components/options';
import { Button, Dialog, Field, Input, MultiPicker, Select, SinglePicker, Textarea, toastError } from '@/components/ui';
import { EVENT_TYPES } from '@/lib/constants';
import { buildScheduleContext, findConflicts } from '@/lib/conflicts';
import { createRecord } from '@/lib/data/crud';
import { makeEvent } from '@/lib/data/factories';
import { isDateStr, minutesToTime, timeToMinutes } from '@/lib/dates';
import type { ProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import type { EventType, ScheduleEvent } from '@/lib/types';
import { DURATION_OPTIONS, durationLabel, scenesSummary } from './eventUtils';

export interface EventPrefill {
  date: string;
  type?: EventType;
  startTime?: string;
  sceneIds?: string[];
  locationId?: string;
  title?: string;
}

const DEFAULTS: Record<EventType, { start: string; duration: number }> = {
  filming: { start: '08:00', duration: 600 },
  rehearsal: { start: '18:00', duration: 120 },
  scouting: { start: '10:00', duration: 180 },
  equipment: { start: '16:00', duration: 90 },
  meeting: { start: '19:00', duration: 60 },
  editing: { start: '10:00', duration: 240 },
  deadline: { start: '17:00', duration: 15 },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function NewEventDialog({
  open,
  onOpenChange,
  prefill,
  data,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill: EventPrefill | null;
  data: ProjectData;
  onCreated: (e: ScheduleEvent) => void;
}) {
  const [type, setType] = useState<EventType>('filming');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [durationMin, setDurationMin] = useState(600);
  const [locationId, setLocationId] = useState<string | undefined>();
  const [sceneIds, setSceneIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !prefill) return;
    const t = prefill.type ?? 'filming';
    setType(t);
    setTitle(prefill.title ?? '');
    setDate(prefill.date);
    setStartTime(prefill.startTime ?? DEFAULTS[t].start);
    setDurationMin(DEFAULTS[t].duration);
    setLocationId(prefill.locationId);
    setSceneIds(prefill.sceneIds ?? []);
    setNotes('');
    setTouched(false);
  }, [open, prefill]);

  const numbers = useMemo(() => sceneNumbers(data.scenes), [data.scenes]);
  const sceneMap = useMemo(() => new Map(data.scenes.map((s) => [s.id, s])), [data.scenes]);
  const ctx = useMemo(() => buildScheduleContext(data), [data]);

  const dateError = !isDateStr(date) ? 'Choose a date.' : null;
  const timeError = !TIME_RE.test(startTime) ? 'Use a 24-hour time like 08:30.' : null;
  const valid = !dateError && !timeError && durationMin > 0;

  const draft = useMemo(
    () => (valid ? makeEvent(data.project.id, { type, title, date, startTime, durationMin, locationId, sceneIds, notes, callTime: minutesToTime(timeToMinutes(startTime) - 60) }) : null),
    [valid, data.project.id, type, title, date, startTime, durationMin, locationId, sceneIds, notes],
  );
  const conflicts = draft ? findConflicts([...data.events, draft], ctx).get(draft.id) ?? [] : [];

  const changeType = (t: EventType) => {
    setType(t);
    setStartTime(DEFAULTS[t].start);
    setDurationMin(DEFAULTS[t].duration);
  };

  const submit = async () => {
    setTouched(true);
    if (!draft) return;
    setBusy(true);
    try {
      const created = await createRecord('events', { ...draft, callTime: type === 'filming' ? draft.callTime : startTime });
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      toastError(e, 'Event not created');
    } finally {
      setBusy(false);
    }
  };

  const showScenes = type === 'filming' || type === 'rehearsal';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New schedule event"
      description="Filming days, rehearsals, scouting, prep, meetings, editing sessions and deadlines."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Add to schedule
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Type">
          <Select value={type} onChange={(e) => changeType(e.target.value as EventType)}>
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" optional>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'filming' ? 'Defaults to “Filming · Day N”' : EVENT_TYPES.find((t) => t.value === type)?.label} />
        </Field>
        <Field label="Date" error={touched ? dateError : null}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} invalid={touched && !!dateError} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" error={touched ? timeError : null}>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} invalid={touched && !!timeError} />
          </Field>
          <Field label="Duration">
            <Select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {durationLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Location" optional className="sm:col-span-2">
          <SinglePicker value={locationId} onChange={setLocationId} options={locationOptions(data.locations)} placeholder="No location" noneLabel="No location" />
        </Field>
        {showScenes && (
          <Field label="Scenes" hint={sceneIds.length ? scenesSummary(sceneIds, sceneMap) : 'Cast for these scenes is added automatically.'} className="sm:col-span-2">
            <MultiPicker value={sceneIds} onChange={setSceneIds} options={sceneOptions(data.scenes, numbers)} placeholder="Add scene" emptyText="No scenes yet." />
          </Field>
        )}
        <Field label="Notes" optional className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <div className="sm:col-span-2">
          {draft && conflicts.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-line bg-surface px-3 py-2 text-[12.5px]">
              {conflicts.map((c, i) => (
                <li key={i} className={c.level === 'error' ? 'flex items-start gap-2 text-danger' : 'flex items-start gap-2 text-warning'}>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {c.text}
                </li>
              ))}
            </ul>
          ) : draft && (sceneIds.length > 0 || locationId) ? (
            <p className="flex items-center gap-2 text-[12.5px] text-success">
              <CheckCircle2 className="size-3.5" /> No conflicts with cast availability, locations or other bookings.
            </p>
          ) : null}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
