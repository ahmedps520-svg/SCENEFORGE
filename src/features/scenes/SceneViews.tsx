import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Camera, FilePlus2, GripVertical, Images, MapPin } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ReadinessBadge } from '@/components/StatusBadges';
import { AssetImage, Avatar, Badge, cn } from '@/components/ui';
import { formatSeconds, formatShortDate } from '@/lib/dates';
import { formatEighths } from '@/lib/screenplay/paginate';
import type { SceneInfo } from './sceneInfo';

function intExtLabel(v: string) {
  return v === 'INT/EXT' ? 'INT/EXT' : v || '—';
}

function metaLine(info: SceneInfo) {
  const s = info.scene;
  return [intExtLabel(s.intExt), s.timeOfDay || null, s.pageEighths > 0 ? `${formatEighths(s.pageEighths)} pg` : null].filter(Boolean).join(' · ');
}

function CharacterStack({ info, max = 5 }: { info: SceneInfo; max?: number }) {
  if (!info.characters.length) return <span className="text-[11.5px] text-faint">No characters</span>;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {info.characters.slice(0, max).map((c) => (
          <span key={c.id} title={c.name} className="rounded-full ring-2 ring-surface">
            <Avatar name={c.name} assetId={c.portraitAssetId} size={22} />
          </span>
        ))}
      </div>
      {info.characters.length > max && <span className="ml-1.5 font-mono text-[10.5px] text-faint">+{info.characters.length - max}</span>}
    </div>
  );
}

/** Slate-style placeholder for scenes without storyboard art. */
function SlatePlaceholder({ info }: { info: SceneInfo }) {
  return (
    <div className="absolute inset-0 flex items-end justify-between bg-[repeating-linear-gradient(135deg,transparent_0_14px,color-mix(in_srgb,var(--c-ink)_2.5%,transparent)_14px_15px)] px-4 pb-3">
      <span className="display text-[52px] leading-none text-[color-mix(in_srgb,var(--c-ink)_14%,transparent)]">{info.number}</span>
      <span className="slate mb-1 text-faint">{info.location?.name ?? info.scene.locationName ?? ''}</span>
    </div>
  );
}

export function SceneCard({ info, onOpen }: { info: SceneInfo; onOpen: () => void }) {
  const s = info.scene;
  const thumb = info.frames.find((f) => f.imageAssetId);
  const text = s.summary || s.scriptExcerpt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-md border border-line bg-surface text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-soft focus-visible:-translate-y-0.5"
    >
      <div className="relative aspect-[2.39/1] overflow-hidden border-b border-line bg-raised">
        {thumb ? (
          <AssetImage assetId={thumb.imageAssetId} alt={`Storyboard for scene ${info.number}`} className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.03]" fallback={<SlatePlaceholder info={info} />} />
        ) : (
          <SlatePlaceholder info={info} />
        )}
        <span className="absolute left-2.5 top-2.5 rounded-xs bg-black/65 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">SC {info.number}</span>
        <span className="absolute right-2.5 top-2.5">
          <ReadinessBadge readiness={info.readiness} />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="slate truncate">{metaLine(info)}</span>
          {!s.inScript && <Badge tone="warning">Not in script</Badge>}
        </div>
        <div className="mt-1.5 truncate font-script text-[13px] font-bold uppercase text-ink">{s.heading || 'Untitled scene'}</div>
        <p className={cn('mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed', text ? 'text-muted' : 'italic text-faint')}>{text || 'No summary yet'}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <CharacterStack info={info} />
          <span className="flex items-center gap-2.5 font-mono text-[10.5px] text-faint">
            {info.frames.length > 0 && (
              <span className="flex items-center gap-1" title="Storyboard frames">
                <Images className="size-3" />
                {info.frames.length}
              </span>
            )}
            <span className="flex items-center gap-1" title="Shots">
              <Camera className="size-3" />
              {info.shots.length}
            </span>
            {info.durationSec > 0 && <span title="Estimated duration">{formatSeconds(info.durationSec)}</span>}
          </span>
        </div>
      </div>
    </button>
  );
}

