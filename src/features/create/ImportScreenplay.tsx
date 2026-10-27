import { ArrowRight, ClipboardPaste, FileText, FileUp, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Checkbox, cn, Field, Input, Select, Textarea, toast, toastError } from '@/components/ui';
import { GENRES, PRODUCTION_TYPES } from '@/lib/constants';
import { formatSeconds } from '@/lib/dates';
import { createProject, titleCase } from '@/lib/data/projects';
import { updateSettings } from '@/lib/data/settings';
import { requestPersistentStorage } from '@/lib/db';
import { parseFountain } from '@/lib/screenplay/fountain';
import { parseScreenplayFile, SCREENPLAY_ACCEPT, SCREENPLAY_FORMATS_TEXT } from '@/lib/screenplay/importFile';
import { displayText, LAYOUT, scriptStats } from '@/lib/screenplay/paginate';
import { cueName } from '@/lib/screenplay/sync';
import type { ProductionType, ScriptElement, TitlePage } from '@/lib/types';
import { StudioBar } from '../dashboard/StudioBar';

interface Parsed {
  elements: ScriptElement[];
  titlePage: Partial<TitlePage>;
  source: string;
  format: 'fountain' | 'fdx';
}

function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base === base.toLowerCase() || base === base.toUpperCase() ? titleCase(base) : base;
}

function suggestType(pages: number): ProductionType {
  if (pages >= 70) return 'feature';
  if (pages <= 4) return 'skit';
  return 'short';
}

export default function ImportScreenplay() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  useEffect(() => {
    document.title = 'Import a screenplay — SCENEFORGE';
  }, []);
  return (
    <div className="min-h-dvh pb-24">
      <StudioBar back={{ to: '/', label: 'Studio' }} title="Import a screenplay" />
      <main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        {parsed ? <Review parsed={parsed} onReset={() => setParsed(null)} /> : <Source onParsed={setParsed} />}
      </main>
    </div>
  );
}

