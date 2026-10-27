import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Camera,
  CalendarDays,
  Clapperboard,
  Download,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Images,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { sceneOptions } from '@/components/options';
import {
  Button,
  Checkbox,
  cn,
  Dialog,
  EmptyState,
  Field,
  Input,
  Loading,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  PageContainer,
  PageHeader,
  Segmented,
  Select,
  SinglePicker,
  Tip,
  toast,
  toastError,
  toastUndo,
  useConfirm,
} from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { angleLabel, movementLabel, SHOT_PRIORITIES, SHOT_STATUSES, SHOT_TYPES, shotTypeAbbr, shotTypeLabel } from '@/lib/constants';
import { logActivity, touchProject, updateRecord } from '@/lib/data/crud';
import { deleteEntity } from '@/lib/data/deletes';
import { formatDate, formatMinutes, formatTime } from '@/lib/dates';
import { db } from '@/lib/db';
import { slug, toCsv, downloadText } from '@/lib/download';
import { useCharacters, useEvents, useFrames, useLocations, usePeople, useScenes, useShots } from '@/lib/hooks';
import { sceneNumbers, shotCodes } from '@/lib/numbering';
import { exportShotListPdf, type ShotPdfGroup } from '@/lib/pdf/shotlist';
import type { Character, Scene, Shot, ShotPriority, ShotStatus, ShotType, StoryboardFrame } from '@/lib/types';
import { FrameThumb, setShotStatus, ShotPrioritySelect, ShotStatusSelect } from './controls';
import { addShotToScene, createFrameFromShot, ShotEditor } from './ShotEditor';
import { filmingDayFor, filmingEventsOf, groupShots, groupTotals, reorderedIds, type ShotGroup } from './shotUtils';

type GroupMode = 'scene' | 'day';
const GROUP_KEY = 'sceneforge:shots-group';

const TABLE_COLS = 'grid-cols-[20px_14px_48px_44px_minmax(170px,2.2fr)_minmax(120px,1.1fr)_minmax(100px,1fr)_minmax(80px,0.8fr)_minmax(90px,1fr)_60px_96px_112px_28px]';

