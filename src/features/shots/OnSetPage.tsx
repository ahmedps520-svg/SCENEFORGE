import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  Clapperboard,
  Image as ImageIcon,
  MapPin,
  Minus,
  NotebookPen,
  Play,
  Plus,
  RotateCcw,
  Sun,
  SunDim,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AssetImage, Button, cn, Dialog, EmptyState, Loading, ProgressBar, Textarea, toast, toastError, toastUndo } from '@/components/ui';
import { angleLabel, movementLabel, shotTypeLabel } from '@/lib/constants';
import { updateRecord } from '@/lib/data/crud';
import { formatDate, formatTime, todayStr } from '@/lib/dates';
import { useCharacters, useEvents, useFrames, useLocations, usePeople, useProject, useScenes, useShots } from '@/lib/hooks';
import { uid } from '@/lib/ids';
import { sceneNumbers, shotCodes } from '@/lib/numbering';
import type { Shot, ShotStatus, StoryboardFrame } from '@/lib/types';
import { filmingDayFor, filmingEventsOf } from './shotUtils';

type Snapshot = Pick<Shot, 'status' | 'takes' | 'notes' | 'continuity' | 'completedAt'>;

const snap = (s: Shot): Snapshot => ({ status: s.status, takes: s.takes, notes: s.notes, continuity: s.continuity, completedAt: s.completedAt });

async function act(shot: Shot, code: string, patch: Partial<Shot>, label: string) {
  const before = snap(shot);
  try {
    await updateRecord<Shot>('shots', shot.id, patch, { summary: `On set: ${label.toLowerCase()} (shot ${code})` });
    toastUndo(`${label} — shot ${code}`, async () => {
      await updateRecord<Shot>('shots', shot.id, before, { summary: `On set: undid “${label.toLowerCase()}” (shot ${code})` });
    });
  } catch (e) {
    toastError(e, 'Not saved');
  }
}

const STATUS_STYLE: Record<ShotStatus, { bar: string; label: string; text: string }> = {
  planned: { bar: 'bg-line-strong', label: 'Planned', text: 'text-muted' },
  ready: { bar: 'bg-info', label: 'Ready', text: 'text-info' },
  filming: { bar: 'bg-live', label: 'Rolling', text: 'text-live' },
  completed: { bar: 'bg-success', label: 'Completed', text: 'text-success' },
  reshoot: { bar: 'bg-danger', label: 'Needs reshoot', text: 'text-danger' },
};

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (t: string, cb: () => void) => void };

function useWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [on, setOn] = useState(false);
  const lock = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!supported || !on) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = (await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock.request('screen')) as WakeLockSentinelLike;
        if (cancelled) {
          void l.release();
          return;
        }
        lock.current = l;
      } catch {
        setOn(false);
        toast.error('Couldn’t keep the screen awake', 'Your browser refused the request (battery saver can block it).');
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible' && on) void acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock.current?.release().catch(() => undefined);
      lock.current = null;
    };
  }, [on, supported]);

  return { supported, on, setOn };
}

