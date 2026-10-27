import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Circle, Copy, Images, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Comments } from '@/components/Comments';
import { characterOptions, sceneOptions } from '@/components/options';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { AssetImage, AutoText, Button, Field, Input, MultiPicker, Select, Sheet, SinglePicker, toast, toastError } from '@/components/ui';
import {
  CAMERA_ANGLES,
  CAMERA_MOVEMENTS,
  FRAME_RATES,
  FRAMING_SUGGESTIONS,
  SHOT_PRIORITIES,
  SHOT_STATUSES,
  SHOT_TYPES,
} from '@/lib/constants';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeFrame, makeShot } from '@/lib/data/factories';
import { formatDate, formatTime } from '@/lib/dates';
import { db } from '@/lib/db';
import { uid } from '@/lib/ids';
import type { Character, Person, Scene, ScheduleEvent, Shot, ShotPriority, ShotStatus, StoryboardFrame } from '@/lib/types';
import { setShotStatus } from './controls';
import { filmingDayFor } from './shotUtils';

export async function createFrameFromShot(shot: Shot) {
  const frames = await db.frames.where('sceneId').equals(shot.sceneId).toArray();
  const frame = makeFrame(shot.projectId, shot.sceneId, {
    order: frames.reduce((m, f) => Math.max(m, f.order), -1) + 1,
    shotType: shot.shotType,
    angle: shot.angle,
    movement: shot.movement,
    action: shot.description,
    notes: [shot.lens, shot.framing].filter(Boolean).join(' · '),
    shotId: shot.id,
  });
  await createRecord('frames', frame, { summary: `Created storyboard frame from shot${shot.code ? ` ${shot.code}` : ''}` });
  return frame;
}

export async function addShotToScene(projectId: string, sceneId: string, p: Partial<Shot> = {}) {
  const existing = await db.shots.where('sceneId').equals(sceneId).toArray();
  const shot = makeShot(projectId, sceneId, { order: existing.reduce((m, s) => Math.max(m, s.order), -1) + 1, ...p });
  await createRecord('shots', shot, { summary: 'Added a shot' });
  return shot;
}

function num(v: string): number | undefined {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : Math.round(n);
}

