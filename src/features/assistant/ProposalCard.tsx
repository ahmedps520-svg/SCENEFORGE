import { ArrowRight, Check, RotateCcw, Undo2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, cn } from '@/components/ui';
import { angleLabel, EVENT_TYPES, movementLabel, shotTypeAbbr, TASK_PRIORITIES } from '@/lib/constants';
import { formatDate, formatTime } from '@/lib/dates';
import { proposalSummary, toScriptElements, type ProposalPayload } from '@/lib/ai/apply';
import { displayText } from '@/lib/screenplay/paginate';
import { segmentScenes } from '@/lib/screenplay/sync';
import type { Character, Proposal, Scene, Script, ScriptElement } from '@/lib/types';

export interface PreviewData {
  scenes: Scene[];
  characters: Character[];
  numbers: Map<string, string>;
  script?: Script | null;
}

const CHAR_LABELS: Record<string, string> = {
  age: 'Age',
  appearance: 'Appearance',
  personality: 'Personality',
  background: 'Background',
  motivations: 'Motivations',
  goals: 'Goals',
  fears: 'Fears',
  arc: 'Arc',
  costume_notes: 'Costume notes',
  casting_notes: 'Casting notes',
  dialogue_samples: 'Dialogue samples',
};
const CHAR_KEYS: Record<string, keyof Character> = {
  age: 'age',
  appearance: 'appearance',
  personality: 'personality',
  background: 'background',
  motivations: 'motivations',
  goals: 'goals',
  fears: 'fears',
  arc: 'arc',
  costume_notes: 'costumeNotes',
  casting_notes: 'castingNotes',
  dialogue_samples: 'dialogueSamples',
};
const SCENE_LABELS: Record<string, [string, keyof Scene]> = {
  summary: ['Summary', 'summary'],
  notes: ["Director's notes", 'notes'],
  props_notes: ['Props', 'propsNotes'],
  wardrobe_notes: ['Wardrobe', 'wardrobeNotes'],
  sfx_notes: ['Special effects', 'sfxNotes'],
};

function Change({ label, before, after }: { label: string; before?: string; after: string }) {
  return (
    <div className="space-y-1">
      <div className="eyebrow">{label}</div>
      {before?.trim() ? <p className="whitespace-pre-wrap text-[12.5px] text-faint line-through decoration-faint/60">{before}</p> : <p className="text-[11.5px] text-faint">Currently empty</p>}
      <p className="whitespace-pre-wrap text-[12.5px] text-ink">{after || <span className="text-faint">(cleared)</span>}</p>
    </div>
  );
}

function ScriptLines({ elements }: { elements: Pick<ScriptElement, 'type' | 'text'>[] }) {
  const pad: Partial<Record<ScriptElement['type'], string>> = {
    character: 'pl-[38%]',
    dialogue: 'pl-[18%] pr-[12%]',
    parenthetical: 'pl-[28%] pr-[18%]',
    transition: 'text-right',
    centered: 'text-center',
  };
  return (
    <div className="max-h-72 overflow-y-auto rounded-sm border border-line bg-paper px-3 py-2.5 font-script text-[12px] leading-[1.45] text-paper-ink">
      {elements.map((e, i) => {
        const t = displayText(e);
        if (!t) return null;
        const gap = ['character', 'action', 'scene', 'transition', 'shot', 'centered'].includes(e.type) && i > 0 ? 'mt-3' : '';
        return (
          <p key={i} className={cn('whitespace-pre-wrap', pad[e.type], gap, e.type === 'scene' && 'font-bold')}>
            {t}
          </p>
        );
      })}
    </div>
  );
}

