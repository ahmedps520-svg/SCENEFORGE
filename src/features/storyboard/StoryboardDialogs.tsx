import { FileDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Checkbox, cn, Dialog, Field, Select, toast, toastError } from '@/components/ui';
import { exportStoryboardPdf } from '@/lib/pdf/storyboard';
import type { Project, Scene, StoryboardFrame } from '@/lib/types';

export function MoveFrameDialog({
  frame,
  scenes,
  numbers,
  onClose,
  onMove,
}: {
  frame: StoryboardFrame | null;
  scenes: Scene[];
  numbers: Map<string, string>;
  onClose: () => void;
  onMove: (sceneId: string) => Promise<void>;
}) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (frame) setTarget(scenes.find((s) => s.id !== frame.sceneId)?.id ?? '');
  }, [frame, scenes]);
  const others = scenes.filter((s) => s.id !== frame?.sceneId);
  return (
    <Dialog
      open={!!frame}
      onOpenChange={(o) => !o && onClose()}
      title="Move frame"
      description="The frame moves to the end of the chosen scene’s storyboard. Its shot link is cleared, since shots belong to a scene."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!target}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onMove(target);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Move frame
          </Button>
        </>
      }
    >
      {others.length ? (
        <Field label="Move to scene">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {numbers.get(s.id)}. {s.heading || 'Untitled scene'}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="text-[13px] text-muted">There’s no other scene to move this frame to yet.</p>
      )}
    </Dialog>
  );
}

export function ExportStoryboardDialog({
  open,
  onOpenChange,
  project,
  scenes,
  frames,
  numbers,
  frameNumbers,
  initialSceneId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: Project;
  scenes: Scene[];
  frames: StoryboardFrame[];
  numbers: Map<string, string>;
  frameNumbers: Map<string, string>;
  initialSceneId?: string;
}) {
  const withFrames = scenes.filter((s) => frames.some((f) => f.sceneId === s.id));
  const [selected, setSelected] = useState<string[]>([]);
  const [layout, setLayout] = useState<'grid' | 'detail'>('grid');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSelected(initialSceneId && withFrames.some((s) => s.id === initialSceneId) ? [initialSceneId] : withFrames.map((s) => s.id));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = frames.filter((f) => selected.includes(f.sceneId)).length;
  const run = async () => {
    setBusy(true);
    try {
      await exportStoryboardPdf({ project, scenes, frames, sceneNumbers: numbers, frameNumbers, sceneIds: selected, layout });
      toast('Storyboard PDF exported');
      onOpenChange(false);
    } catch (e) {
      toastError(e, 'PDF not exported');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export storyboard"
      description="A landscape PDF from your saved frames, grouped by scene."
      footer={
        <>
          <span className="mr-auto text-[12px] text-faint">
            {count} frame{count === 1 ? '' : 's'} · {selected.length} scene{selected.length === 1 ? '' : 's'}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon={<FileDown className="size-4" />} disabled={!count} loading={busy} onClick={() => void run()}>
            Export PDF
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="label">Layout</div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['grid', 'Grid', 'Six frames per page — quick review'],
                ['detail', 'Detailed', 'Two frames per page with all notes'],
              ] as const
            ).map(([v, l, hint]) => (
              <button
                key={v}
                type="button"
                onClick={() => setLayout(v)}
                aria-pressed={layout === v}
                className={cn('rounded-md border px-3 py-2.5 text-left transition-colors', layout === v ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}
              >
                <div className="text-[13px] text-ink">{l}</div>
                <div className="text-[11.5px] text-faint">{hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">Scenes</span>
            <span className="flex gap-3 text-[12px]">
              <button type="button" className="link" onClick={() => setSelected(withFrames.map((s) => s.id))}>
                All
              </button>
              <button type="button" className="link" onClick={() => setSelected([])}>
                None
              </button>
            </span>
          </div>
          {withFrames.length ? (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-line p-2">
              {withFrames.map((s) => (
                <Checkbox
                  key={s.id}
                  className="flex w-full rounded-sm px-1.5 py-1 hover:bg-hover"
                  checked={selected.includes(s.id)}
                  onChange={(on) => setSelected((cur) => (on ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                  label={
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[11.5px] text-muted">{numbers.get(s.id)}</span>
                      <span className="truncate font-script text-[12px] font-bold uppercase">{s.heading || 'Untitled scene'}</span>
                      <span className="font-mono text-[11px] text-faint">{frames.filter((f) => f.sceneId === s.id).length}</span>
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">No scene has storyboard frames yet.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
