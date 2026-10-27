import { FileUp, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, cn, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { REVISION_COLORS } from '@/lib/constants';
import { parseScreenplayFile, SCREENPLAY_ACCEPT, SCREENPLAY_FORMATS_TEXT } from '@/lib/screenplay/importFile';
import { scriptStats } from '@/lib/screenplay/paginate';
import { cueName } from '@/lib/screenplay/sync';
import type { RevisionColor, ScriptElement, TitlePage } from '@/lib/types';
import { SHORTCUTS } from './Editor';

function RevisionPicker({ value, onChange }: { value: RevisionColor; onChange: (c: RevisionColor) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Revision colour">
      {REVISION_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          onClick={() => onChange(c.value)}
          className={cn('flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[12px]', value === c.value ? 'border-accent text-ink' : 'border-line-strong text-muted hover:text-ink')}
        >
          <span className="size-2.5 rounded-full border border-black/20" style={{ background: c.swatch }} />
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  initial = '',
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  initial?: string;
  confirmLabel: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(initial);
      setError(null);
    }
  }, [open, initial]);
  const submit = async () => {
    if (!name.trim()) {
      setError('Give the draft a name.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="Draft name" error={error}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} invalid={!!error} placeholder="e.g. Second Draft" />
      </Field>
    </Dialog>
  );
}

export function DraftSettingsDialog({
  open,
  onOpenChange,
  name,
  color,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  color: RevisionColor;
  onSubmit: (name: string, color: RevisionColor) => Promise<void>;
}) {
  const [n, setN] = useState(name);
  const [c, setC] = useState(color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setN(name);
      setC(color);
      setError(null);
    }
  }, [open, name, color]);
  const submit = async () => {
    if (!n.trim()) return setError('Give the draft a name.');
    setBusy(true);
    try {
      await onSubmit(n.trim(), c);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Draft settings"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Draft name" error={error}>
          <Input autoFocus value={n} onChange={(e) => setN(e.target.value)} invalid={!!error} />
        </Field>
        <Field label="Revision colour" hint="Production convention for revised pages: White, then Blue, Pink, Yellow, Green, Goldenrod… Shown in the PDF header when not White.">
          <RevisionPicker value={c} onChange={setC} />
        </Field>
      </div>
    </Dialog>
  );
}

export function SaveVersionDialog({
  open,
  onOpenChange,
  color,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  color: RevisionColor;
  onSubmit: (label: string, color: RevisionColor) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [c, setC] = useState(color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setLabel('');
      setC(color);
      setError(null);
    }
  }, [open, color]);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(label.trim() || 'Saved version', c);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Save a version"
      description="A snapshot of the draft as it is now. You can compare with it or restore it any time from version history."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Save version
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Label" error={error}>
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} placeholder="e.g. Table read draft" maxLength={80} />
        </Field>
        <Field label="Revision colour" hint="Changing it also marks the draft with this colour from now on.">
          <RevisionPicker value={c} onChange={setC} />
        </Field>
      </div>
    </Dialog>
  );
}

const TP_FIELDS: { key: keyof TitlePage; label: string; multiline?: boolean; placeholder: string }[] = [
  { key: 'title', label: 'Title', placeholder: 'THE LONG NIGHT' },
  { key: 'credit', label: 'Credit', placeholder: 'Written by' },
  { key: 'author', label: 'Author(s)', multiline: true, placeholder: 'Your name' },
  { key: 'source', label: 'Source', multiline: true, placeholder: 'Based on the novel by…' },
  { key: 'draftDate', label: 'Draft date', placeholder: 'October 2026' },
  { key: 'contact', label: 'Contact', multiline: true, placeholder: 'Agent, email or phone' },
];