function Preview({ proposal, data }: { proposal: Proposal; data: PreviewData }) {
  const { args, refs } = proposal.input as ProposalPayload;
  const a = args as Record<string, any>;
  const [compare, setCompare] = useState(false);
  const sceneNo = (id?: string) => (id ? data.numbers.get(id) : undefined);

  switch (proposal.kind) {
    case 'propose_shots':
      return (
        <ol className="space-y-2">
          {a.shots.map((s: any, i: number) => (
            <li key={i} className="flex gap-2.5 text-[12.5px]">
              <span className="w-5 shrink-0 pt-px font-mono text-[11px] text-faint">{i + 1}</span>
              <div className="min-w-0">
                <div className="slate text-[10px]">
                  {shotTypeAbbr(s.shot_type)} · {angleLabel(s.angle)} · {movementLabel(s.movement)}
                  {s.lens ? ` · ${s.lens}` : ''}
                </div>
                <p className="text-ink">{s.description}</p>
                {s.notes && <p className="text-faint">{s.notes}</p>}
              </div>
            </li>
          ))}
        </ol>
      );
    case 'propose_storyboard_frames':
      return (
        <ol className="space-y-2">
          {a.frames.map((f: any, i: number) => (
            <li key={i} className="flex gap-2.5 text-[12.5px]">
              <span className="w-5 shrink-0 pt-px font-mono text-[11px] text-faint">{i + 1}</span>
              <div className="min-w-0">
                <div className="slate text-[10px]">
                  {shotTypeAbbr(f.shot_type)} · {angleLabel(f.angle)} · {movementLabel(f.movement)}
                  {f.duration_sec ? ` · ${f.duration_sec}s` : ''}
                </div>
                <p className="text-ink">{f.action}</p>
                {f.audio && <p className="text-faint">Audio: {f.audio}</p>}
              </div>
            </li>
          ))}
          <li className="text-[11.5px] text-faint">Frames are added without images — draw or upload them in the Storyboard.</li>
        </ol>
      );
    case 'propose_tasks':
      return (
        <ul className="space-y-1.5">
          {a.tasks.map((t: any, i: number) => {
            const pr = TASK_PRIORITIES.find((x) => x.value === t.priority);
            const sid = refs.itemSceneIds?.[i];
            return (
              <li key={i} className="text-[12.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-ink">{t.title}</span>
                  {pr && <Badge tone={pr.tone}>{pr.label}</Badge>}
                </div>
                <div className="text-[11.5px] text-faint">
                  {[t.due_date && `Due ${formatDate(t.due_date, 'd MMM yyyy')}`, sid && `Scene ${sceneNo(sid) ?? '?'}`].filter(Boolean).join(' · ')}
                </div>
                {t.description && <p className="text-muted">{t.description}</p>}
              </li>
            );
          })}
        </ul>
      );
    case 'propose_scene_updates': {
      const scene = data.scenes.find((s) => s.id === refs.sceneId);
      return (
        <div className="space-y-3">
          {Object.entries(a.changes as Record<string, string>)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => (
              <Change key={k} label={SCENE_LABELS[k]?.[0] ?? k} before={scene ? String(scene[SCENE_LABELS[k]?.[1]] ?? '') : undefined} after={v} />
            ))}
        </div>
      );
    }
    case 'propose_character':
      return (
        <div className="space-y-2 text-[12.5px]">
          <div className="display text-[18px] text-ink">{a.name}</div>
          {Object.entries(a)
            .filter(([k, v]) => k !== 'name' && typeof v === 'string' && v)
            .map(([k, v]) => (
              <div key={k}>
                <div className="eyebrow">{CHAR_LABELS[k] ?? k}</div>
                <p className="whitespace-pre-wrap text-ink">{v as string}</p>
              </div>
            ))}
        </div>
      );
    case 'propose_character_updates': {
      const c = data.characters.find((x) => x.id === refs.characterId);
      return (
        <div className="space-y-3">
          {Object.entries(a.changes as Record<string, string>)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => (
              <Change key={k} label={CHAR_LABELS[k] ?? k} before={c ? String(c[CHAR_KEYS[k]] ?? '') : undefined} after={v} />
            ))}
        </div>
      );
    }
    case 'propose_schedule':
      return (
        <ul className="space-y-2">
          {a.events.map((e: any, i: number) => {
            const ids = refs.eventSceneIds?.[i] ?? [];
            return (
              <li key={i} className="text-[12.5px]">
                <div className="slate text-[10px]">
                  {formatDate(e.date, 'EEE d MMM')} · {formatTime(e.start_time)} · {Math.round(e.duration_min / 6) / 10}h · {EVENT_TYPES.find((t) => t.value === e.type)?.label}
                </div>
                <p className="text-ink">{e.title}</p>
                {ids.length > 0 && <p className="text-faint">Scenes {ids.map((id) => sceneNo(id) ?? '?').join(', ')}</p>}
                {e.notes && <p className="text-muted">{e.notes}</p>}
              </li>
            );
          })}
        </ul>
      );
    case 'propose_script_revision': {
      const proposed = toScriptElements(a.elements);
      const seg = data.script ? segmentScenes(data.script.elements).find((s) => s.sceneId === refs.sceneId) : undefined;
      return (
        <div className="space-y-2">
          <p className="text-[12.5px] text-muted">{a.rationale}</p>
          {compare && seg ? (
            <>
              <div className="eyebrow">Current</div>
              <ScriptLines elements={seg.body} />
              <div className="eyebrow pt-1">Proposed</div>
              <ScriptLines elements={proposed} />
            </>
          ) : (
            <ScriptLines elements={proposed} />
          )}
          {seg && (
            <button className="text-[12px] text-accent hover:underline" onClick={() => setCompare((c) => !c)}>
              {compare ? 'Show proposed only' : 'Compare with current text'}
            </button>
          )}
          <p className="text-[11.5px] text-faint">Replaces this scene’s text only (the heading stays). The current draft is saved as a version first.</p>
        </div>
      );
    }
  }
  return null;
}

