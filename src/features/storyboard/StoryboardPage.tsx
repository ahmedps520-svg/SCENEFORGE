import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowUpRight, FileDown, Images, MonitorPlay, PenLine, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { Button, cn, EmptyState, Loading, Menu, MenuItem, Select, Tip, toastError } from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { formatSeconds } from '@/lib/dates';
import { useProjectData } from '@/lib/hooks';
import { frameNumbers, sceneNumbers, shotCodes } from '@/lib/numbering';
import type { Scene, StoryboardFrame } from '@/lib/types';
import { FrameCard } from './FrameCard';
import { FrameEditor } from './FrameEditor';
import { addFrame, duplicateFrame, moveFrame, persistFrameOrder } from './frames';
import { ExportStoryboardDialog, MoveFrameDialog } from './StoryboardDialogs';

export default function StoryboardPage() {
  const { project } = useWorkspace();
  const data = useProjectData(project.id);
  const [params, setParams] = useSearchParams();
  const sceneParam = params.get('scene');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [moving, setMoving] = useState<StoryboardFrame | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const del = useDeleteEntity();

  const derived = useMemo(() => {
    if (!data) return null;
    const numbers = sceneNumbers(data.scenes);
    const byScene = new Map<string, StoryboardFrame[]>();
    for (const f of data.frames) byScene.set(f.sceneId, [...(byScene.get(f.sceneId) ?? []), f]);
    for (const list of byScene.values()) list.sort((a, b) => a.order - b.order);
    // Auto numbers ignore overrides, so the editor can show what a blank override becomes.
    const auto = frameNumbers(data.frames.map((f) => ({ ...f, shotNumber: '' })), numbers);
    return { numbers, byScene, fNumbers: frameNumbers(data.frames, numbers), auto, sCodes: shotCodes(data.shots, numbers) };
  }, [data]);

  // Keep the editor open on a frame only while it still exists.
  useEffect(() => {
    if (editing && data && !data.frames.some((f) => f.id === editing)) setEditing(null);
  }, [data, editing]);

  if (data === undefined || !derived) return <Loading label="Loading storyboard" />;
  if (data === null) return null;

  const { numbers, byScene, fNumbers, auto, sCodes } = derived;
  const scenes = data.scenes;
  const focusScene = sceneParam ? scenes.find((s) => s.id === sceneParam) : undefined;
  const boarded = scenes.filter((s) => (byScene.get(s.id)?.length ?? 0) > 0).length;

  const selectScene = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('scene', id);
    else next.delete('scene');
    setParams(next, { replace: true });
    setSelected(null);
  };

  const framesOf = (sceneId: string) => byScene.get(sceneId) ?? [];

  const add = async (scene: Scene) => {
    try {
      const f = await addFrame(project.id, scene.id, framesOf(scene.id));
      setSelected(f.id);
      setEditing(f.id);
    } catch (e) {
      toastError(e, 'Frame not added');
    }
  };
  const duplicate = async (frame: StoryboardFrame) => {
    try {
      const copy = await duplicateFrame(frame, framesOf(frame.sceneId));
      setSelected(copy.id);
    } catch (e) {
      toastError(e, 'Frame not duplicated');
    }
  };
  const remove = async (frame: StoryboardFrame) => {
    const list = framesOf(frame.sceneId);
    const idx = list.findIndex((f) => f.id === frame.id);
    const ok = await del('frame', frame.id, { skipConfirm: true });
    if (!ok) return;
    const neighbour = list[idx + 1] ?? list[idx - 1];
    setSelected(neighbour && neighbour.id !== frame.id ? neighbour.id : null);
    if (editing === frame.id) setEditing(null);
  };

  const editingFrame = editing ? data.frames.find((f) => f.id === editing) : undefined;
  const editingScene = editingFrame ? scenes.find((s) => s.id === editingFrame.sceneId) : undefined;
  const editingList = editingFrame ? framesOf(editingFrame.sceneId) : [];
  const editingIdx = editingFrame ? editingList.findIndex((f) => f.id === editingFrame.id) : -1;
  const presentHref = `/p/${project.id}/present/storyboard${focusScene ? `?scene=${focusScene.id}` : ''}`;

  const boardProps = (scene: Scene) => ({
    scene,
    number: numbers.get(scene.id) ?? '–',
    frames: framesOf(scene.id),
    fNumbers,
    sCodes,
    selected,
    onSelect: setSelected,
    onOpen: (id: string) => {
      setSelected(id);
      setEditing(id);
    },
    onAdd: () => void add(scene),
    onDuplicate: (f: StoryboardFrame) => void duplicate(f),
    onMove: (f: StoryboardFrame) => setMoving(f),
    onDelete: (f: StoryboardFrame) => void remove(f),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="display text-[26px] leading-none text-ink">Storyboard</h1>
          <p className="mt-1 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
            {data.frames.length} frame{data.frames.length === 1 ? '' : 's'} · {boarded} of {scenes.length} scenes boarded
          </p>
        </div>
        {scenes.length > 0 && (
          <Select className="w-full md:hidden" value={focusScene?.id ?? ''} onChange={(e) => selectScene(e.target.value || null)} aria-label="Scene">
            <option value="">All scenes</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {numbers.get(s.id)}. {s.heading || 'Untitled scene'} ({framesOf(s.id).length})
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {scenes.length > 0 && (
            <>
              <Link to={presentHref} className={cn('btn btn-secondary', !data.frames.length && 'pointer-events-none opacity-45')} aria-disabled={!data.frames.length}>
                <MonitorPlay className="size-4" /> Present
              </Link>
              <Button icon={<FileDown className="size-4" />} onClick={() => setExportOpen(true)} disabled={!data.frames.length}>
                Export PDF
              </Button>
              {focusScene ? (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => void add(focusScene)}>
                  Add frame
                </Button>
              ) : (
                <Menu
                  trigger={
                    <Button variant="primary" icon={<Plus className="size-4" />}>
                      Add frame
                    </Button>
                  }
                >
                  {scenes.map((s) => (
                    <MenuItem key={s.id} onSelect={() => void add(s)}>
                      <span className="font-mono text-faint">{numbers.get(s.id)}</span> {s.heading || 'Untitled scene'}
                    </MenuItem>
                  ))}
                </Menu>
              )}
            </>
          )}
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <EmptyState
            icon={<Images className="size-6" />}
            title="Storyboards start with scenes"
            actions={
              <>
                <Link to={`/p/${project.id}/script`} className="btn btn-primary">
                  <PenLine className="size-4" /> Write a scene
                </Link>
                <Link to={`/p/${project.id}/scenes`} className="btn btn-secondary">
                  Plan scenes
                </Link>
              </>
            }
          >
            Every frame belongs to a scene. Add a scene heading in the script or plan scenes in the breakdown, then come back to board it.
          </EmptyState>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Scene rail */}
          <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-panel md:flex" aria-label="Scenes">
            <button
              type="button"
              onClick={() => selectScene(null)}
              className={cn('flex items-center justify-between border-b border-line px-4 py-3 text-left text-[13px]', !focusScene ? 'bg-hover text-ink' : 'text-muted hover:bg-hover/60 hover:text-ink')}
            >
              All scenes
              <span className="font-mono text-[11px] text-faint">{data.frames.length}</span>
            </button>
            <ul className="py-1">
              {scenes.map((s) => {
                const n = framesOf(s.id).length;
                const active = focusScene?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectScene(s.id)}
                      aria-current={active || undefined}
                      className={cn('relative flex w-full items-start gap-2.5 px-4 py-2 text-left', active ? 'bg-hover' : 'hover:bg-hover/60')}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent" />}
                      <span className="w-6 shrink-0 pt-px font-mono text-[11px] text-faint">{numbers.get(s.id)}</span>
                      <span className={cn('min-w-0 flex-1 truncate font-script text-[11.5px] font-bold uppercase', active ? 'text-ink' : 'text-muted')}>{s.heading || 'Untitled scene'}</span>
                      <span className={cn('shrink-0 font-mono text-[10.5px]', n ? 'text-accent' : 'text-faint/70')}>{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Canvas */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
              <Tip id="storyboard-intro" className="mb-5">
                Drag frames to reorder. With a frame selected, arrow keys move between frames, <span className="kbd">↵</span> edits and <span className="kbd">⌫</span> deletes (with undo). Sketch a composition or upload references in the frame editor.
              </Tip>
              {focusScene ? (
                <SceneBoard {...boardProps(focusScene)} expanded />
              ) : (
                <div className="space-y-10">
                  {scenes.map((s) => (
                    <SceneBoard key={s.id} {...boardProps(s)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <FrameEditor
        frame={editingFrame}
        scene={editingScene}
        sceneNumber={editingScene ? numbers.get(editingScene.id) ?? '' : ''}
        frameNumber={editingFrame ? fNumbers.get(editingFrame.id) ?? '' : ''}
        autoNumber={editingFrame ? auto.get(editingFrame.id) ?? '' : ''}
        shots={editingFrame ? data.shots.filter((s) => s.sceneId === editingFrame.sceneId) : []}
        shotCodes={sCodes}
        open={!!editingFrame}
        onOpenChange={(o) => !o && setEditing(null)}
        onPrev={editingIdx > 0 ? () => setEditing(editingList[editingIdx - 1].id) : undefined}
        onNext={editingIdx >= 0 && editingIdx < editingList.length - 1 ? () => setEditing(editingList[editingIdx + 1].id) : undefined}
        onDuplicate={() => editingFrame && void duplicate(editingFrame)}
        onDelete={() => editingFrame && void remove(editingFrame)}
      />
      <MoveFrameDialog
        frame={moving}
        scenes={scenes}
        numbers={numbers}
        onClose={() => setMoving(null)}
        onMove={async (sceneId) => {
          if (!moving) return;
          try {
            await moveFrame(moving, sceneId, framesOf(sceneId));
            setSelected(moving.id);
          } catch (e) {
            toastError(e, 'Frame not moved');
          }
        }}
      />
      <ExportStoryboardDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        project={project}
        scenes={scenes}
        frames={data.frames}
        numbers={numbers}
        frameNumbers={fNumbers}
        initialSceneId={focusScene?.id}
      />
    </div>
  );
}

function SceneBoard({
  scene,
  number,
  frames,
  fNumbers,
  sCodes,
  selected,
  onSelect,
  onOpen,
  onAdd,
  onDuplicate,
  onMove,
  onDelete,
  expanded,
}: {
  scene: Scene;
  number: string;
  frames: StoryboardFrame[];
  fNumbers: Map<string, string>;
  sCodes: Map<string, string>;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (f: StoryboardFrame) => void;
  onMove: (f: StoryboardFrame) => void;
  onDelete: (f: StoryboardFrame) => void;
  expanded?: boolean;
}) {
  const ids = frames.map((f) => f.id);
  const key = ids.join('|');
  const [local, setLocal] = useState(ids);
  useEffect(() => setLocal(ids), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const grid = useRef<HTMLDivElement>(null);
  const byId = new Map(frames.map((f) => [f.id, f]));
  const runtime = frames.reduce((n, f) => n + (f.durationSec ?? 0), 0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = local.indexOf(String(e.active.id));
    const to = local.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(local, from, to);
    setLocal(next);
    persistFrameOrder(scene.projectId, scene.id, next, number).catch((err) => {
      setLocal(ids);
      toastError(err, 'Frame order not saved');
    });
  };

  const focusFrame = (id: string) => {
    onSelect(id);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-frame-id="${id}"]`)?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).dataset?.frameId;
    if (!id) return;
    const idx = local.indexOf(id);
    const cols = grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').filter(Boolean).length || 1 : 1;
    let next = -1;
    switch (e.key) {
      case 'ArrowRight':
        next = idx + 1;
        break;
      case 'ArrowLeft':
        next = idx - 1;
        break;
      case 'ArrowDown':
        next = idx + cols;
        break;
      case 'ArrowUp':
        next = idx - cols;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = local.length - 1;
        break;
      case 'Enter':
        e.preventDefault();
        onOpen(id);
        return;
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        const f = byId.get(id);
        if (f) onDelete(f);
        return;
      }
      default:
        return;
    }
    if (next >= 0 && next < local.length) {
      e.preventDefault();
      focusFrame(local[next]);
    }
  };

  return (
    <section aria-label={`Scene ${number} storyboard`}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="slate">
            Scene {number} · {frames.length} frame{frames.length === 1 ? '' : 's'}
            {runtime > 0 && ` · ${formatSeconds(runtime)}`}
          </div>
          <h2 className={cn('mt-1 truncate font-script font-bold uppercase text-ink', expanded ? 'text-[15px]' : 'text-[13.5px]')}>{scene.heading || 'Untitled scene'}</h2>
          {expanded && (scene.summary || scene.scriptExcerpt) && <p className="mt-1 max-w-3xl text-[12.5px] text-muted line-clamp-2">{scene.summary || scene.scriptExcerpt}</p>}
        </div>
        <Link to={`/p/${scene.projectId}/scenes?scene=${scene.id}`} className="link shrink-0 text-[12px]">
          Scene details <ArrowUpRight className="inline size-3" />
        </Link>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={local} strategy={rectSortingStrategy}>
          <div ref={grid} onKeyDown={onKeyDown} className={cn('grid gap-4', expanded ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5')}>
            {local.map((id) => {
              const f = byId.get(id);
              if (!f) return null;
              return (
                <FrameCard
                  key={id}
                  frame={f}
                  number={fNumbers.get(id) ?? ''}
                  shotCode={f.shotId ? sCodes.get(f.shotId) : undefined}
                  selected={selected === id}
                  onSelect={() => onSelect(id)}
                  onOpen={() => onOpen(id)}
                  onDuplicate={() => onDuplicate(f)}
                  onMove={() => onMove(f)}
                  onDelete={() => onDelete(f)}
                />
              );
            })}
            <button
              type="button"
              onClick={onAdd}
              className="flex min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="size-5" />
              <span className="text-[12.5px]">{frames.length ? 'Add frame' : 'Add the first frame'}</span>
            </button>
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
