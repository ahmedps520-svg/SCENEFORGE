import { History, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Badge, Button, cn, EmptyState, Loading, Segmented, Sheet, toastError, useConfirm } from '@/components/ui';
import { revisionColor } from '@/lib/constants';
import { relativeTime } from '@/lib/dates';
import { useVersions } from '@/lib/hooks';
import type { Script, ScriptElement } from '@/lib/types';
import { diffElements, summarize } from './diff';
import { ScriptPreview } from './ScriptPreview';

export function VersionHistory({
  open,
  onOpenChange,
  script,
  current,
  paper,
  onRestore,
  onSaveVersion,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  script: Script;
  current: ScriptElement[];
  paper: 'dark' | 'light';
  onRestore: (versionId: string) => Promise<void>;
  onSaveVersion: () => void;
}) {
  const versions = useVersions(open ? script.id : undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'compare' | 'preview'>('compare');
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const selected = versions?.find((v) => v.id === selectedId) ?? versions?.[0];
  const diff = useMemo(() => (selected && mode === 'compare' ? diffElements(selected.elements, current) : null), [selected, mode, current]);
  const summary = diff ? summarize(diff) : null;

  const restore = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: 'Restore this version?',
      message: `The draft will be replaced with “${selected.label}” from ${format(selected.createdAt, 'd MMM yyyy, h:mm a')}. Your current text is kept as a new version first, so nothing is lost.`,
      confirmLabel: 'Restore version',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onRestore(selected.id);
      onOpenChange(false);
    } catch (e) {
      toastError(e, 'Couldn’t restore that version');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Version history"
      description={`${script.title} · versions are saved automatically every 10 minutes while you write, and whenever you save one yourself.`}
      width="max-w-5xl"
      headerExtra={
        <Button size="sm" variant="secondary" icon={<Save className="size-3.5" />} onClick={onSaveVersion}>
          Save version
        </Button>
      }
    >
      {versions === undefined ? (
        <Loading label="Loading versions" />
      ) : versions.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="No versions yet">
          SCENEFORGE keeps an automatic version every ten minutes of writing. Save one yourself before a big rewrite, a table read, or sending pages out.
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <ul className="space-y-1 lg:max-h-[calc(100dvh-180px)] lg:overflow-y-auto lg:pr-1">
            {versions.map((v) => {
              const rc = revisionColor(v.revisionColor);
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className={cn(
                      'w-full rounded-sm border px-3 py-2 text-left transition-colors',
                      selected?.id === v.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full border border-line-strong" style={{ background: rc.swatch }} title={`${rc.label} revision`} />
                      <span className="truncate text-[13px] text-ink">{v.label}</span>
                      {v.auto && <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-faint">Auto</span>}
                    </div>
                    <div className="mt-0.5 flex gap-2 text-[11.5px] text-faint">
                      <span title={format(v.createdAt, 'PPpp')}>{relativeTime(v.createdAt)}</span>
                      <span>·</span>
                      <span>
                        {v.pageCount} {v.pageCount === 1 ? 'page' : 'pages'}
                      </span>
                      <span>·</span>
                      <span>{v.wordCount.toLocaleString()} words</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && (
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="display text-[22px] text-ink truncate">{selected.label}</div>
                  <div className="text-[12px] text-faint">{format(selected.createdAt, 'EEEE d MMMM yyyy, h:mm a')}</div>
                </div>
                <Segmented
                  size="sm"
                  label="View"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'compare', label: 'Compare with current' },
                    { value: 'preview', label: 'Preview' },
                  ]}
                />
                <Button size="sm" variant="primary" icon={<RotateCcw className="size-3.5" />} onClick={() => void restore()} loading={busy}>
                  Restore
                </Button>
              </div>
              {summary && (
                <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
                  {summary.added + summary.removed + summary.changed === 0 ? (
                    <Badge tone="neutral">Identical to the current draft</Badge>
                  ) : (
                    <>
                      <span className="text-muted">Since this version:</span>
                      <Badge tone="success">{summary.added} added</Badge>
                      <Badge tone="info">{summary.changed} changed</Badge>
                      <Badge tone="danger">{summary.removed} removed</Badge>
                    </>
                  )}
                </div>
              )}
              {mode === 'compare' && diff ? <ScriptPreview diff={diff} paper={paper} /> : <ScriptPreview elements={selected.elements} paper={paper} />}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
