import { memo } from 'react';
import { formatEighths } from '@/lib/screenplay/paginate';
import type { ScriptElement } from '@/lib/types';
import { cn } from '@/components/ui';

export interface OutlineItem {
  id: string;
  sceneId?: string;
  number: string;
  heading: string;
  eighths?: number;
}

export function buildOutline(elements: ScriptElement[], numbers: Map<string, string>, lengths: Map<string, { eighths: number }>): OutlineItem[] {
  return elements
    .filter((e) => e.type === 'scene' && e.text.trim())
    .map((e) => ({ id: e.id, sceneId: e.sceneId, number: numbers.get(e.id) ?? '', heading: e.text.trim(), eighths: e.sceneId ? lengths.get(e.sceneId)?.eighths : undefined }));
}

const OutlineList = memo(function OutlineList({ outline, currentId, onJump }: { outline: OutlineItem[]; currentId?: string; onJump: (headingId: string) => void }) {
  return (
    <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      {outline.map((o) => (
        <li key={o.id}>
          <button
            onClick={() => onJump(o.id)}
            className={cn(
              'group flex w-full items-baseline gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors',
              currentId === o.id ? 'bg-hover text-ink' : 'text-muted hover:bg-hover/60 hover:text-ink',
            )}
          >
            <span className={cn('w-6 shrink-0 text-right font-mono text-[11px]', currentId === o.id ? 'text-accent' : 'text-faint')}>{o.number}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] uppercase tracking-[0.02em]">{o.heading}</span>
            {o.eighths !== undefined && <span className="shrink-0 font-mono text-[10px] text-faint">{formatEighths(o.eighths)}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
});

export function SceneNavigator({
  outline,
  currentId,
  onJump,
  className,
  stats,
}: {
  outline: OutlineItem[];
  currentId?: string;
  onJump: (headingId: string) => void;
  className?: string;
  stats?: string;
}) {
  return (
    <nav aria-label="Scenes in this draft" className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <span className="eyebrow">Scenes</span>
        <span className="font-mono text-[10.5px] text-faint">{outline.length}</span>
      </div>
      {outline.length === 0 ? (
        <p className="px-4 text-[12.5px] leading-relaxed text-faint">Scene headings you write appear here. Click one to jump to it.</p>
      ) : (
        <OutlineList outline={outline} currentId={currentId} onJump={onJump} />
      )}
      {stats && <div className="border-t border-line px-4 py-2.5 font-mono text-[10.5px] text-faint">{stats}</div>}
    </nav>
  );
}