export default function OnSetPage() {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const scenes = useScenes(projectId);
  const shots = useShots(projectId);
  const frames = useFrames(projectId);
  const events = useEvents(projectId);
  const characters = useCharacters(projectId);
  const people = usePeople(projectId);
  const locations = useLocations(projectId);
  const [params, setParams] = useSearchParams();
  const wake = useWakeLock();
  const [noteFor, setNoteFor] = useState<{ shot: Shot; kind: 'note' | 'continuity' } | null>(null);
  const [frameView, setFrameView] = useState<StoryboardFrame | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filming = useMemo(() => filmingEventsOf(events ?? []), [events]);
  const today = todayStr();
  const defaultDay = filming.find((e) => e.date === today) ?? filming.find((e) => e.date > today);
  const dayParam = params.get('day');
  const dayId = dayParam ?? defaultDay?.id ?? 'all';
  const day = filming.find((e) => e.id === dayId);

  const numbers = useMemo(() => sceneNumbers(scenes ?? []), [scenes]);
  const codes = useMemo(() => shotCodes(shots ?? [], numbers), [shots, numbers]);
  const sceneById = useMemo(() => new Map((scenes ?? []).map((s) => [s.id, s])), [scenes]);
  const charById = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters]);
  const personById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const frameByShot = useMemo(() => {
    const m = new Map<string, StoryboardFrame>();
    for (const f of frames ?? []) if (f.shotId && !m.has(f.shotId)) m.set(f.shotId, f);
    return m;
  }, [frames]);

  const visible = useMemo(() => {
    const list = (shots ?? []).filter((s) => (dayId === 'all' ? true : filmingDayFor(s, filming)?.id === dayId));
    const po = (id: string) => sceneById.get(id)?.productionOrder ?? 0;
    return list.sort((a, b) => po(a.sceneId) - po(b.sceneId) || a.order - b.order);
  }, [shots, dayId, filming, sceneById]);

  const groups = useMemo(() => {
    const g: { sceneId: string; shots: Shot[] }[] = [];
    for (const s of visible) {
      const last = g[g.length - 1];
      if (last && last.sceneId === s.sceneId) last.shots.push(s);
      else g.push({ sceneId: s.sceneId, shots: [s] });
    }
    return g;
  }, [visible]);

  const next = visible.find((s) => s.status === 'filming') ?? visible.find((s) => s.status !== 'completed');
  const done = visible.filter((s) => s.status === 'completed').length;

  useEffect(() => {
    document.title = project ? `On set · ${project.title}` : 'On set';
    return () => {
      document.title = 'SCENEFORGE';
    };
  }, [project]);

  if (project === undefined || !scenes || !shots || !frames || !events || !characters || !people || !locations) {
    return <Loading label="Preparing the set" className="min-h-dvh" />;
  }
  if (project === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="display text-[34px]">Project not found</h1>
        <Link to="/" className="btn btn-primary mt-6">
          Back to the studio
        </Link>
      </div>
    );
  }

  const location = day?.locationId ? locations.find((l) => l.id === day.locationId) : undefined;
  const actorsOf = (s: Shot) =>
    s.characterIds
      .map((id) => charById.get(id))
      .filter(Boolean)
      .map((c) => (c!.actorId && personById.get(c!.actorId) ? `${c!.name} · ${personById.get(c!.actorId)!.name}` : c!.name));

  const chooseDay = (v: string) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('day', v);
    setParams(nextParams, { replace: true });
    setExpanded(null);
  };

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5">
          <Link to={`/p/${project.id}/shots`} className="btn btn-ghost h-11 px-2.5 text-[14px]" aria-label="Exit on-set mode">
            <ChevronLeft className="size-5" /> Exit
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className={cn('size-2 rounded-full', next?.status === 'filming' ? 'bg-live animate-pulse-live' : 'bg-faint')} />
              <span className="font-mono text-[11px] font-semibold tracking-[0.24em]">ON SET</span>
            </div>
            <div className="truncate text-[12px] text-muted">{project.title}</div>
          </div>
          {wake.supported ? (
            <button
              onClick={() => wake.setOn(!wake.on)}
              aria-pressed={wake.on}
              className={cn('btn h-11 px-3 text-[13px]', wake.on ? 'btn-primary' : 'btn-secondary')}
              title="Keep the screen on while filming"
            >
              {wake.on ? <Sun className="size-4" /> : <SunDim className="size-4" />}
              <span className="hidden sm:inline">{wake.on ? 'Screen on' : 'Keep awake'}</span>
            </button>
          ) : (
            <span className="w-[72px]" />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 pb-24 pt-4 sm:px-5">
        <label className="block">
          <span className="eyebrow">Filming day</span>
          <div className="relative mt-1.5">
            <select
              value={dayId}
              onChange={(e) => chooseDay(e.target.value)}
              className="h-12 w-full appearance-none rounded-md border border-line-strong bg-surface pl-3.5 pr-10 text-[16px] text-ink focus:border-accent focus:outline-none"
            >
              {filming.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatDate(e.date, 'EEE d MMM')}
                  {e.date === today ? ' (today)' : ''} — {e.title || 'Filming day'}
                </option>
              ))}
              <option value="all">All shots, by scene</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          </div>
        </label>

        <section className="mt-5">
          {day ? (
            <>
              <h1 className="display text-[34px] leading-none sm:text-[42px]">{formatDate(day.date, 'EEEE d MMMM')}</h1>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-muted">
                {day.callTime && (
                  <span>
                    Call <span className="font-mono text-ink">{formatTime(day.callTime)}</span>
                  </span>
                )}
                {day.startTime && (
                  <span>
                    Shoot <span className="font-mono text-ink">{formatTime(day.startTime)}</span>
                  </span>
                )}
                {location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    <span className="text-ink">{location.name}</span>
                    {location.address && <span className="text-faint">· {location.address}</span>}
                  </span>
                )}
              </div>
            </>
          ) : (
            <h1 className="display text-[34px] leading-none sm:text-[42px]">All shots</h1>
          )}
          {visible.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between font-mono text-[12px]">
                <span className="text-muted">Progress</span>
                <span>
                  <span className="text-success">{done}</span> / {visible.length} shots
                </span>
              </div>
              <ProgressBar value={visible.length ? done / visible.length : 0} tone="success" className="h-1.5" label="Shots completed today" />
            </div>
          )}
        </section>

        {!shots.length ? (
          <EmptyState
            icon={<Clapperboard className="size-6" />}
            title="No shots planned"
            actions={
              <Link to={`/p/${project.id}/shots`} className="btn btn-primary">
                Plan shots
              </Link>
            }
          >
            Add shots to the shot list first; they’ll appear here for the crew to tick off.
          </EmptyState>
        ) : !visible.length ? (
          <EmptyState
            compact
            icon={<Clapperboard className="size-5" />}
            title="Nothing scheduled for this day"
            actions={
              <Button onClick={() => chooseDay('all')} size="lg">
                Show all shots
              </Button>
            }
          >
            Assign shots or scenes to this filming day from the shot list or schedule.
          </EmptyState>
        ) : (
          <>
            {next ? (
              <section className="mt-6" aria-label="Next up">
                <div className="eyebrow mb-2 text-accent">{next.status === 'filming' ? 'Rolling now' : 'Next up'}</div>
                <ShotCard
                  shot={next}
                  code={codes.get(next.id) ?? ''}
                  sceneLabel={`Scene ${numbers.get(next.sceneId) ?? '?'} · ${sceneById.get(next.sceneId)?.heading ?? ''}`}
                  actors={actorsOf(next)}
                  frame={frameByShot.get(next.id)}
                  focus
                  expanded
                  onToggle={() => undefined}
                  onNote={(kind) => setNoteFor({ shot: next, kind })}
                  onFrame={(f) => setFrameView(f)}
                />
              </section>
            ) : (
              <div className="mt-6 rounded-md border border-[color-mix(in_srgb,var(--c-success)_40%,transparent)] bg-success-soft px-4 py-5 text-center">
                <Check className="mx-auto size-7 text-success" />
                <p className="mt-2 display text-[26px]">That’s a wrap</p>
                <p className="text-[14px] text-muted">Every shot on this list is completed.</p>
              </div>
            )}

            <div className="mt-8 space-y-7">
              {groups.map((g) => {
                const scene = sceneById.get(g.sceneId);
                return (
                  <section key={g.sceneId}>
                    <div className="mb-2 border-b border-line pb-1.5">
                      <div className="slate">Scene {numbers.get(g.sceneId) ?? '?'}</div>
                      <h2 className="text-[16px] font-medium">{scene?.heading || 'Untitled scene'}</h2>
                    </div>
                    <div className="space-y-2">
                      {g.shots.map((s) => (
                        <ShotCard
                          key={s.id}
                          shot={s}
                          code={codes.get(s.id) ?? ''}
                          actors={actorsOf(s)}
                          frame={frameByShot.get(s.id)}
                          expanded={expanded === s.id}
                          onToggle={() => setExpanded((cur) => (cur === s.id ? null : s.id))}
                          onNote={(kind) => setNoteFor({ shot: s, kind })}
                          onFrame={(f) => setFrameView(f)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>

      <NoteDialog
        target={noteFor}
        code={noteFor ? codes.get(noteFor.shot.id) ?? '' : ''}
        onClose={() => setNoteFor(null)}
      />

      <Dialog open={!!frameView} onOpenChange={(o) => !o && setFrameView(null)} title={frameView ? `Storyboard · ${frameView.action || 'Frame'}` : ''} size="xl">
        {frameView && (
          <div>
            {frameView.imageAssetId ? (
              <AssetImage assetId={frameView.imageAssetId} variant="full" alt="Storyboard frame" fit="contain" className="max-h-[70dvh] w-full rounded-sm bg-black" />
            ) : (
              <p className="py-10 text-center text-muted">This frame has no image yet.</p>
            )}
            <div className="mt-3 grid gap-2 text-[14px] sm:grid-cols-3">
              <span>
                <span className="eyebrow block">Shot</span>
                {shotTypeLabel(frameView.shotType)}
              </span>
              <span>
                <span className="eyebrow block">Angle</span>
                {angleLabel(frameView.angle)}
              </span>
              <span>
                <span className="eyebrow block">Movement</span>
                {movementLabel(frameView.movement)}
              </span>
            </div>
            {frameView.audio && <p className="mt-3 text-[14px] text-muted">Audio: {frameView.audio}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function ShotCard({
  shot,
  code,
  sceneLabel,
  actors,
  frame,
  focus,
  expanded,
  onToggle,
  onNote,
  onFrame,
}: {
  shot: Shot;
  code: string;
  sceneLabel?: string;
  actors: string[];
  frame?: StoryboardFrame;
  focus?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNote: (kind: 'note' | 'continuity') => void;
  onFrame: (f: StoryboardFrame) => void;
}) {
  const st = STATUS_STYLE[shot.status];
  const openIssues = shot.continuity.filter((c) => !c.resolved).length;
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-md border bg-surface',
        focus ? 'border-line-strong shadow-soft' : 'border-line',
        shot.status === 'filming' && 'border-[color-mix(in_srgb,var(--c-live)_55%,transparent)]',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', st.bar)} aria-hidden />
      <button type="button" onClick={onToggle} disabled={focus} className="flex w-full items-start gap-3 py-3 pl-4 pr-3 text-left disabled:cursor-default" aria-expanded={expanded}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className={cn('font-mono font-semibold', focus ? 'text-[26px]' : 'text-[18px]', shot.status === 'completed' && 'text-muted line-through')}>{code}</span>
            <span className={cn('font-mono text-[11px] font-semibold uppercase tracking-[0.12em]', st.text)}>
              {shot.status === 'filming' && <span className="mr-1.5 inline-block size-2 rounded-full bg-live animate-pulse-live align-middle" />}
              {st.label}
            </span>
            {openIssues > 0 && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-warning">
                <AlertTriangle className="size-3.5" /> {openIssues} continuity
              </span>
            )}
          </div>
          {sceneLabel && <p className="mt-0.5 truncate text-[12.5px] text-faint">{sceneLabel}</p>}
          <p className={cn('mt-1 text-ink', focus ? 'text-[18px] leading-snug' : 'text-[15px]', !shot.description && 'italic text-faint')}>{shot.description || 'No description'}</p>
          <p className="mt-1 text-[13.5px] text-muted">
            {shotTypeLabel(shot.shotType)} · {angleLabel(shot.angle)} · {movementLabel(shot.movement)}
            {shot.lens && ` · ${shot.lens}`}
          </p>
          {actors.length > 0 && <p className="mt-0.5 text-[13px] text-muted">{actors.join(', ')}</p>}
        </div>
        {frame?.imageAssetId && !focus && <AssetImage assetId={frame.imageAssetId} alt="" className="h-14 w-24 shrink-0 rounded-xs border border-line" />}
        {!focus && <ChevronDown className={cn('mt-1 size-5 shrink-0 text-faint transition-transform', expanded && 'rotate-180')} />}
      </button>

      {expanded && (
        <div className="border-t border-line px-3 pb-3 pt-3 pl-4">
          {focus && frame?.imageAssetId && (
            <button onClick={() => onFrame(frame)} className="mb-3 block w-full overflow-hidden rounded-sm border border-line" aria-label="View storyboard frame">
              <AssetImage assetId={frame.imageAssetId} variant="full" alt="Storyboard frame" className="aspect-video w-full" />
            </button>
          )}
          {(shot.framing || shot.equipment || shot.frameRate) && (
            <p className="mb-3 text-[13px] text-muted">
              {[shot.framing, shot.equipment, shot.frameRate && `${shot.frameRate} fps`].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <BigAction
              tone="live"
              active={shot.status === 'filming'}
              icon={<Play className="size-5" />}
              label={shot.status === 'filming' ? 'Rolling' : 'Roll'}
              onClick={() => shot.status !== 'filming' && void act(shot, code, { status: 'filming', completedAt: undefined }, 'Started filming')}
            />
            <BigAction
              tone="success"
              active={shot.status === 'completed'}
              icon={<Check className="size-5" />}
              label="Completed"
              onClick={() =>
                shot.status !== 'completed' && void act(shot, code, { status: 'completed', completedAt: Date.now(), takes: Math.max(shot.takes, 1) }, 'Marked completed')
              }
            />
            <BigAction
              tone="danger"
              active={shot.status === 'reshoot'}
              icon={<RotateCcw className="size-5" />}
              label="Reshoot"
              onClick={() => shot.status !== 'reshoot' && void act(shot, code, { status: 'reshoot', completedAt: undefined }, 'Flagged for reshoot')}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex h-12 w-full items-center justify-between rounded-md border border-line-strong sm:w-auto">
              <button
                className="flex h-full w-12 items-center justify-center text-muted hover:text-ink disabled:opacity-30"
                aria-label="One fewer take"
                disabled={shot.takes <= 0}
                onClick={() => void updateRecord<Shot>('shots', shot.id, { takes: Math.max(0, shot.takes - 1) }, { silent: true }).catch((e) => toastError(e, 'Not saved'))}
              >
                <Minus className="size-5" />
              </button>
              <span className="min-w-[72px] text-center">
                <span className="block font-mono text-[18px] leading-none">{shot.takes}</span>
                <span className="eyebrow text-[9px]">takes</span>
              </span>
              <button
                className="flex h-full w-12 items-center justify-center text-muted hover:text-ink"
                aria-label="One more take"
                onClick={() => void updateRecord<Shot>('shots', shot.id, { takes: shot.takes + 1 }, { silent: true }).catch((e) => toastError(e, 'Not saved'))}
              >
                <Plus className="size-5" />
              </button>
            </div>
            <button onClick={() => onNote('note')} className="btn btn-secondary h-12 flex-1 text-[14px]">
              <NotebookPen className="size-4" /> Note
            </button>
            <button onClick={() => onNote('continuity')} className="btn btn-secondary h-12 flex-1 text-[14px]">
              <AlertTriangle className="size-4 text-warning" /> Continuity
            </button>
            {frame && !focus && (
              <button onClick={() => onFrame(frame)} className="btn btn-secondary h-12 w-12 px-0" aria-label="View storyboard frame">
                <ImageIcon className="size-5" />
              </button>
            )}
          </div>
          {shot.notes && <pre className="mt-3 whitespace-pre-wrap rounded-sm bg-raised px-3 py-2 font-sans text-[13px] text-muted">{shot.notes}</pre>}
          {shot.continuity.length > 0 && (
            <ul className="mt-2 space-y-1">
              {shot.continuity.map((c) => (
                <li key={c.id} className={cn('flex items-start gap-2 text-[13px]', c.resolved ? 'text-faint line-through' : 'text-warning')}>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {c.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function BigAction({ tone, active, icon, label, onClick }: { tone: 'live' | 'success' | 'danger'; active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  const styles = {
    live: active ? 'bg-live text-white border-live' : 'border-[color-mix(in_srgb,var(--c-live)_45%,transparent)] text-live hover:bg-danger-soft',
    success: active ? 'bg-success text-white border-success' : 'border-[color-mix(in_srgb,var(--c-success)_45%,transparent)] text-success hover:bg-success-soft',
    danger: active ? 'bg-danger text-white border-danger' : 'border-[color-mix(in_srgb,var(--c-danger)_45%,transparent)] text-danger hover:bg-danger-soft',
  };
  return (
    <button onClick={onClick} aria-pressed={active} className={cn('flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-[13px] font-semibold transition-colors active:scale-[0.98]', styles[tone])}>
      {icon}
      {label}
    </button>
  );
}

function NoteDialog({ target, code, onClose }: { target: { shot: Shot; kind: 'note' | 'continuity' } | null; code: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(''), [target]);
  const save = async () => {
    if (!target || !text.trim()) return;
    setBusy(true);
    const { shot, kind } = target;
    if (kind === 'note') {
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const line = `[${stamp}] ${text.trim()}`;
      await act(shot, code, { notes: shot.notes ? `${shot.notes}\n${line}` : line }, 'Added a note');
    } else {
      await act(shot, code, { continuity: [...shot.continuity, { id: uid(), text: text.trim(), at: Date.now(), resolved: false }] }, 'Flagged a continuity issue');
    }
    setBusy(false);
    onClose();
  };
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={target?.kind === 'continuity' ? `Continuity issue · ${code}` : `Note · ${code}`}
      description={target?.kind === 'continuity' ? 'Describe what doesn’t match between takes or shots.' : 'Added to the shot’s notes with the current time.'}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={() => void save()} disabled={!text.trim()} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
        className="text-[16px]"
        placeholder={target?.kind === 'continuity' ? 'e.g. Glass was in her left hand in the wide' : 'e.g. Take 3 is the keeper — focus buzz on take 2'}
      />
    </Dialog>
  );
}