export function TitlePageDialog({ open, onOpenChange, value, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; value: TitlePage; onSubmit: (tp: TitlePage) => Promise<void> }) {
  const [tp, setTp] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setTp(value);
  }, [open, value]);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(tp);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Title page"
      description="Printed as the first page of PDF exports and included in Fountain and Final Draft files."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Save title page
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {TP_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} className={f.multiline ? 'sm:col-span-1' : undefined}>
            {f.multiline ? (
              <Textarea rows={2} value={tp[f.key]} placeholder={f.placeholder} onChange={(e) => setTp({ ...tp, [f.key]: e.target.value })} />
            ) : (
              <Input value={tp[f.key]} placeholder={f.placeholder} onChange={(e) => setTp({ ...tp, [f.key]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
    </Dialog>
  );
}

export interface PdfOptions {
  includeTitlePage: boolean;
  showSceneNumbers: boolean;
  pageSize: 'letter' | 'a4';
}

export function ExportPdfDialog({ open, onOpenChange, defaults, onExport }: { open: boolean; onOpenChange: (o: boolean) => void; defaults: PdfOptions; onExport: (o: PdfOptions) => Promise<void> }) {
  const [o, setO] = useState(defaults);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setO(defaults);
  }, [open, defaults]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export PDF"
      description="Standard screenplay format: Courier 12pt, industry margins, page numbers, (MORE) and (CONT'D) where dialogue breaks across pages."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onExport(o);
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            Download PDF
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Checkbox checked={o.includeTitlePage} onChange={(v) => setO({ ...o, includeTitlePage: v })} label="Include title page" />
        <Checkbox checked={o.showSceneNumbers} onChange={(v) => setO({ ...o, showSceneNumbers: v })} label="Print scene numbers" />
        <Field label="Paper size">
          <Select value={o.pageSize} onChange={(e) => setO({ ...o, pageSize: e.target.value as PdfOptions['pageSize'] })}>
            <option value="letter">US Letter</option>
            <option value="a4">A4</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export interface ImportChoice {
  mode: 'replace' | 'new';
  elements: ScriptElement[];
  titlePage?: Partial<TitlePage>;
  name: string;
}

export function ImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (o: boolean) => void; onImport: (c: ImportChoice) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ elements: ScriptElement[]; titlePage: Partial<TitlePage>; format: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'replace' | 'new'>('new');
  const [name, setName] = useState('');
  const [useTitle, setUseTitle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setParsed(null);
      setError(null);
      setMode('new');
      setBusy(false);
    }
  }, [open]);

  const take = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setParsed(null);
    try {
      const p = await parseScreenplayFile(f);
      setParsed(p);
      setName(p.titlePage.title?.trim() || f.name.replace(/\.[^.]+$/, ''));
      setUseTitle(Object.values(p.titlePage).some((v) => v && String(v).trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stats = parsed ? scriptStats(parsed.elements) : null;
  const speakers = parsed ? new Set(parsed.elements.filter((e) => e.type === 'character').map((e) => cueName(e.text))).size : 0;
  const hasTitle = parsed ? Object.values(parsed.titlePage).some((v) => v && String(v).trim()) : false;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import a screenplay"
      description={SCREENPLAY_FORMATS_TEXT}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!parsed || (mode === 'new' && !name.trim())}
            loading={busy}
            onClick={async () => {
              if (!parsed) return;
              setBusy(true);
              try {
                await onImport({ mode, elements: parsed.elements, titlePage: useTitle && hasTitle ? parsed.titlePage : undefined, name: name.trim() });
                onOpenChange(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void take(e.dataTransfer.files[0]);
          }}
          className={cn('flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-7 text-center', drag ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-hover')}
        >
          {file && !parsed && !error ? <Loader2 className="size-5 animate-spin text-muted" /> : <FileUp className="size-5 text-accent" />}
          <span className="text-[13px] text-ink">{file ? file.name : 'Choose a file or drop it here'}</span>
          <span className="text-[11.5px] text-faint">.fountain · .spmd · .txt · .fdx</span>
        </button>
        <input ref={input} type="file" accept={SCREENPLAY_ACCEPT} className="hidden" onChange={(e) => void take(e.target.files?.[0] ?? undefined).finally(() => (e.target.value = ''))} />
        {error && (
          <p role="alert" className="rounded-sm border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}
        {parsed && stats && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-surface p-3 text-center">
              <div>
                <div className="font-mono text-[16px] text-ink">{stats.sceneCount}</div>
                <div className="eyebrow">Scenes</div>
              </div>
              <div>
                <div className="font-mono text-[16px] text-ink">{stats.pageCount}</div>
                <div className="eyebrow">Pages</div>
              </div>
              <div>
                <div className="font-mono text-[16px] text-ink">{speakers}</div>
                <div className="eyebrow">Speaking roles</div>
              </div>
            </div>
            <div className="space-y-2" role="radiogroup" aria-label="Import as">
              <label className={cn('flex cursor-pointer gap-3 rounded-md border p-3', mode === 'new' ? 'border-accent bg-accent-soft' : 'border-line')}>
                <input type="radio" className="mt-1 accent-[var(--c-accent)]" checked={mode === 'new'} onChange={() => setMode('new')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">Import as a new draft</span>
                  <span className="block text-[12px] text-faint">Your current draft stays exactly as it is.</span>
                  {mode === 'new' && <Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Draft name" aria-label="New draft name" />}
                </span>
              </label>
              <label className={cn('flex cursor-pointer gap-3 rounded-md border p-3', mode === 'replace' ? 'border-accent bg-accent-soft' : 'border-line')}>
                <input type="radio" className="mt-1 accent-[var(--c-accent)]" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                <span>
                  <span className="block text-[13px] text-ink">Replace the text of this draft</span>
                  <span className="block text-[12px] text-faint">The current text is saved as a version first and the import can be undone. Scenes from the old text stay in your breakdown, marked “not in script”.</span>
                </span>
              </label>
            </div>
            {hasTitle && <Checkbox checked={useTitle} onChange={setUseTitle} label="Use the title page from this file" />}
          </>
        )}
      </div>
    </Dialog>
  );
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Writing shortcuts" size="md">
      <dl className="grid gap-x-5 gap-y-2.5 text-[13px] sm:grid-cols-[auto_1fr]">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <span className="kbd px-1.5">{k}</span>
            </dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
        <div className="contents">
          <dt>
            <span className="kbd px-1.5">⇧ Enter</span>
          </dt>
          <dd className="text-muted">Line break inside action or dialogue</dd>
        </div>
        <div className="contents">
          <dt>
            <span className="kbd px-1.5">Paste</span>
          </dt>
          <dd className="text-muted">Multi-line text in Fountain format is formatted into elements automatically</dd>
        </div>
      </dl>
      <p className="mt-5 text-[12.5px] text-faint">
        Formatting happens as you type: lines starting with INT. or EXT. become scene headings, a known character’s name in capitals becomes a cue, and capitals ending in TO:
        become a transition. Any automatic change can be reverted with a single undo.
      </p>
    </Dialog>
  );
}
