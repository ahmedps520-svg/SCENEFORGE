import { Link2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Avatar, Button, cn, Dialog, EmptyState, Field, Input, Textarea, toastError } from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeRelationship } from '@/lib/data/factories';
import type { Character, Relationship } from '@/lib/types';

interface Pos {
  x: number;
  y: number;
}

const clamp = (v: number) => Math.max(0.06, Math.min(0.94, v));

/** Default circular layout for characters that haven't been placed yet. */
function defaultPositions(characters: Character[]): Map<string, Pos> {
  const n = characters.length;
  const m = new Map<string, Pos>();
  characters.forEach((c, i) => {
    if (n === 1) m.set(c.id, { x: 0.5, y: 0.5 });
    else {
      // Two characters sit side by side; larger casts start from the top.
      const a = (2 * Math.PI * i) / n + (n === 2 ? Math.PI : -Math.PI / 2);
      m.set(c.id, { x: 0.5 + Math.cos(a) * 0.36, y: 0.5 + Math.sin(a) * 0.36 });
    }
  });
  return m;
}

export function RelationshipMap({
  projectId,
  characters,
  relationships,
  actorNames,
  onOpen,
}: {
  projectId: string;
  characters: Character[];
  relationships: Relationship[];
  actorNames: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [dragPos, setDragPos] = useState<Map<string, Pos>>(new Map());
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [connect, setConnect] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ fromId: string; toId: string } | null>(null);
  const [editing, setEditing] = useState<Relationship | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setSize({ w, h: Math.max(380, Math.min(680, w * 0.6)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const defaults = useMemo(() => defaultPositions(characters), [characters]);
  const pos = (c: Character): Pos => dragPos.get(c.id) ?? (c.mapX !== undefined && c.mapY !== undefined ? { x: c.mapX, y: c.mapY } : defaults.get(c.id)!);
  const byId = new Map(characters.map((c) => [c.id, c]));

  const onPointerDown = (e: RPointerEvent, c: Character) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: c.id, startX: e.clientX, startY: e.clientY, moved: false };
  };

  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const r = box.current.getBoundingClientRect();
    setDragPos((m) => new Map(m).set(d.id, { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }));
  };

  const onPointerUp = async (c: Character) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const p = dragPos.get(c.id);
      if (p) {
        try {
          await updateRecord<Character>('characters', c.id, { mapX: p.x, mapY: p.y }, { silent: true });
        } catch (e) {
          toastError(e, 'Position not saved');
        }
        setDragPos((m) => {
          const n = new Map(m);
          n.delete(c.id);
          return n;
        });
      }
      return;
    }
    // A click, not a drag.
    if (connect) {
      if (!source) setSource(c.id);
      else if (source === c.id) setSource(null);
      else {
        setDraft({ fromId: source, toId: c.id });
        setSource(null);
      }
    } else onOpen(c.id);
  };

  if (characters.length < 2) {
    return (
      <EmptyState compact icon={<Link2 className="size-5" />} title="Add at least two characters">
        The relationship map connects characters — family, rivals, allies — so the web of the story is visible at a glance.
      </EmptyState>
    );
  }

  // Offset parallel edges between the same pair so their labels don't overlap.
  const pairIndex = new Map<string, number>();
  const edges = relationships
    .filter((r) => byId.has(r.fromId) && byId.has(r.toId))
    .map((r) => {
      const key = [r.fromId, r.toId].sort().join(':');
      const k = pairIndex.get(key) ?? 0;
      pairIndex.set(key, k + 1);
      return { r, k };
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">
          {connect
            ? source
              ? `Now click the character ${byId.get(source)?.name} relates to.`
              : 'Click the first character of the pair.'
            : 'Drag to arrange · Click a character to open their profile · Click a label to edit it'}
        </p>
        <Button
          size="sm"
          variant={connect ? 'primary' : 'secondary'}
          icon={<Link2 className="size-3.5" />}
          onClick={() => {
            setConnect((v) => !v);
            setSource(null);
          }}
        >
          {connect ? 'Done connecting' : 'Connect characters'}
        </Button>
      </div>
      <div
        ref={box}
        className={cn('relative w-full select-none overflow-hidden rounded-md border border-line bg-surface', connect && 'ring-1 ring-accent/50')}
        style={{ height: size.h, backgroundImage: 'radial-gradient(circle, var(--c-line) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        onPointerMove={onPointerMove}
      >
        <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden>
          {edges.map(({ r, k }) => {
            const a = pos(byId.get(r.fromId)!);
            const b = pos(byId.get(r.toId)!);
            const [x1, y1, x2, y2] = [a.x * size.w, a.y * size.h, b.x * size.w, b.y * size.h];
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const off = k * 16;
            const nx = (-(y2 - y1) / len) * off;
            const ny = ((x2 - x1) / len) * off;
            return <line key={r.id} x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} stroke="var(--c-line-strong)" strokeWidth={1.4} />;
          })}
        </svg>

        {edges.map(({ r, k }) => {
          const a = pos(byId.get(r.fromId)!);
          const b = pos(byId.get(r.toId)!);
          const [x1, y1, x2, y2] = [a.x * size.w, a.y * size.h, b.x * size.w, b.y * size.h];
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const off = k * 16;
          const mx = (x1 + x2) / 2 + (-(y2 - y1) / len) * off;
          const my = (y1 + y2) / 2 + ((x2 - x1) / len) * off;
          return (
            <button
              key={r.id}
              onClick={() => setEditing(r)}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-xs border border-line-strong bg-raised px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-ink"
              style={{ left: mx, top: my }}
              title={`${byId.get(r.fromId)?.name} → ${byId.get(r.toId)?.name}${r.description ? `: ${r.description}` : ''}`}
            >
              {r.label || 'related'}
            </button>
          );
        })}

        {characters.map((c) => {
          const p = pos(c);
          const actor = c.actorId ? actorNames.get(c.actorId) : undefined;
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              aria-label={`${c.name}${connect ? ' — select for connection' : ' — open profile'}`}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(c.id)}
              onPointerDown={(e) => onPointerDown(e, c)}
              onPointerUp={() => void onPointerUp(c)}
              className={cn(
                'absolute flex -translate-x-1/2 -translate-y-1/2 touch-none flex-col items-center gap-1 cursor-grab active:cursor-grabbing',
                dragPos.has(c.id) && 'z-10',
              )}
              style={{ left: p.x * size.w, top: p.y * size.h }}
            >
              <span className={cn('rounded-full p-0.5 transition-shadow', source === c.id ? 'ring-2 ring-accent' : 'ring-1 ring-transparent hover:ring-line-strong')}>
                <Avatar name={c.name} assetId={c.portraitAssetId} size={52} />
              </span>
              <span className="max-w-[120px] truncate rounded-xs bg-bg/80 px-1.5 text-center text-[12px] font-medium text-ink">{c.name}</span>
              {actor && <span className="-mt-1 max-w-[120px] truncate text-[10.5px] text-faint">{actor}</span>}
            </div>
          );
        })}
      </div>

      <NewRelationshipDialog
        draft={draft}
        names={draft ? [byId.get(draft.fromId)?.name ?? '', byId.get(draft.toId)?.name ?? ''] : ['', '']}
        onClose={() => setDraft(null)}
        onCreate={async (label, description) => {
          if (!draft) return;
          try {
            await createRecord('relationships', makeRelationship(projectId, draft.fromId, draft.toId, { label, description }), {
              summary: `Linked ${byId.get(draft.fromId)?.name} and ${byId.get(draft.toId)?.name}${label ? ` (${label})` : ''}`,
            });
            setDraft(null);
          } catch (e) {
            toastError(e, 'Relationship not saved');
          }
        }}
      />
      <EditRelationshipDialog
        relationship={editing}
        names={editing ? [byId.get(editing.fromId)?.name ?? '', byId.get(editing.toId)?.name ?? ''] : ['', '']}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function NewRelationshipDialog({ draft, names, onClose, onCreate }: { draft: { fromId: string; toId: string } | null; names: [string, string] | string[]; onClose: () => void; onCreate: (label: string, description: string) => Promise<void> }) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    setLabel('');
    setDescription('');
  }, [draft]);
  return (
    <Dialog
      open={!!draft}
      onOpenChange={(o) => !o && onClose()}
      title="New relationship"
      description={`${names[0]} → ${names[1]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => void onCreate(label.trim(), description.trim())}>
            Connect
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Relationship" hint="How the first relates to the second, e.g. “older sister”, “owes money to”, “mentor”.">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus placeholder="e.g. rival" onKeyDown={(e) => e.key === 'Enter' && void onCreate(label.trim(), description.trim())} />
        </Field>
        <Field label="Details" optional>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="History, tension, what changes over the story…" />
        </Field>
      </div>
    </Dialog>
  );
}

function EditRelationshipDialog({ relationship, names, onClose }: { relationship: Relationship | null; names: string[]; onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const remove = useDeleteEntity();
  useEffect(() => {
    setLabel(relationship?.label ?? '');
    setDescription(relationship?.description ?? '');
  }, [relationship]);
  const save = async () => {
    if (!relationship) return;
    try {
      await updateRecord<Relationship>('relationships', relationship.id, { label: label.trim(), description: description.trim() });
      onClose();
    } catch (e) {
      toastError(e, 'Not saved');
    }
  };
  return (
    <Dialog
      open={!!relationship}
      onOpenChange={(o) => !o && onClose()}
      title="Relationship"
      description={`${names[0]} → ${names[1]}`}
      footer={
        <>
          <Button
            variant="danger-ghost"
            icon={<Trash2 className="size-4" />}
            className="mr-auto"
            onClick={async () => {
              if (relationship && (await remove('relationship', relationship.id, { skipConfirm: true }))) onClose();
            }}
          >
            Remove
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Relationship">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && void save()} />
        </Field>
        <Field label="Details" optional>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
      </div>
    </Dialog>
  );
}