export function CardsView({ infos, onOpen }: { infos: SceneInfo[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {infos.map((info) => (
        <SceneCard key={info.scene.id} info={info} onOpen={() => onOpen(info.scene.id)} />
      ))}
    </div>
  );
}

export function ListView({ infos, onOpen }: { infos: SceneInfo[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="hidden grid-cols-[48px_minmax(0,2.2fr)_minmax(0,1.1fr)_90px_70px_60px_110px_130px] gap-3 border-b border-line bg-panel px-3 py-2 lg:grid">
        {['#', 'Heading', 'Location', 'Cast', 'Length', 'Shots', 'Filming', 'Status'].map((h) => (
          <span key={h} className="eyebrow">
            {h}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {infos.map((info) => {
          const s = info.scene;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left hover:bg-hover/60 lg:grid-cols-[48px_minmax(0,2.2fr)_minmax(0,1.1fr)_90px_70px_60px_110px_130px]"
              >
                <span className="font-mono text-[12px] text-muted">{info.number}</span>
                <span className="min-w-0">
                  <span className="block truncate font-script text-[12.5px] font-bold uppercase text-ink">{s.heading || 'Untitled scene'}</span>
                  <span className="block truncate text-[12px] text-faint">{s.summary || s.scriptExcerpt || '—'}</span>
                </span>
                <span className="hidden truncate text-[12.5px] text-muted lg:block">{info.location?.name ?? <span className="text-faint">—</span>}</span>
                <span className="hidden lg:block">
                  <CharacterStack info={info} max={3} />
                </span>
                <span className="hidden font-mono text-[12px] text-muted lg:block">{s.pageEighths > 0 ? formatEighths(s.pageEighths) : '—'}</span>
                <span className="hidden font-mono text-[12px] text-muted lg:block">{info.shots.length}</span>
                <span className="hidden truncate font-mono text-[11.5px] text-muted lg:block">{info.dates.length ? info.dates.map(formatShortDate).join(', ') : '—'}</span>
                <span className="justify-self-end lg:justify-self-start">
                  <ReadinessBadge readiness={info.readiness} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SortableRow({ id, disabled, children, onOpen, label, trailing }: { id: string; disabled: boolean; children: ReactNode; onOpen: () => void; label: string; trailing?: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative flex items-stretch bg-surface', isDragging && 'z-10 shadow-pop ring-1 ring-accent')}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Reorder ${label}`}
        className={cn('flex w-9 shrink-0 items-center justify-center text-faint touch-none', disabled ? 'cursor-default opacity-30' : 'cursor-grab hover:text-ink active:cursor-grabbing')}
      >
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-2.5 pr-3 text-left hover:bg-hover/50">
        {children}
      </button>
      {trailing && <div className="flex shrink-0 items-center pr-3 text-[12px]">{trailing}</div>}
    </li>
  );
}

/** Drag-to-reorder list. Keeps the dropped order on screen while the save completes. */
export function SortableSceneList({
  infos,
  onReorder,
  onOpen,
  disabled,
  renderExtra,
  renderTrailing,
  positionLabel,
}: {
  infos: SceneInfo[];
  onReorder: (next: string[], prev: string[]) => void;
  onOpen: (id: string) => void;
  disabled: boolean;
  renderExtra?: (info: SceneInfo) => ReactNode;
  renderTrailing?: (info: SceneInfo) => ReactNode;
  positionLabel?: (index: number, info: SceneInfo) => string;
}) {
  const ids = infos.map((i) => i.scene.id);
  const key = ids.join('|');
  const [local, setLocal] = useState(ids);
  useEffect(() => setLocal(ids), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(infos.map((i) => [i.scene.id, i]));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = local.indexOf(String(e.active.id));
    const to = local.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(local, from, to);
    const prev = local;
    setLocal(next);
    onReorder(next, prev);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={local} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {local.map((id, idx) => {
            const info = byId.get(id);
            if (!info) return null;
            const s = info.scene;
            return (
              <SortableRow key={id} id={id} disabled={disabled} onOpen={() => onOpen(id)} label={`scene ${info.number}`} trailing={renderTrailing?.(info)}>
                <div className="flex items-center gap-3">
                  <span className="w-10 shrink-0 font-mono text-[12px] text-muted">{positionLabel ? positionLabel(idx, info) : info.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-script text-[12.5px] font-bold uppercase text-ink">{s.heading || 'Untitled scene'}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-faint">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        {info.location?.name ?? s.locationName ?? '—'}
                      </span>
                      {s.pageEighths > 0 && <span className="font-mono">{formatEighths(s.pageEighths)} pg</span>}
                      {info.durationSec > 0 && <span className="font-mono">{formatSeconds(info.durationSec)}</span>}
                      {renderExtra?.(info)}
                    </span>
                  </span>
                  <ReadinessBadge readiness={info.readiness} />
                </div>
              </SortableRow>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export function FilmingDates({ info }: { info: SceneInfo }) {
  if (!info.dates.length) return <span className="text-faint/80">Unscheduled</span>;
  return (
    <span className="flex items-center gap-1 text-muted">
      <CalendarDays className="size-3" />
      {info.dates.map(formatShortDate).join(', ')}
    </span>
  );
}

export function AddToScriptButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 text-accent hover:underline disabled:opacity-50"
    >
      <FilePlus2 className="size-3" /> Add to script
    </button>
  );
}