export function ShotEditor({
  shotId,
  onClose,
  scenes,
  numbers,
  codes,
  characters,
  people,
  filmingEvents,
  frames,
}: {
  shotId: string | null;
  onClose: () => void;
  scenes: Scene[];
  numbers: Map<string, string>;
  codes: Map<string, string>;
  characters: Character[];
  people: Person[];
  filmingEvents: ScheduleEvent[];
  frames: StoryboardFrame[];
}) {
  const shot = useLiveQuery(async () => (shotId ? (await db.shots.get(shotId)) ?? null : null), [shotId]);
  const remove = useDeleteEntity();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const open = !!shotId;
  const save = (patch: Partial<Shot>) => (shot ? updateRecord<Shot>('shots', shot.id, patch).catch((e) => toastError(e, 'Not saved')) : undefined);
  const scene = shot ? scenes.find((s) => s.id === shot.sceneId) : undefined;
  const linked = shot ? frames.filter((f) => f.shotId === shot.id) : [];
  const autoDay = shot ? filmingEvents.find((e) => e.sceneIds.includes(shot.sceneId)) : undefined;
  const currentDay = shot ? filmingDayFor(shot, filmingEvents) : undefined;

  const duplicate = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      const siblings = await db.shots.where('sceneId').equals(shot.sceneId).toArray();
      await db.transaction('rw', db.shots, async () => {
        for (const s of siblings) if (s.order > shot.order) await db.shots.update(s.id, { order: s.order + 1 });
      });
      const copy = makeShot(shot.projectId, shot.sceneId, {
        ...shot,
        id: uid(),
        code: '',
        order: shot.order + 1,
        status: 'planned',
        takes: 0,
        completedAt: undefined,
        continuity: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await createRecord('shots', copy, { summary: `Duplicated shot ${codes.get(shot.id) ?? ''}` });
      toast('Shot duplicated');
    } catch (e) {
      toastError(e, 'Couldn’t duplicate');
    } finally {
      setBusy(false);
    }
  };

  const addContinuity = async () => {
    if (!shot || !note.trim()) return;
    await save({ continuity: [...shot.continuity, { id: uid(), text: note.trim(), at: Date.now(), resolved: false }] });
    setNote('');
  };

  const moveToScene = async (sceneId: string | undefined) => {
    if (!shot || !sceneId || sceneId === shot.sceneId) return;
    const target = await db.shots.where('sceneId').equals(sceneId).toArray();
    await save({ sceneId, order: target.reduce((m, s) => Math.max(m, s.order), -1) + 1 });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={shot ? `Shot ${codes.get(shot.id) ?? ''}` : 'Shot'}
      description={scene ? `Scene ${numbers.get(scene.id)} · ${scene.heading}` : undefined}
      width="max-w-2xl"
      footer={
        shot ? (
          <>
            <Button
              variant="danger-ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await remove('shot', shot.id, { confirmTitle: `Delete shot ${codes.get(shot.id) ?? ''}?`, confirmMessage: 'Linked storyboard frames are kept and unlinked. You can undo this.' })) onClose();
              }}
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button icon={<Copy className="size-4" />} onClick={() => void duplicate()} loading={busy}>
                Duplicate
              </Button>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : undefined
      }
    >
      {shot === undefined && open && <p className="text-[13px] text-muted">Loading…</p>}
      {shot === null && open && <p className="text-[13px] text-muted">This shot was deleted.</p>}
      {shot && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Scene">
              <SinglePicker value={shot.sceneId} onChange={(v) => void moveToScene(v)} options={sceneOptions(scenes, numbers)} allowNone={false} />
            </Field>
            <AutoText label="Shot ID" value={shot.code} placeholder={codes.get(shot.id)} onSave={(v) => save({ code: v.trim() })} hint="Blank = automatic" />
          </div>

          <AutoText label="Description" multiline rows={3} value={shot.description} placeholder="What the camera sees, e.g. Mara slides the key across the counter." onSave={(v) => save({ description: v })} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Shot type">
              <Select value={shot.shotType} onChange={(e) => void save({ shotType: e.target.value as Shot['shotType'] })}>
                {SHOT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Camera angle">
              <Select value={shot.angle} onChange={(e) => void save({ angle: e.target.value as Shot['angle'] })}>
                {CAMERA_ANGLES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Movement">
              <Select value={shot.movement} onChange={(e) => void save({ movement: e.target.value as Shot['movement'] })}>
                {CAMERA_MOVEMENTS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <AutoText label="Camera / lens notes" value={shot.lens} placeholder="e.g. 35mm, f/2.8, A-cam" onSave={(v) => save({ lens: v })} />
            <FramingField value={shot.framing} onSave={(v) => save({ framing: v })} />
            <FrameRateField value={shot.frameRate} onSave={(v) => save({ frameRate: v })} />
            <AutoText label="Required equipment" value={shot.equipment} placeholder="e.g. Slider, 2× LED panels" onSave={(v) => save({ equipment: v })} />
          </div>

          <Field label="Actors involved" hint="Characters in this shot. Their actors appear on call sheets and the on-set list.">
            <MultiPicker
              value={shot.characterIds}
              onChange={(v) => void save({ characterIds: v })}
              options={characterOptions(characters, people)}
              placeholder="Add character"
              emptyText="No characters yet — add them in Characters"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <AutoText label="Setup (min)" type="number" value={shot.setupMin?.toString() ?? ''} onSave={(v) => save({ setupMin: num(v) })} />
            <AutoText label="Filming (min)" type="number" value={shot.filmMin?.toString() ?? ''} onSave={(v) => save({ filmMin: num(v) })} />
            <Field label="Priority">
              <Select value={shot.priority} onChange={(e) => void save({ priority: e.target.value as ShotPriority })}>
                {SHOT_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={shot.status} onChange={(e) => void setShotStatus(shot, e.target.value as ShotStatus)}>
                {SHOT_STATUSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field
              label="Filming day"
              hint={
                currentDay
                  ? `Currently ${formatDate(currentDay.date)}${currentDay.startTime ? ` · ${formatTime(currentDay.startTime)}` : ''}`
                  : filmingEvents.length
                    ? 'Not scheduled yet'
                    : 'No filming days yet — add them in Schedule'
              }
            >
              <Select value={shot.eventId ?? ''} onChange={(e) => void save({ eventId: e.target.value || undefined })}>
                <option value="">{autoDay ? `Follow scene (${formatDate(autoDay.date, 'EEE d MMM')})` : 'Follow scene’s filming day'}</option>
                {filmingEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {formatDate(e.date, 'EEE d MMM')} — {e.title || 'Filming day'}
                  </option>
                ))}
              </Select>
            </Field>
            <AutoText label="Takes" type="number" value={String(shot.takes ?? 0)} onSave={(v) => save({ takes: num(v) ?? 0 })} />
          </div>

          <AutoText label="Notes" multiline rows={3} value={shot.notes} placeholder="Blocking, lighting, sound…" onSave={(v) => save({ notes: v })} />

          <section className="space-y-2">
            <div className="eyebrow">Continuity</div>
            {shot.continuity.length === 0 && <p className="text-[12.5px] text-faint">No continuity issues flagged.</p>}
            <ul className="space-y-1.5">
              {shot.continuity.map((c) => (
                <li key={c.id} className="flex items-start gap-2 rounded-sm border border-line bg-surface px-2.5 py-2 text-[13px]">
                  <button
                    aria-label={c.resolved ? 'Mark unresolved' : 'Mark resolved'}
                    title={c.resolved ? 'Mark unresolved' : 'Mark resolved'}
                    onClick={() => void save({ continuity: shot.continuity.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)) })}
                    className={c.resolved ? 'text-success' : 'text-warning'}
                  >
                    {c.resolved ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                  </button>
                  <span className={c.resolved ? 'flex-1 text-faint line-through' : 'flex-1'}>{c.text}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-faint">{new Date(c.at).toLocaleDateString()}</span>
                  <button aria-label="Remove note" className="text-faint hover:text-danger" onClick={() => void save({ continuity: shot.continuity.filter((x) => x.id !== c.id) })}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Coffee cup is half full in the wide" onKeyDown={(e) => e.key === 'Enter' && void addContinuity()} />
              <Button onClick={() => void addContinuity()} disabled={!note.trim()} icon={<Plus className="size-4" />}>
                Flag
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Storyboard</div>
              <Link to={`../storyboard?scene=${shot.sceneId}`} className="text-[12px] text-accent hover:underline">
                Open storyboard
              </Link>
            </div>
            {linked.length ? (
              <div className="grid grid-cols-3 gap-2">
                {linked.map((f) => (
                  <Link key={f.id} to={`../storyboard?scene=${f.sceneId}`} className="group block overflow-hidden rounded-sm border border-line">
                    <div className="relative aspect-video bg-raised">
                      {f.imageAssetId ? <AssetImage assetId={f.imageAssetId} alt="Frame" className="absolute inset-0 size-full" /> : <span className="absolute inset-0 flex items-center justify-center text-[11px] text-faint">No image</span>}
                    </div>
                    <p className="truncate px-2 py-1 text-[11.5px] text-muted group-hover:text-ink">{f.action || 'Untitled frame'}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-faint">No storyboard frame is linked to this shot.</p>
            )}
            <Button
              size="sm"
              icon={<Images className="size-3.5" />}
              onClick={async () => {
                try {
                  await createFrameFromShot(shot);
                  toast('Storyboard frame created', { detail: 'It copies this shot’s camera setup and is linked to it.' });
                } catch (e) {
                  toastError(e, 'Couldn’t create the frame');
                }
              }}
            >
              Create storyboard frame from shot
            </Button>
          </section>

          <Comments projectId={shot.projectId} entityType="shot" entityId={shot.id} />
        </div>
      )}
    </Sheet>
  );
}

function FramingField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <div>
      <AutoText label="Framing" value={value} placeholder="e.g. Rule of thirds — subject left" onSave={onSave} />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {FRAMING_SUGGESTIONS.slice(0, 6).map((f) => (
          <button key={f} type="button" onClick={() => onSave(f)} className="rounded-xs border border-line px-1.5 py-0.5 text-[11px] text-faint hover:text-ink hover:border-line-strong">
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

function FrameRateField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const custom = value && !FRAME_RATES.includes(value);
  return (
    <Field label="Frame rate">
      <Select value={custom ? '__custom' : value} onChange={(e) => onSave(e.target.value === '__custom' ? value || '' : e.target.value)}>
        {FRAME_RATES.map((r) => (
          <option key={r} value={r}>
            {r} fps
          </option>
        ))}
        {custom && <option value="__custom">{value} fps</option>}
      </Select>
    </Field>
  );
}
