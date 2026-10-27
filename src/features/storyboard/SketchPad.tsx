import { Circle, Eraser, Grid3x3, Minus, Pencil, Redo2, Square, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, cn, Dialog, IconButton, toastError, useConfirm } from '@/components/ui';
import { addAsset, getAssetBlob } from '@/lib/data/assets';
import type { AssetLinks } from '@/lib/types';

const W = 1600;
const H = 900;

type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse';
type Pt = [number, number];
interface Shape {
  tool: Tool;
  color: string;
  size: number;
  points: Pt[];
}

const COLORS = [
  { value: '#151515', label: 'Ink' },
  { value: '#5c5c5c', label: 'Graphite' },
  { value: '#a3a3a3', label: 'Light grey' },
  { value: '#ffffff', label: 'White' },
  { value: '#c58a2a', label: 'Amber' },
  { value: '#b8322a', label: 'Red' },
];
const SIZES = [3, 6, 12, 24];

const TOOLS: { value: Tool; label: string; icon: typeof Pencil; key: string }[] = [
  { value: 'pen', label: 'Pencil (P)', icon: Pencil, key: 'p' },
  { value: 'eraser', label: 'Eraser (E)', icon: Eraser, key: 'e' },
  { value: 'line', label: 'Line (L)', icon: Minus, key: 'l' },
  { value: 'rect', label: 'Rectangle (R)', icon: Square, key: 'r' },
  { value: 'ellipse', label: 'Ellipse (O)', icon: Circle, key: 'o' },
];

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.color;
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  const pts = s.points;
  if (!pts.length) return ctx.restore();
  ctx.beginPath();
  if (s.tool === 'pen' || s.tool === 'eraser') {
    if (pts.length === 1) {
      ctx.arc(pts[0][0], pts[0][1], s.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      return ctx.restore();
    }
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  } else {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (s.tool === 'line') {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    } else if (s.tool === 'rect') {
      ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    } else {
      ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * A 16:9 drawing surface for quick compositions. Strokes are kept as vectors,
 * so undo is cheap and the eraser only removes ink (never the background image).
 */
export function SketchPad({
  open,
  onOpenChange,
  projectId,
  title,
  backgroundAssetId,
  links,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  title: string;
  backgroundAssetId?: string;
  links?: Partial<AssetLinks>;
  onSaved: (assetId: string) => void;
}) {
  const confirm = useConfirm();
  const baseRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[1]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [redo, setRedo] = useState<Shape[][]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [thirds, setThirds] = useState(true);
  const [saving, setSaving] = useState(false);
  const current = useRef<Shape | null>(null);
  const frame = useRef<number | null>(null);

  // Reset whenever the pad opens.
  useEffect(() => {
    if (!open) return;
    setShapes([]);
    setHistory([]);
    setRedo([]);
    setTool('pen');
  }, [open]);

  // Paper and optional background image.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const paint = async () => {
      // The canvas mounts with the dialog; wait a frame for it.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const c = baseRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      if (!backgroundAssetId) return;
      const blob = await getAssetBlob(backgroundAssetId);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        if (cancelled) return;
        const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
        const iw = img.naturalWidth * scale;
        const ih = img.naturalHeight * scale;
        ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
      } catch {
        /* unreadable background: draw on paper instead */
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    void paint();
    return () => {
      cancelled = true;
    };
  }, [open, backgroundAssetId]);

  const render = useCallback(() => {
    const ctx = inkRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const s of shapes) drawShape(ctx, s);
    if (current.current) drawShape(ctx, current.current);
  }, [shapes]);

  useEffect(() => {
    render();
  }, [render]);

  const schedule = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      render();
    });
  };

  const toCanvas = (e: ReactPointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? 0.5 + e.pressure : 1;
    current.current = { tool, color, size: (tool === 'eraser' ? size * 2.5 : size) * pressure, points: [p] };
    schedule();
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    const p = toCanvas(e);
    if (s.tool === 'pen' || s.tool === 'eraser') s.points.push(p);
    else s.points = [s.points[0], p];
    schedule();
  };
  const onUp = () => {
    const s = current.current;
    if (!s) return;
    current.current = null;
    setHistory([...history, shapes]);
    setRedo([]);
    setShapes([...shapes, s]);
  };

  const undo = () => {
    if (!history.length) return;
    setRedo([...redo, shapes]);
    setShapes(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };
  const redoFn = () => {
    if (!redo.length) return;
    setHistory([...history, shapes]);
    setShapes(redo[redo.length - 1]);
    setRedo(redo.slice(0, -1));
  };
  const clear = () => {
    if (!shapes.length) return;
    setHistory([...history, shapes]);
    setRedo([]);
    setShapes([]);
  };

  // Re-subscribed every render so the handlers always see current history.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoFn();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t && !(e.target instanceof HTMLInputElement)) setTool(t.value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dirty = shapes.length > 0;

  const close = async () => {
    if (dirty && !(await confirm({ title: 'Discard this sketch?', message: 'Your drawing hasn’t been saved to the frame.', confirmLabel: 'Discard', danger: true }))) return;
    onOpenChange(false);
  };

  const save = async () => {
    const base = baseRef.current;
    const ink = inkRef.current;
    if (!base || !ink) return;
    setSaving(true);
    try {
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const ctx = out.getContext('2d')!;
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(ink, 0, 0);
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
      if (!blob) throw new Error('The drawing could not be exported.');
      const file = new File([blob], `${title.replace(/[\\/:*?"<>|]+/g, '-')}.png`, { type: 'image/png' });
      const asset = await addAsset(projectId, file, { category: 'storyboard', links, description: 'Drawn in SCENEFORGE' });
      onSaved(asset.id);
      onOpenChange(false);
    } catch (e) {
      toastError(e, 'Sketch not saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : void close())}
      title="Sketch"
      description={`${title} · Draw a composition. Pencil and stylus pressure are supported.`}
      size="xl"
      modalLock
      footer={
        <>
          <span className="mr-auto hidden text-[11.5px] text-faint sm:block">⌘/Ctrl+Z undo · ⇧ for redo · P E L R O switch tools</span>
          <Button variant="ghost" onClick={() => void close()}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!dirty && !backgroundAssetId} onClick={() => void save()}>
            Save to frame
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-0.5 rounded-sm border border-line-strong bg-surface p-0.5" role="radiogroup" aria-label="Tool">
          {TOOLS.map((t) => (
            <IconButton key={t.value} label={t.label} active={tool === t.value} onClick={() => setTool(t.value)} size="sm" role="radio" aria-checked={tool === t.value}>
              <t.icon className="size-4" />
            </IconButton>
          ))}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Stroke size">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={size === s}
              aria-label={`Stroke ${s}px`}
              title={`Stroke ${s}px`}
              onClick={() => setSize(s)}
              className={cn('flex size-7 items-center justify-center rounded-sm', size === s ? 'bg-hover ring-1 ring-line-strong' : 'hover:bg-hover')}
            >
              <span className="rounded-full bg-ink" style={{ width: Math.max(3, s / 2.2), height: Math.max(3, s / 2.2) }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.label}
              title={c.label}
              onClick={() => {
                setColor(c.value);
                if (tool === 'eraser') setTool('pen');
              }}
              className={cn('size-6 rounded-full border border-line-strong', color === c.value && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}
              style={{ background: c.value }}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label="Rule-of-thirds guides" active={thirds} onClick={() => setThirds((t) => !t)} size="sm">
            <Grid3x3 className="size-4" />
          </IconButton>
          <IconButton label="Undo" onClick={undo} disabled={!history.length} size="sm">
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton label="Redo" onClick={redoFn} disabled={!redo.length} size="sm">
            <Redo2 className="size-4" />
          </IconButton>
          <IconButton label="Clear drawing" onClick={clear} disabled={!shapes.length} size="sm">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-line-strong bg-white shadow-soft">
        <canvas ref={baseRef} width={W} height={H} className="absolute inset-0 size-full" />
        <canvas
          ref={inkRef}
          width={W}
          height={H}
          className={cn('absolute inset-0 size-full touch-none', tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Drawing canvas"
          role="img"
        />
        {thirds && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute inset-y-0 left-1/3 border-l border-dashed border-black/15" />
            <div className="absolute inset-y-0 left-2/3 border-l border-dashed border-black/15" />
            <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-black/15" />
            <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-black/15" />
          </div>
        )}
      </div>
    </Dialog>
  );
}