export default function ShotListPage() {
  const { project } = useWorkspace();
  const pid = project.id;
  const scenes = useScenes(pid);
  const shots = useShots(pid);
  const frames = useFrames(pid);
  const characters = useCharacters(pid);
  const people = usePeople(pid);
  const events = useEvents(pid);
  const locations = useLocations(pid);
  const [params, setParams] = useSearchParams();
  const confirm = useConfirm();
  const remove = useDeleteEntity();

  const [mode, setMode] = useState<GroupMode>(() => {
    try {
      return (localStorage.getItem(GROUP_KEY) as GroupMode) || 'scene';
    } catch {
      return 'scene';
    }
  });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ShotStatus | 'all'>('all');
  const [priority, setPriority] = useState<ShotPriority | 'all'>('all');
  const [day, setDay] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const sceneFilter = params.get('scene') ?? '';
  const editingId = params.get('shot');

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const changeMode = (m: GroupMode) => {
    setMode(m);
    try {
      localStorage.setItem(GROUP_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const loaded = scenes && shots && frames && characters && people && events && locations;

  const numbers = useMemo(() => sceneNumbers(scenes ?? []), [scenes]);
  const codes = useMemo(() => shotCodes(shots ?? [], numbers), [shots, numbers]);
  const filmingEvents = useMemo(() => filmingEventsOf(events ?? []), [events]);
  const sceneById = useMemo(() => new Map((scenes ?? []).map((s) => [s.id, s])), [scenes]);
  const charById = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters]);
  const personById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const locationById = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations]);
  const frameByShot = useMemo(() => {
    const m = new Map<string, StoryboardFrame>();
    for (const f of frames ?? []) if (f.shotId && !m.has(f.shotId)) m.set(f.shotId, f);
    return m;
  }, [frames]);

  const actorsOf = (s: Shot) =>
    s.characterIds
      .map((id) => charById.get(id))
      .filter((c): c is Character => !!c)
      .map((c) => {
        const actor = c.actorId ? personById.get(c.actorId) : undefined;
        return actor ? `${c.name} (${actor.name})` : c.name;
      });

  const filtersActive = status !== 'all' || priority !== 'all' || day !== 'all' || !!q.trim() || !!sceneFilter;

  const filtered = useMemo(() => {
    if (!shots) return [];
    const s = q.trim().toLowerCase();
    return shots.filter((shot) => {
      if (status !== 'all' && shot.status !== status) return false;
      if (priority !== 'all' && shot.priority !== priority) return false;
      if (sceneFilter && shot.sceneId !== sceneFilter) return false;
      if (day !== 'all') {
        const d = filmingDayFor(shot, filmingEvents);
        if (day === 'unscheduled' ? !!d : d?.id !== day) return false;
      }
      if (s) {
        const hay = [codes.get(shot.id), shot.description, shot.lens, shot.framing, shot.equipment, shot.notes, shotTypeLabel(shot.shotType), sceneById.get(shot.sceneId)?.heading, ...actorsOf(shot)]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [shots, status, priority, sceneFilter, day, q, filmingEvents, codes, sceneById]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupShots(filtered, mode, scenes ?? [], filmingEvents), [filtered, mode, scenes, filmingEvents]);
  const totals = groupTotals(filtered);
  const canReorder = mode === 'scene' && status === 'all' && priority === 'all' && day === 'all' && !q.trim();

  // Deep link: scroll to a scene's group.
  useEffect(() => {
    if (!sceneFilter || !loaded) return;
    const el = document.getElementById(`group-scene:${sceneFilter}`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [sceneFilter, loaded]);

  // Drop selections that no longer exist.
  useEffect(() => {
    if (!shots) return;
    const ids = new Set(shots.map((s) => s.id));
    setSelected((cur) => {
      const next = new Set([...cur].filter((id) => ids.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [shots]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id || !shots) return;
    const active = shots.find((s) => s.id === e.active.id);
    const over = shots.find((s) => s.id === e.over!.id);
    if (!active || !over || active.sceneId !== over.sceneId) return;
    const ids = shots.filter((s) => s.sceneId === active.sceneId).sort((a, b) => a.order - b.order).map((s) => s.id);
    const next = reorderedIds(ids, active.id, over.id);
    try {
      const t = Date.now();
      await db.transaction('rw', db.shots, async () => {
        for (let i = 0; i < next.length; i++) await db.shots.update(next[i], { order: i, updatedAt: t });
      });
      await touchProject(pid);
      await logActivity({ projectId: pid, action: 'updated', entityType: 'scene', entityId: active.sceneId, summary: `Reordered shots in scene ${numbers.get(active.sceneId) ?? ''}` });
    } catch (err) {
      toastError(err, 'Order not saved');
    }
  };

  const toggle = (id: string, on?: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const bulkStatus = async (s: ShotStatus) => {
    const list = (shots ?? []).filter((x) => selected.has(x.id));
    for (const shot of list) await setShotStatus(shot, s);
    toast(`${list.length} shot${list.length === 1 ? '' : 's'} marked ${SHOT_STATUSES.find((x) => x.value === s)?.label.toLowerCase()}`);
  };

  const bulkDay = async (eventId: string | undefined) => {
    try {
      for (const id of selected) await updateRecord<Shot>('shots', id, { eventId }, { silent: true });
      await logActivity({ projectId: pid, action: 'updated', entityType: 'shot', entityId: [...selected][0], summary: `Assigned ${selected.size} shots to ${eventId ? formatDate(filmingEvents.find((e) => e.id === eventId)?.date) : 'their scenes’ filming days'}` });
      toast(eventId ? 'Shots assigned to filming day' : 'Shots now follow their scene’s filming day');
    } catch (e) {
      toastError(e, 'Couldn’t assign');
    }
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: `Delete ${ids.length} shot${ids.length === 1 ? '' : 's'}?`,
      message: 'Linked storyboard frames are kept and unlinked. You can undo this right after.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const restores: (() => Promise<void>)[] = [];
    try {
      for (const id of ids) restores.push((await deleteEntity('shot', id)).restore);
      setSelected(new Set());
      toastUndo(`Deleted ${ids.length} shot${ids.length === 1 ? '' : 's'}`, async () => {
        for (const r of restores.reverse()) await r();
      });
    } catch (e) {
      toastError(e, 'Couldn’t delete all shots');
    }
  };

  const rowsForExport = (g: ShotGroup) =>
    g.shots.map((s) => ({
      code: codes.get(s.id) ?? '',
      description: s.description,
      type: shotTypeLabel(s.shotType),
      angle: angleLabel(s.angle),
      movement: movementLabel(s.movement),
      lens: [s.lens, s.framing].filter(Boolean).join(' · '),
      frameRate: s.frameRate,
      actors: actorsOf(s).join(', '),
      setup: s.setupMin ? `${s.setupMin}m` : '',
      film: s.filmMin ? `${s.filmMin}m` : '',
      priority: SHOT_PRIORITIES.find((p) => p.value === s.priority)?.label ?? '',
      status: SHOT_STATUSES.find((p) => p.value === s.status)?.label ?? '',
      done: s.status === 'completed',
    }));

  const groupTitle = (g: ShotGroup) => {
    if (g.kind === 'scene') {
      const s = sceneById.get(g.sceneId!);
      return `Scene ${numbers.get(g.sceneId!) ?? '?'} — ${s?.heading || 'Untitled scene'}`;
    }
    if (g.kind === 'day') return `${formatDate(g.event!.date)} — ${g.event!.title || 'Filming day'}`;
    return 'Unscheduled';
  };

  const exportPdf = () => {
    try {
      const pdfGroups: ShotPdfGroup[] = groups.map((g) => {
        const t = groupTotals(g.shots);
        return { title: groupTitle(g), meta: `${t.count} shots · ${t.completed} done · ${formatMinutes(t.minutes)}`, rows: rowsForExport(g) };
      });
      exportShotListPdf({
        projectTitle: project.title,
        subtitle: `${mode === 'scene' ? 'Grouped by scene' : 'Grouped by filming day'}${filtersActive ? ' · filtered view' : ''}`,
        groups: pdfGroups,
        filename: `${slug(project.title)}-shot-list`,
      });
    } catch (e) {
      toastError(e, 'PDF export failed');
    }
  };

  const exportCsv = () => {
    const rows: unknown[][] = [
      ['Group', 'Shot', 'Scene', 'Description', 'Shot type', 'Angle', 'Movement', 'Camera / lens', 'Framing', 'Frame rate', 'Equipment', 'Actors', 'Setup (min)', 'Filming (min)', 'Priority', 'Status', 'Takes', 'Notes'],
    ];
    for (const g of groups) {
      for (const s of g.shots) {
        rows.push([
          groupTitle(g),
          codes.get(s.id),
          numbers.get(s.sceneId),
          s.description,
          shotTypeLabel(s.shotType),
          angleLabel(s.angle),
          movementLabel(s.movement),
          s.lens,
          s.framing,
          s.frameRate,
          s.equipment,
          actorsOf(s).join('; '),
          s.setupMin ?? '',
          s.filmMin ?? '',
          SHOT_PRIORITIES.find((p) => p.value === s.priority)?.label,
          SHOT_STATUSES.find((p) => p.value === s.status)?.label,
          s.takes,
          s.notes,
        ]);
      }
    }
    downloadText(toCsv(rows), `${slug(project.title)}-shot-list.csv`, 'text/csv;charset=utf-8');
  };

  if (!loaded) return <Loading label="Loading shot list" />;

  const clearFilters = () => {
    setStatus('all');
    setPriority('all');
    setDay('all');
    setQ('');
    setParam('scene', null);
  };

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Production"
        title="Shot List"
        description="Every camera setup, connected to its scene and storyboard. Group by filming day to plan each shoot."
        actions={
          <>
            <Link to={`/p/${pid}/on-set`} className="btn btn-secondary">
              <Radio className="size-4 text-live" /> On-set mode
            </Link>
            <Menu
              trigger={
                <Button icon={<Download className="size-4" />} disabled={!shots.length}>
                  Export
                </Button>
              }
            >
              <MenuLabel>Exports what’s shown</MenuLabel>
              <MenuItem icon={<FileText className="size-4" />} onSelect={exportPdf}>
                PDF shot list
              </MenuItem>
              <MenuItem icon={<FileSpreadsheet className="size-4" />} onSelect={exportCsv}>
                CSV spreadsheet
              </MenuItem>
            </Menu>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)} disabled={!scenes.length}>
              Add shot
            </Button>
          </>
        }
      />

      <Tip id="shots-intro" className="mb-5">
        Shots are your camera setups. Group by filming day to plan each shoot, then open <strong className="text-ink">On-set mode</strong> on a phone to tick them off while you film.
      </Tip>

      {!scenes.length ? (
        <EmptyState
          icon={<Clapperboard className="size-6" />}
          title="Shots belong to scenes"
          actions={
            <>
              <Link to="../script" className="btn btn-primary">
                Write the script
              </Link>
              <Link to="../scenes" className="btn btn-secondary">
                Add scenes
              </Link>
            </>
          }
        >
          Write scene headings in the script or add scenes in the scene manager, then plan the camera setups for each one here.
        </EmptyState>
      ) : !shots.length ? (
        <EmptyState
          icon={<Camera className="size-6" />}
          title="No shots planned yet"
          actions={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Plan the first shot
            </Button>
          }
        >
          Break each scene into shots — wide, coverage, inserts — with lens notes, equipment and timings. You can also turn storyboard frames into shots.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented
              label="Group shots by"
              value={mode}
              onChange={changeMode}
              options={[
                { value: 'scene', label: 'By scene', icon: <Clapperboard className="size-3.5" /> },
                { value: 'day', label: 'By filming day', icon: <CalendarDays className="size-3.5" /> },
              ]}
            />
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shots…" className="h-8 pl-8" aria-label="Search shots" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ShotStatus | 'all')} className="h-8 w-auto text-[12.5px]" aria-label="Filter by status">
              <option value="all">All statuses</option>
              {SHOT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as ShotPriority | 'all')} className="h-8 w-auto text-[12.5px]" aria-label="Filter by priority">
              <option value="all">All priorities</option>
              {SHOT_PRIORITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select value={sceneFilter} onChange={(e) => setParam('scene', e.target.value || null)} className="h-8 w-auto max-w-[220px] text-[12.5px]" aria-label="Filter by scene">
              <option value="">All scenes</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {numbers.get(s.id)}. {s.heading || 'Untitled scene'}
                </option>
              ))}
            </Select>
            <Select value={day} onChange={(e) => setDay(e.target.value)} className="h-8 w-auto max-w-[220px] text-[12.5px]" aria-label="Filter by filming day">
              <option value="all">All filming days</option>
              {filmingEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatDate(e.date, 'EEE d MMM')} — {e.title || 'Filming day'}
                </option>
              ))}
              <option value="unscheduled">Unscheduled</option>
            </Select>
            {filtersActive && (
              <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>

          <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11.5px] text-muted">
            <span>
              <span className="text-ink">{totals.count}</span> shots{filtersActive ? ` of ${shots.length}` : ''}
            </span>
            <span>
              <span className="text-success">{totals.completed}</span> completed
            </span>
            <span>
              <span className="text-ink">{formatMinutes(totals.minutes)}</span> setup + filming
            </span>
            {filtered.some((s) => s.status === 'reshoot') && (
              <span className="text-danger">{filtered.filter((s) => s.status === 'reshoot').length} need reshoot</span>
            )}
            {!canReorder && mode === 'scene' && <span className="text-faint">Clear filters to drag and reorder</span>}
          </div>

          {groups.length === 0 ? (
            <EmptyState compact icon={<Search className="size-5" />} title="No shots match" actions={<Button onClick={clearFilters}>Clear filters</Button>}>
              Try a different search or filter.
            </EmptyState>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
              <div className="space-y-8">
                {groups.map((g) => (
                  <GroupBlock
                    key={g.key}
                    group={g}
                    title={groupTitle(g)}
                    scene={g.sceneId ? sceneById.get(g.sceneId) : undefined}
                    sceneNumber={g.sceneId ? numbers.get(g.sceneId) : undefined}
                    locationName={g.event?.locationId ? locationById.get(g.event.locationId)?.name : undefined}
                    selected={selected}
                    onSelectAll={(on) => g.shots.forEach((s) => toggle(s.id, on))}
                    onAdd={
                      g.kind === 'scene'
                        ? async () => {
                            try {
                              const s = await addShotToScene(pid, g.sceneId!);
                              setParam('shot', s.id);
                            } catch (e) {
                              toastError(e, 'Couldn’t add shot');
                            }
                          }
                        : undefined
                    }
                  >
                    <SortableContext items={g.shots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      {g.shots.map((s) => (
                        <ShotRow
                          key={s.id}
                          shot={s}
                          code={codes.get(s.id) ?? ''}
                          sceneLabel={mode === 'day' ? `Sc ${numbers.get(s.sceneId) ?? '?'}` : undefined}
                          actors={actorsOf(s)}
                          frame={frameByShot.get(s.id)}
                          selected={selected.has(s.id)}
                          onToggle={() => toggle(s.id)}
                          onOpen={() => setParam('shot', s.id)}
                          draggable={canReorder}
                          onDelete={() => void remove('shot', s.id, { confirmTitle: `Delete shot ${codes.get(s.id)}?`, confirmMessage: 'Linked storyboard frames are kept. You can undo this.' })}
                          onCreateFrame={async () => {
                            try {
                              await createFrameFromShot(s);
                              toast('Storyboard frame created', { detail: `Linked to shot ${codes.get(s.id)}` });
                            } catch (e) {
                              toastError(e, 'Couldn’t create the frame');
                            }
                          }}
                        />
                      ))}
                    </SortableContext>
                  </GroupBlock>
                ))}
              </div>
            </DndContext>
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-3 md:bottom-5">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line-strong bg-raised px-3 py-2 shadow-pop animate-rise">
            <span className="px-1 font-mono text-[12px] text-ink">{selected.size} selected</span>
            <Menu trigger={<Button size="sm">Set status</Button>} align="center">
              {SHOT_STATUSES.map((s) => (
                <MenuItem key={s.value} onSelect={() => void bulkStatus(s.value)}>
                  {s.label}
                </MenuItem>
              ))}
            </Menu>
            <Menu trigger={<Button size="sm">Assign day</Button>} align="center">
              <MenuItem onSelect={() => void bulkDay(undefined)}>Follow scene’s filming day</MenuItem>
              {filmingEvents.length > 0 && <MenuSeparator />}
              {filmingEvents.map((e) => (
                <MenuItem key={e.id} onSelect={() => void bulkDay(e.id)}>
                  {formatDate(e.date, 'EEE d MMM')} — {e.title || 'Filming day'}
                </MenuItem>
              ))}
              {!filmingEvents.length && <MenuItem disabled>No filming days scheduled</MenuItem>}
            </Menu>
            <Button size="sm" variant="danger-ghost" icon={<Trash2 className="size-3.5" />} onClick={() => void bulkDelete()}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <AddShotDialog
        open={adding}
        onOpenChange={setAdding}
        scenes={scenes}
        numbers={numbers}
        defaultSceneId={sceneFilter || undefined}
        onCreate={async (sceneId, description, shotType) => {
          try {
            const s = await addShotToScene(pid, sceneId, { description, shotType });
            setAdding(false);
            setParam('shot', s.id);
          } catch (e) {
            toastError(e, 'Couldn’t add shot');
          }
        }}
      />

      <ShotEditor
        shotId={editingId}
        onClose={() => setParam('shot', null)}
        scenes={scenes}
        numbers={numbers}
        codes={codes}
        characters={characters}
        people={people}
        filmingEvents={filmingEvents}
        frames={frames}
      />
    </PageContainer>
  );
}

function GroupBlock({
  group,
  title,
  scene,
  sceneNumber,
  locationName,
  selected,
  onSelectAll,
  onAdd,
  children,
}: {
  group: ShotGroup;
  title: string;
  scene?: Scene;
  sceneNumber?: string;
  locationName?: string;
  selected: Set<string>;
  onSelectAll: (on: boolean) => void;
  onAdd?: () => void;
  children: ReactNode;
}) {
  const t = groupTotals(group.shots);
  const all = group.shots.every((s) => selected.has(s.id));
  const ev = group.event;
  return (
    <section id={`group-${group.key}`} className="scroll-mt-4">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
        <div className="flex min-w-0 items-start gap-3">
          <div className="pt-1">
            <Checkbox checked={all && group.shots.length > 0} onChange={(v) => onSelectAll(v)} label={<span className="sr-only">Select all shots in {title}</span>} />
          </div>
          <div className="min-w-0">
            <div className="slate">
              {group.kind === 'scene' && `Scene ${sceneNumber ?? '?'}`}
              {group.kind === 'day' && ev && `${formatDate(ev.date, 'EEEE')}${ev.callTime ? ` · Call ${formatTime(ev.callTime)}` : ''}${locationName ? ` · ${locationName}` : ''}`}
              {group.kind === 'unscheduled' && 'Not on a filming day yet'}
            </div>
            <h2 className="display mt-0.5 truncate text-[22px] text-ink">
              {group.kind === 'scene' ? scene?.heading || 'Untitled scene' : group.kind === 'day' ? `${formatDate(ev!.date, 'd MMMM yyyy')}${ev!.title ? ` — ${ev!.title}` : ''}` : 'Unscheduled'}
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] text-muted">
            {t.count} shot{t.count === 1 ? '' : 's'} · <span className={t.completed === t.count ? 'text-success' : ''}>{t.completed} done</span> · {formatMinutes(t.minutes)}
          </span>
          {group.kind === 'scene' && (
            <>
              <Link to={`../scenes?scene=${group.sceneId}`} className="text-[12px] text-muted hover:text-ink">
                Scene
              </Link>
              <Link to={`../storyboard?scene=${group.sceneId}`} className="text-[12px] text-muted hover:text-ink">
                Storyboard
              </Link>
            </>
          )}
          {group.kind === 'day' && (
            <Link to={`../schedule/call-sheet/${ev!.id}`} className="text-[12px] text-muted hover:text-ink">
              Call sheet
            </Link>
          )}
          {onAdd && (
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={onAdd}>
              Add shot
            </Button>
          )}
        </div>
      </div>
      <div className="lg:overflow-x-auto">
        <div className="space-y-2 lg:min-w-[1100px] lg:space-y-0">
          <div className={cn('hidden lg:grid items-center gap-2.5 px-2 pb-1.5 pt-1 eyebrow', TABLE_COLS)}>
            <span />
            <span />
            <span>Board</span>
            <span>Shot</span>
            <span>Description</span>
            <span>Camera</span>
            <span>Lens · FPS</span>
            <span>Equipment</span>
            <span>Actors</span>
            <span title="Setup + filming time">Time</span>
            <span>Priority</span>
            <span>Status</span>
            <span />
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function ShotRow({
  shot,
  code,
  sceneLabel,
  actors,
  frame,
  selected,
  onToggle,
  onOpen,
  draggable,
  onDelete,
  onCreateFrame,
}: {
  shot: Shot;
  code: string;
  sceneLabel?: string;
  actors: string[];
  frame?: StoryboardFrame;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  draggable: boolean;
  onDelete: () => void;
  onCreateFrame: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const done = shot.status === 'completed';
  const time = (shot.setupMin ?? 0) + (shot.filmMin ?? 0);
  const camera = `${shotTypeAbbr(shot.shotType)} · ${angleLabel(shot.angle)} · ${movementLabel(shot.movement)}`;

  const menu = (
    <Menu
      trigger={
        <button className="btn-icon size-7" aria-label={`More actions for shot ${code}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </button>
      }
    >
      <MenuItem onSelect={onOpen}>Edit shot</MenuItem>
      <MenuItem icon={<Images className="size-4" />} onSelect={onCreateFrame}>
        Create storyboard frame
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={onDelete}>
        Delete shot
      </MenuItem>
    </Menu>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      {/* Desktop row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) onOpen();
        }}
        className={cn(
          'hidden lg:grid items-center gap-2.5 rounded-sm border border-transparent px-2 py-2 text-[12.5px] transition-colors hover:border-line hover:bg-surface cursor-pointer',
          TABLE_COLS,
          selected && 'border-line-strong bg-surface',
          isDragging && 'border-accent bg-raised shadow-pop',
        )}
      >
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggle} label={<span className="sr-only">Select shot {code}</span>} />
        </span>
        <span
          {...(draggable ? { ...attributes, ...listeners } : {})}
          onClick={(e) => e.stopPropagation()}
          className={cn('flex items-center text-faint', draggable ? 'cursor-grab hover:text-ink active:cursor-grabbing' : 'opacity-30')}
          aria-label={draggable ? `Drag to reorder shot ${code}` : undefined}
        >
          <GripVertical className="size-3.5" />
        </span>
        <FrameThumb frame={frame} className="h-[30px] w-[52px]" />
        <span className="font-mono text-[13px] font-semibold">
          <span className={done ? 'text-faint line-through' : 'text-ink'}>{code}</span>
          {sceneLabel && <span className="block text-[10px] font-normal text-faint">{sceneLabel}</span>}
        </span>
        <span className={cn('line-clamp-2', done ? 'text-muted' : 'text-ink', !shot.description && 'italic text-faint')}>
          {shot.description || 'No description'}
          {shot.continuity.some((c) => !c.resolved) && <span className="ml-2 rounded-xs bg-warning-soft px-1 text-[10.5px] text-warning">Continuity</span>}
        </span>
        <span className="truncate text-muted" title={camera}>
          {camera}
        </span>
        <span className="min-w-0 text-muted" title={[shot.lens, shot.framing].filter(Boolean).join(' · ')}>
          <span className="block truncate">{[shot.lens, shot.framing].filter(Boolean).join(' · ') || <span className="text-faint">—</span>}</span>
          <span className="block font-mono text-[10.5px] text-faint">{shot.frameRate} fps</span>
        </span>
        <span className="truncate text-muted" title={shot.equipment}>
          {shot.equipment || <span className="text-faint">—</span>}
        </span>
        <span className="truncate text-muted" title={actors.join(', ')}>
          {actors.join(', ') || <span className="text-faint">—</span>}
        </span>
        <span className="font-mono text-muted">{time ? formatMinutes(time) : <span className="text-faint">—</span>}</span>
        <ShotPrioritySelect shot={shot} className="w-full" />
        <ShotStatusSelect shot={shot} className="w-full" />
        <span onClick={(e) => e.stopPropagation()}>{menu}</span>
      </div>

      {/* Mobile / tablet card */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) onOpen();
        }}
        className={cn('flex gap-3 rounded-md border bg-surface p-3 lg:hidden', selected ? 'border-accent' : 'border-line', isDragging && 'shadow-pop')}
      >
        <div className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggle} label={<span className="sr-only">Select shot {code}</span>} />
          {draggable && (
            <span {...attributes} {...listeners} className="touch-none text-faint" aria-label={`Drag to reorder shot ${code}`}>
              <GripVertical className="size-4" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className={cn('font-mono text-[15px] font-semibold', done ? 'text-faint line-through' : 'text-ink')}>{code}</span>
              {sceneLabel && <span className="font-mono text-[10.5px] text-faint">{sceneLabel}</span>}
              <span className="slate">{shotTypeAbbr(shot.shotType)}</span>
            </div>
            <span onClick={(e) => e.stopPropagation()}>{menu}</span>
          </div>
          <p className={cn('mt-0.5 text-[13px]', shot.description ? 'text-ink' : 'italic text-faint')}>{shot.description || 'No description'}</p>
          <p className="mt-1 text-[11.5px] text-muted">
            {angleLabel(shot.angle)} · {movementLabel(shot.movement)}
            {shot.lens && ` · ${shot.lens}`}
            {time ? ` · ${formatMinutes(time)}` : ''}
          </p>
          {actors.length > 0 && <p className="mt-0.5 truncate text-[11.5px] text-faint">{actors.join(', ')}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <ShotStatusSelect shot={shot} />
            <ShotPrioritySelect shot={shot} />
          </div>
        </div>
        {frame && <FrameThumb frame={frame} className="h-[48px] w-[80px]" />}
      </div>
    </div>
  );
}

function AddShotDialog({
  open,
  onOpenChange,
  scenes,
  numbers,
  defaultSceneId,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scenes: Scene[];
  numbers: Map<string, string>;
  defaultSceneId?: string;
  onCreate: (sceneId: string, description: string, shotType: ShotType) => Promise<void>;
}) {
  const [sceneId, setSceneId] = useState<string | undefined>(defaultSceneId);
  const [description, setDescription] = useState('');
  const [shotType, setShotType] = useState<ShotType>('MS');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSceneId(defaultSceneId ?? scenes[0]?.id);
      setDescription('');
      setError(null);
    }
  }, [open, defaultSceneId, scenes]);

  const submit = async () => {
    if (!sceneId) {
      setError('Choose the scene this shot belongs to.');
      return;
    }
    setBusy(true);
    await onCreate(sceneId, description.trim(), shotType);
    setBusy(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a shot"
      description="You can fill in lens, equipment, timings and actors next."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Add shot
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Scene" error={error}>
          <SinglePicker value={sceneId} onChange={(v) => { setSceneId(v); setError(null); }} options={sceneOptions(scenes, numbers)} allowNone={false} placeholder="Choose a scene" />
        </Field>
        <Field label="Shot type">
          <Select value={shotType} onChange={(e) => setShotType(e.target.value as ShotType)}>
            {SHOT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" optional>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Wide of the diner as rain hits the window"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </Field>
      </div>
    </Dialog>
  );
}

