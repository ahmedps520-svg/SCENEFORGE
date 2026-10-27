import { ImageOff } from 'lucide-react';
import { AssetImage, cn } from '@/components/ui';
import { SHOT_PRIORITIES, SHOT_STATUSES } from '@/lib/constants';
import { updateRecord } from '@/lib/data/crud';
import type { Shot, ShotPriority, ShotStatus, StoryboardFrame } from '@/lib/types';
import { toastError } from '@/components/ui';

export async function setShotStatus(shot: Shot, status: ShotStatus) {
  try {
    await updateRecord<Shot>('shots', shot.id, {
      status,
      completedAt: status === 'completed' ? Date.now() : undefined,
    });
  } catch (e) {
    toastError(e, 'Status not saved');
  }
}

const STATUS_TEXT: Record<ShotStatus, string> = {
  planned: 'text-muted',
  ready: 'text-info',
  filming: 'text-live',
  completed: 'text-success',
  reshoot: 'text-danger',
};

/** Compact native select for inline status edits (works well on touch devices). */
export function ShotStatusSelect({ shot, className }: { shot: Shot; className?: string }) {
  return (
    <select
      aria-label="Shot status"
      value={shot.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void setShotStatus(shot, e.target.value as ShotStatus)}
      className={cn('input h-7 pl-2 text-[12px] font-medium', STATUS_TEXT[shot.status], className ?? 'w-[124px]')}
    >
      {SHOT_STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

const SHORT_PRIORITY: Record<ShotPriority, string> = { must: 'Must', should: 'Should', nice: 'Nice' };

export function ShotPrioritySelect({ shot, className }: { shot: Shot; className?: string }) {
  return (
    <select
      aria-label="Shot priority"
      value={shot.priority}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void updateRecord<Shot>('shots', shot.id, { priority: e.target.value as ShotPriority }).catch((err) => toastError(err, 'Priority not saved'))}
      className={cn('input h-7 pl-2 text-[12px]', shot.priority === 'must' ? 'text-ink' : 'text-muted', className ?? 'w-[112px]')}
    >
      {SHOT_PRIORITIES.map((p) => (
        <option key={p.value} value={p.value}>
          {SHORT_PRIORITY[p.value]}
        </option>
      ))}
    </select>
  );
}

/** Thumbnail of the first storyboard frame linked to a shot. */
export function FrameThumb({ frame, className }: { frame?: StoryboardFrame; className?: string }) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-xs border border-line bg-raised', className)}>
      {frame?.imageAssetId ? (
        <AssetImage assetId={frame.imageAssetId} alt="Storyboard frame" className="absolute inset-0 size-full" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-faint" title={frame ? 'Frame has no image' : 'No storyboard frame linked'}>
          {frame ? <span className="font-mono text-[9px]">FRAME</span> : <ImageOff className="size-3" />}
        </div>
      )}
    </div>
  );
}