function viewLink(projectId: string, proposal: Proposal): { to: string; label: string } | null {
  const { refs } = proposal.input as ProposalPayload;
  const base = `/p/${projectId}`;
  switch (proposal.kind) {
    case 'propose_shots':
      return { to: `${base}/shots?scene=${refs.sceneId}`, label: 'Open shot list' };
    case 'propose_storyboard_frames':
      return { to: `${base}/storyboard?scene=${refs.sceneId}`, label: 'Open storyboard' };
    case 'propose_tasks':
      return { to: `${base}/tasks`, label: 'Open tasks' };
    case 'propose_scene_updates':
      return { to: `${base}/scenes?scene=${refs.sceneId}`, label: 'Open scene' };
    case 'propose_character':
      return proposal.createdRecords?.[0] ? { to: `${base}/characters?character=${proposal.createdRecords[0].id}`, label: 'Open character' } : null;
    case 'propose_character_updates':
      return { to: `${base}/characters?character=${refs.characterId}`, label: 'Open character' };
    case 'propose_schedule':
      return { to: `${base}/schedule`, label: 'Open schedule' };
    case 'propose_script_revision':
      return { to: `${base}/script?scene=${refs.sceneId}`, label: 'Open in script' };
  }
  return null;
}

export function ProposalCard({
  projectId,
  proposal,
  data,
  disabled,
  onApply,
  onDismiss,
  onUndo,
}: {
  projectId: string;
  proposal: Proposal;
  data: PreviewData;
  disabled?: boolean;
  onApply: () => Promise<void>;
  onDismiss: () => Promise<void>;
  onUndo: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<null | 'apply' | 'dismiss' | 'undo'>(null);
  const run = (k: 'apply' | 'dismiss' | 'undo', fn: () => Promise<void>) => async () => {
    setBusy(k);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const link = viewLink(projectId, proposal);
  let status: ReactNode;
  if (proposal.status === 'applied') status = <Badge tone="success" dot>Applied</Badge>;
  else if (proposal.status === 'dismissed') status = <Badge>Dismissed</Badge>;
  else if (proposal.status === 'failed') status = <Badge tone="danger">Couldn’t apply</Badge>;
  else status = <Badge tone="accent">Suggestion — not applied</Badge>;

  return (
    <div className={cn('rounded-md border bg-surface', proposal.status === 'pending' ? 'border-[color-mix(in_srgb,var(--c-accent)_35%,transparent)]' : 'border-line', proposal.status === 'dismissed' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
        <p className="min-w-0 text-[12.5px] font-medium text-ink">{proposalSummary(proposal)}</p>
        <div className="shrink-0">{status}</div>
      </div>
      {proposal.status !== 'dismissed' && (
        <div className="px-3 py-2.5">
          <Preview proposal={proposal} data={data} />
        </div>
      )}
      {proposal.error && <p className="px-3 pb-2 text-[12px] text-danger">{proposal.error}</p>}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
        {(proposal.status === 'pending' || proposal.status === 'failed') && (
          <>
            <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} loading={busy === 'apply'} disabled={disabled || !!busy} onClick={run('apply', onApply)}>
              Apply
            </Button>
            <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} loading={busy === 'dismiss'} disabled={disabled || !!busy} onClick={run('dismiss', onDismiss)}>
              Dismiss
            </Button>
            {disabled && <span className="text-[11.5px] text-faint">Available when the reply finishes</span>}
          </>
        )}
        {proposal.status === 'applied' && (
          <>
            <Button size="sm" variant="secondary" icon={<Undo2 className="size-3.5" />} loading={busy === 'undo'} disabled={!!busy} onClick={run('undo', onUndo)}>
              Undo
            </Button>
            {link && (
              <Link to={link.to} className="btn btn-ghost btn-sm">
                {link.label} <ArrowRight className="size-3.5" />
              </Link>
            )}
          </>
        )}
        {proposal.status === 'dismissed' && (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={run('dismiss', onDismiss)} icon={<RotateCcw className="size-3.5" />}>
            Show again
          </Button>
        )}
      </div>
    </div>
  );
}