function Source({ onParsed }: { onParsed: (p: Parsed) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await parseScreenplayFile(file);
      if (!r.elements.length) throw new Error('No screenplay content was found in this file.');
      onParsed({ elements: r.elements, titlePage: r.titlePage, source: file.name, format: r.format });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file couldn’t be read.');
    } finally {
      setBusy(false);
    }
  };

  const readText = () => {
    const r = parseFountain(text);
    if (!r.elements.length) {
      setError('No screenplay content was found in the pasted text.');
      return;
    }
    setError(null);
    onParsed({ elements: r.elements, titlePage: r.titlePage, source: 'Pasted text', format: 'fountain' });
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <div className="eyebrow">Import</div>
      <h1 className="display mt-1.5 text-[40px] text-ink sm:text-[48px]">Bring in your screenplay</h1>
      <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
        SCENEFORGE reads the file on this device, formats every element, numbers the scenes and builds a scene breakdown. Your original file isn’t changed.
      </p>

      <div className="mt-8 flex gap-5 border-b border-line">
        {(['file', 'paste'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn('-mb-px flex items-center gap-2 border-b py-2.5 text-[13px]', mode === m ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {m === 'file' ? <FileUp className="size-3.5" /> : <ClipboardPaste className="size-3.5" />}
            {m === 'file' ? 'Upload a file' : 'Paste Fountain text'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void readFile(e.dataTransfer.files[0]);
          }}
          className={cn('mt-6 flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-16 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-line-strong')}
        >
          <span className="flex size-12 items-center justify-center rounded-full border border-line-strong text-accent">
            <FileText className="size-5" />
          </span>
          <p className="display mt-4 text-[24px] text-ink">{busy ? 'Reading…' : 'Drop a screenplay here'}</p>
          <p className="mt-1.5 text-[12.5px] text-faint">{SCREENPLAY_FORMATS_TEXT}</p>
          <Button variant="primary" className="mt-6" onClick={() => input.current?.click()} loading={busy}>
            Choose file
          </Button>
          <input
            ref={input}
            type="file"
            accept={SCREENPLAY_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <p className="mt-6 max-w-md text-[12px] leading-relaxed text-faint">
            Using Final Draft, Highland, WriterDuet, Fade In or Celtx? Export as Fountain or .fdx. PDF and Word files can’t be imported — their formatting can’t be read back reliably.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <Field label="Fountain text" htmlFor="paste-fountain" hint="Scene headings start with INT. or EXT.; character names are in capitals above their dialogue.">
            <Textarea
              id="paste-fountain"
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-script text-[13px]"
              placeholder={'INT. LIGHTHOUSE - NIGHT\n\nWaves hammer the glass.\n\nMARA\nDo you hear that?'}
            />
          </Field>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={readText} disabled={!text.trim()} iconRight={<ArrowRight className="size-4" />}>
              Read screenplay
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-sm border border-danger bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Review({ parsed, onReset }: { parsed: Parsed; onReset: () => void }) {
  const navigate = useNavigate();
  const stats = useMemo(() => scriptStats(parsed.elements), [parsed]);
  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const e of parsed.elements) if (e.type === 'character') {
      const n = cueName(e.text);
      if (n) set.add(n);
    }
    return [...set];
  }, [parsed]);
  const scenes = useMemo(() => parsed.elements.filter((e) => e.type === 'scene' && e.text.trim()), [parsed]);

  const [title, setTitle] = useState(() => parsed.titlePage.title?.trim() || (parsed.source === 'Pasted text' ? '' : titleFromFilename(parsed.source)));
  const [genre, setGenre] = useState('');
  const [type, setType] = useState<ProductionType>(() => suggestType(stats.pages));
  const [makeCharacters, setMakeCharacters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      setError('Give the film a title.');
      return;
    }
    setBusy(true);
    try {
      const project = await createProject({
        title,
        genres: genre ? [genre] : [],
        productionType: type,
        elements: parsed.elements,
        titlePage: { ...parsed.titlePage, title: parsed.titlePage.title || title.trim() },
        draftTitle: 'Imported draft',
        createCharactersFromCues: makeCharacters,
      });
      await updateSettings({ onboardingComplete: true });
      void requestPersistentStorage();
      toast(`Imported “${project.title}”`, {
        detail: `${scenes.length} scene${scenes.length === 1 ? '' : 's'}${makeCharacters && roles.length ? ` and ${roles.length} character profile${roles.length === 1 ? '' : 's'}` : ''} created.`,
      });
      navigate(`/p/${project.id}/script`);
    } catch (e) {
      toastError(e, 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] animate-fade-in">
      <section className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Preview · {parsed.source}</div>
            <h1 className="display mt-1.5 text-[36px] text-ink">{parsed.titlePage.title || 'Untitled screenplay'}</h1>
            {parsed.titlePage.author && <p className="mt-1 text-[13px] text-muted">by {parsed.titlePage.author}</p>}
          </div>
          <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={onReset}>
            Choose a different file
          </Button>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
          {[
            ['Scenes', String(scenes.length)],
            ['Speaking roles', String(roles.length)],
            ['Pages', stats.pages.toFixed(1)],
            ['Est. runtime', formatSeconds(stats.runtimeSec)],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface p-4">
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-1.5 font-mono text-[20px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <ScreenplayPreview elements={parsed.elements} />
      </section>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-md border border-line bg-surface p-5">
          <h2 className="display text-[26px] text-ink">Create the project</h2>
          <div className="mt-5 space-y-4">
            <Field label="Film title" error={error} htmlFor="import-title">
              <Input
                id="import-title"
                value={title}
                autoFocus
                maxLength={120}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) setError(null);
                }}
                invalid={!!error}
                placeholder="Title"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Genre" optional htmlFor="import-genre">
                <Select id="import-genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
                  <option value="">None yet</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type" htmlFor="import-type">
                <Select id="import-type" value={type} onChange={(e) => setType(e.target.value as ProductionType)}>
                  {PRODUCTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {roles.length > 0 && (
              <div className="rounded-sm border border-line p-3">
                <Checkbox checked={makeCharacters} onChange={setMakeCharacters} label={`Create character profiles for ${roles.length} speaking role${roles.length === 1 ? '' : 's'}`} />
                <p className="mt-2 pl-6 text-[12px] leading-relaxed text-faint">
                  {roles.slice(0, 14).map(titleCase).join(', ')}
                  {roles.length > 14 ? ` and ${roles.length - 14} more` : ''}. They’re linked to the scenes they speak in.
                </p>
              </div>
            )}
          </div>
          <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => void submit()} loading={busy} iconRight={<ArrowRight className="size-4" />}>
            Import and open script
          </Button>
          <p className="mt-3 text-[11.5px] leading-relaxed text-faint">The screenplay becomes the film’s production draft. Fountain emphasis markers (*italic*, **bold**) are kept as written.</p>
        </div>
      </aside>
    </div>
  );
}

/** A faithful-looking excerpt of the imported pages, in standard screenplay layout. */
function ScreenplayPreview({ elements }: { elements: ScriptElement[] }) {
  const shown = elements.filter((e) => e.text.trim()).slice(0, 70);
  return (
    <div className="mt-6 overflow-hidden rounded-md border border-line">
      <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2">
        <span className="eyebrow">First page{elements.length > 70 ? 's' : ''}</span>
        <span className="font-mono text-[10.5px] text-faint">{elements.length} elements</span>
      </div>
      <div className="max-h-[560px] overflow-auto bg-paper px-3 py-8 text-paper-ink sm:px-8">
        <div className="mx-auto font-script text-[12.5px] leading-[1.35]" style={{ width: '62ch', maxWidth: '100%' }}>
          {shown.map((e, i) => {
            const lay = LAYOUT[e.type];
            const prev = shown[i - 1];
            const tight = (e.type === 'dialogue' || e.type === 'parenthetical') && prev && ['character', 'dialogue', 'parenthetical'].includes(prev.type);
            return (
              <p
                key={e.id}
                className={cn('whitespace-pre-wrap', e.type === 'scene' && 'font-bold', !tight && i > 0 && (e.type === 'scene' ? 'mt-6' : 'mt-3'))}
                style={
                  lay.align === 'left'
                    ? { marginLeft: `${(lay.left - 1.5) * 10}ch`, maxWidth: `${lay.width}ch` }
                    : lay.align === 'right'
                      ? { marginLeft: 'auto', maxWidth: `${lay.width}ch`, textAlign: 'right' }
                      : { textAlign: 'center' }
                }
              >
                {displayText(e)}
              </p>
            );
          })}
          {elements.length > 70 && <p className="mt-8 text-center text-[11px] opacity-50">… the rest of the screenplay is imported too</p>}
        </div>
      </div>
    </div>
  );
}
