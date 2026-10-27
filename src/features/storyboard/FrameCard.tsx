import type React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRightLeft, Camera, Copy, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { AssetImage, cn, Menu, MenuItem, MenuSeparator } from '@/components/ui';
import { angleLabel, movementLabel, shotTypeAbbr, shotTypeLabel } from '@/lib/constants';
import type { StoryboardFrame } from '@/lib/types';

/** Composition guides for frames without art, so an empty frame still reads as a frame. */
export function FramePlaceholder({ frame, large }: { frame: StoryboardFrame; large?: boolean }) {
  return (
    <div className="absolute inset-0 bg-raised">
      <div className="absolute inset-y-3 left-1/3 border-l border-line" />
      <div className="absolute inset-y-3 left-2/3 border-l border-line" />
      <div className="absolute inset-x-3 top-1/3 border-t border-line" />
      <div className="absolute inset-x-3 top-2/3 border-t border-line" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className={cn('font-mono font-medium tracking-[0.2em] text-faint', large ? 'text-[22px]' : 'text-[15px]')}>{shotTypeAbbr(frame.shotType)}</span>
        <span className="text-[10.5px] text-faint/80">{shotTypeLabel(frame.shotType)}</span>
      </div>
    </div>
  );
}

export function FrameCard({
  frame,
  number,
  shotCode,
  selected,
  disabled,
  onSelect,
  onOpen,
  onDuplicate,
  onMove,
  onDelete,
}: {
  frame: StoryboardFrame;
  number: string;
  shotCode?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: frame.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onPointerDown={listeners?.onPointerDown as React.PointerEventHandler<HTMLDivElement> | undefined}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md border bg-surface transition-[border-color,box-shadow]',
        selected ? 'border-accent shadow-[0_0_0_1px_var(--c-accent)]' : 'border-line hover:border-line-strong',
        isDragging && 'z-20 opacity-90 shadow-pop',
      )}
    >
      <div className="relative aspect-video overflow-hidden border-b border-line">
        {frame.imageAssetId ? (
          <AssetImage assetId={frame.imageAssetId} alt={`Frame ${number}`} className="absolute inset-0 size-full bg-white" fallback={<FramePlaceholder frame={frame} />} />
        ) : (
          <FramePlaceholder frame={frame} />
        )}
        <span className="absolute left-2 top-2 rounded-xs bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">{number}</span>
        <div className="absolute bottom-2 right-2 flex gap-1">
          {shotCode && (
            <span className="flex items-center gap-1 rounded-xs bg-black/70 px-1.5 py-0.5 font-mono text-[10.5px] text-white" title="Linked shot">
              <Camera className="size-3" />
              {shotCode}
            </span>
          )}
          {frame.durationSec !== undefined && <span className="rounded-xs bg-black/70 px-1.5 py-0.5 font-mono text-[10.5px] text-white">{frame.durationSec}s</span>}
        </div>
      </div>

      {/* Covers the card for click/keyboard; the menu and handle sit above it. */}
      <button
        type="button"
        data-frame-id={frame.id}
        aria-label={`Frame ${number}: ${frame.action || shotTypeLabel(frame.shotType)}`}
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onOpen}
        className="absolute inset-0 z-[1] cursor-pointer focus-visible:outline-offset-[-2px]"
      />

      <div className="relative p-2.5">
        <div className="slate truncate text-[10px]">
          {shotTypeAbbr(frame.shotType)} · {angleLabel(frame.angle)} · {movementLabel(frame.movement)}
        </div>
        <p className={cn('mt-1 line-clamp-2 min-h-[2.6em] text-[12.5px] leading-snug', frame.action ? 'text-ink' : 'italic text-faint')}>{frame.action || 'No action described yet'}</p>
        {frame.audio && <p className="mt-1 line-clamp-1 text-[11.5px] italic text-muted">“{frame.audio}”</p>}
      </div>

      <div className="absolute right-1.5 top-1.5 z-[2] flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
          onPointerDown={(e) => {
            // The handle is touch-action:none, so touch users drag from here; don't double-start via the card.
            e.stopPropagation();
            (listeners?.onPointerDown as React.PointerEventHandler<HTMLButtonElement> | undefined)?.(e);
          }}
          disabled={disabled}
          aria-label={`Drag frame ${number} (Space to pick up, arrows to move)`}
          title="Drag to reorder"
          className="flex size-7 items-center justify-center rounded-sm bg-black/60 text-white touch-none hover:bg-black/80 disabled:hidden"
        >
          <GripVertical className="size-3.5" />
        </button>
        <Menu
          trigger={
            <button type="button" aria-label={`Frame ${number} actions`} className="flex size-7 items-center justify-center rounded-sm bg-black/60 text-white hover:bg-black/80" onPointerDown={(e) => e.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </button>
          }
        >
          <MenuItem icon={<Pencil className="size-3.5" />} onSelect={onOpen} shortcut="↵">
            Edit frame
          </MenuItem>
          <MenuItem icon={<Copy className="size-3.5" />} onSelect={onDuplicate}>
            Duplicate
          </MenuItem>
          <MenuItem icon={<ArrowRightLeft className="size-3.5" />} onSelect={onMove}>
            Move to scene…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 className="size-3.5" />} onSelect={onDelete} danger shortcut="⌫">
            Delete
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}
