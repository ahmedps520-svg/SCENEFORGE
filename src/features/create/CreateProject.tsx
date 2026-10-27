import { ArrowLeft, ArrowRight, Check, ImagePlus, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CoverArt } from '@/components/CoverArt';
import { Button, cn, Field, IconButton, Input, Select, Textarea, toast, toastError } from '@/components/ui';
import { ACCEPT_IMAGES, CREW_ROLES, GENRES, PRODUCTION_TYPES } from '@/lib/constants';
import { formatDate } from '@/lib/dates';
import { validateFile } from '@/lib/data/assets';
import { createProject } from '@/lib/data/projects';
import { loadSettings, updateSettings, useSettings } from '@/lib/data/settings';
import { requestPersistentStorage } from '@/lib/db';
import type { AccessRole, ProductionType } from '@/lib/types';
import { StudioBar } from '../dashboard/StudioBar';

type StepKey = 'film' | 'story' | 'look' | 'production' | 'review';

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: 'film', label: 'The film', hint: 'Title, type and genre' },
  { key: 'story', label: 'Story', hint: 'Synopsis, runtime, audience' },
  { key: 'look', label: 'Look', hint: 'Cover and visual style' },
  { key: 'production', label: 'Production', hint: 'Dates and collaborators' },
  { key: 'review', label: 'Review', hint: 'Check and create' },
];

interface CollaboratorRow {
  key: number;
  name: string;
  role: string;
  email: string;
  accessRole: AccessRole;
}

interface Draft {
  title: string;
  logline: string;
  synopsis: string;
  genres: string[];
  productionType: ProductionType;
  runtime: string;
  language: string;
  audience: string;
  visualStyle: string;
  filmingStart: string;
  filmingEnd: string;
  coverFile?: File;
  coverSeed: number;
  youName: string;
  youRole: string;
  collaborators: CollaboratorRow[];
}

const STYLE_SUGGESTIONS = [
  'Naturalistic, handheld',
  'Neo-noir, high contrast',
  'Symmetrical pastel',
  'Golden-hour warmth',
  'Black & white',
  'Cold, desaturated',
  'Neon night',
  '16mm grain',
];

const AUDIENCE_SUGGESTIONS = ['General audiences', 'Family', 'Young adult', 'Adult', 'Festival circuit', 'Online / social'];

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Hindi', 'Arabic', 'Mandarin', 'Japanese', 'Korean', 'Swahili', 'Turkish', 'Urdu'];

const RUNTIME_HINT: Record<ProductionType, number> = {
  short: 12,
  feature: 95,
  'web-series': 10,
  skit: 3,
  documentary: 60,
  experimental: 8,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<'title' | 'runtime' | 'dates' | `collab-${number}`, string>>;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.title.trim()) e.title = 'Every film needs a title.';
  else if (d.title.trim().length > 120) e.title = 'Keep the title under 120 characters.';
  if (d.runtime.trim()) {
    const n = Number(d.runtime);
    if (!Number.isInteger(n) || n < 1 || n > 600) e.runtime = 'Enter a whole number of minutes between 1 and 600.';
  }
  if (d.filmingStart && d.filmingEnd && d.filmingEnd < d.filmingStart) e.dates = 'The last filming day can’t be before the first.';
  d.collaborators.forEach((c) => {
    const any = c.name.trim() || c.role.trim() || c.email.trim();
    if (!any) return;
    if (!c.name.trim()) e[`collab-${c.key}`] = 'Add a name for this collaborator, or remove the row.';
    else if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) e[`collab-${c.key}`] = `“${c.email.trim()}” doesn’t look like an email address.`;
  });
  return e;
}

const stepOf = (k: keyof Errors): StepKey => (k === 'title' ? 'film' : k === 'runtime' ? 'story' : 'production');

export default function CreateProject() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [step, setStep] = useState<StepKey>('film');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(1);
  const [d, setD] = useState<Draft>(() => ({
    title: '',
    logline: '',
    synopsis: '',
    genres: [],
    productionType: 'short',
    runtime: '',
    language: 'English',
    audience: '',
    visualStyle: '',
    filmingStart: '',
    filmingEnd: '',
    coverSeed: Math.floor(Math.random() * 1_000_000),
    youName: '',
    youRole: 'Director',
    collaborators: [],
  }));
  const prefilled = useRef(false);
  useEffect(() => {
    if (settings && !prefilled.current) {
      prefilled.current = true;
      setD((x) => ({ ...x, youName: x.youName || settings.userName }));
    }
  }, [settings]);

  useEffect(() => {
    document.title = 'New film — SCENEFORGE';
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const errors = useMemo(() => validate(d), [d]);
  const visibleErrors = showErrors ? errors : ({} as Errors);
  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const stepHasError = (k: StepKey) => showErrors && (Object.keys(errors) as (keyof Errors)[]).some((e) => stepOf(e) === k);
  const canCreate = !errors.title;

  const go = (k: StepKey) => {
    setStep(k);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => {
    const stepErrors = (Object.keys(errors) as (keyof Errors)[]).filter((e) => stepOf(e) === step);
    if (stepErrors.length) {
      setShowErrors(true);
      return;
    }
    go(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].key);
  };

  const create = async () => {
    setShowErrors(true);
    const keys = Object.keys(errors) as (keyof Errors)[];
    if (keys.length) {
      go(stepOf(keys[0]));
      return;
    }
    setBusy(true);
    try {
      const current = await loadSettings();
      if (!current.userName.trim() && d.youName.trim()) await updateSettings({ userName: d.youName.trim() });
      const project = await createProject({
        title: d.title,
        logline: d.logline,
        synopsis: d.synopsis,
        genres: d.genres,
        productionType: d.productionType,
        runtimeTarget: d.runtime.trim() ? Number(d.runtime) : undefined,
        language: d.language,
        audience: d.audience,
        visualStyle: d.visualStyle,
        filmingStart: d.filmingStart || undefined,
        filmingEnd: d.filmingEnd || undefined,
        coverFile: d.coverFile,
        coverSeed: d.coverSeed,
        you: { name: d.youName.trim(), role: d.youRole.trim() || 'Director' },
        collaborators: d.collaborators
          .filter((c) => c.name.trim())
          .map((c) => ({ name: c.name, role: c.role, email: c.email, accessRole: c.accessRole })),
      });
      await updateSettings({ onboardingComplete: true });
      void requestPersistentStorage();
      toast(`“${project.title}” is ready`, { detail: 'Your production workspace is set up. Start anywhere.' });
      navigate(`/p/${project.id}/overview`);
    } catch (e) {
      const projectId = (e as { projectId?: string }).projectId;
      if (projectId) {
        toastError(e, 'Film created, but the cover image wasn’t saved');
        navigate(`/p/${projectId}/overview`);
      } else {
        toastError(e, 'Couldn’t create the film');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh pb-24">
      <StudioBar back={{ to: '/', label: 'Studio' }} title="New film" />
      <main className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:py-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="eyebrow">New production</div>
          <h1 className="display mt-1.5 text-[38px] text-ink">Start a film</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">Only the title is required. Skip anything — every detail can be refined later in the project’s settings.</p>
          <PosterPreview d={d} />
          <ol className="mt-6 hidden space-y-0.5 lg:block" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  onClick={() => go(s.key)}
                  aria-current={s.key === step ? 'step' : undefined}
                  className={cn('flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors', s.key === step ? 'bg-hover' : 'hover:bg-hover/60')}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10.5px]',
                      stepHasError(s.key) ? 'border-danger text-danger' : i < stepIdx ? 'border-accent bg-accent text-accent-ink' : s.key === step ? 'border-accent text-accent' : 'border-line-strong text-faint',
                    )}
                  >
                    {i < stepIdx && !stepHasError(s.key) ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[13px]', s.key === step ? 'text-ink' : 'text-muted')}>{s.label}</span>
                    <span className="block truncate text-[11.5px] text-faint">{s.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="min-w-0">
          {/* Compact step indicator for small screens */}
          <div className="mb-6 flex items-center gap-1.5 lg:hidden" aria-label={`Step ${stepIdx + 1} of ${STEPS.length}: ${STEPS[stepIdx].label}`}>
            {STEPS.map((s, i) => (
              <button key={s.key} onClick={() => go(s.key)} className={cn('h-1 flex-1 rounded-full', stepHasError(s.key) ? 'bg-danger' : i <= stepIdx ? 'bg-accent' : 'bg-line-strong')} aria-label={s.label} />
            ))}
          </div>

          <div key={step} className="animate-slide-in-right">
            <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-line pb-4">
              <div>
                <div className="slate">
                  Step {stepIdx + 1} of {STEPS.length}
                </div>
                <h2 className="display mt-1 text-[30px] text-ink">{STEPS[stepIdx].label}</h2>
              </div>
              {step !== 'review' && (
                <Button variant="ghost" size="sm" onClick={() => void create()} disabled={!canCreate || busy} title={canCreate ? 'Create with what you have so far' : 'Add a title first'}>
                  Create now
                </Button>
              )}
            </div>

            {step === 'film' && <FilmStep d={d} set={set} errors={visibleErrors} onEnter={next} />}
            {step === 'story' && <StoryStep d={d} set={set} errors={visibleErrors} />}
            {step === 'look' && <LookStep d={d} set={set} />}
            {step === 'production' && <ProductionStep d={d} set={set} errors={visibleErrors} seq={seq} />}
            {step === 'review' && <ReviewStep d={d} go={go} errors={errors} />}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(STEPS[Math.max(0, stepIdx - 1)].key)} disabled={stepIdx === 0}>
              Back
            </Button>
            <div className="flex items-center gap-2">
              {step !== 'film' && step !== 'review' && (
                <Button variant="ghost" onClick={() => go(STEPS[stepIdx + 1].key)}>
                  Skip
                </Button>
              )}
              {step === 'review' ? (
                <Button variant="primary" size="lg" onClick={() => void create()} loading={busy} disabled={!canCreate}>
                  Create film
                </Button>
              ) : (
                <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={next}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Preview ────────────────────────────────────────────────────────────────

function useObjectUrl(file: File | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

function PosterPreview({ d }: { d: Draft }) {
  const url = useObjectUrl(d.coverFile);
  const type = PRODUCTION_TYPES.find((t) => t.value === d.productionType)?.label;
  return (
    <div className="relative mt-6 aspect-video overflow-hidden rounded-md border border-line bg-black grain">
      {url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : <CoverArt seed={d.coverSeed} genres={d.genres} productionType={d.productionType} className="absolute inset-0" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="font-mono text-[9px] tracking-[0.2em] text-white/60 uppercase">{[d.genres[0], type].filter(Boolean).join(' · ') || 'Untitled production'}</div>
        <div className={cn('display mt-1 line-clamp-2 text-[26px] text-[#f4efe5]', !d.title.trim() && 'text-white/35')}>{d.title.trim() || 'Your title here'}</div>
      </div>
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────────

type SetFn = <K extends keyof Draft>(k: K, v: Draft[K]) => void;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-sm border px-3 text-[12.5px] transition-colors',
        on ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-muted hover:border-[color-mix(in_srgb,var(--c-ink)_28%,transparent)] hover:text-ink',
      )}
    >
      {on && <Check className="size-3 text-accent" />}
      {children}
    </button>
  );
}

function FilmStep({ d, set, errors, onEnter }: { d: Draft; set: SetFn; errors: Errors; onEnter: () => void }) {
  const [custom, setCustom] = useState('');
  const toggleGenre = (g: string) => set('genres', d.genres.includes(g) ? d.genres.filter((x) => x !== g) : [...d.genres, g]);
  const addCustom = () => {
    const g = custom.trim();
    if (!g) return;
    if (!d.genres.some((x) => x.toLowerCase() === g.toLowerCase())) set('genres', [...d.genres, g]);
    setCustom('');
  };
  const customGenres = d.genres.filter((g) => !(GENRES as readonly string[]).includes(g));
  return (
    <div className="space-y-8">
      <Field label="Title" error={errors.title} htmlFor="film-title" hint="You can change it any time.">
        <input
          id="film-title"
          autoFocus
          value={d.title}
          maxLength={140}
          onChange={(e) => set('title', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder="The Long Night"
          aria-invalid={!!errors.title || undefined}
          className={cn(
            'display block w-full border-0 border-b bg-transparent pb-2 text-[40px] text-ink placeholder:text-faint/60 focus:outline-none sm:text-[52px]',
            errors.title ? 'border-danger' : 'border-line-strong focus:border-accent',
          )}
        />
      </Field>

      <Field label="Logline" optional htmlFor="film-logline" hint={`One or two sentences that sell the story. ${d.logline.length}/300`}>
        <Textarea id="film-logline" rows={2} maxLength={300} value={d.logline} onChange={(e) => set('logline', e.target.value)} placeholder="When a lighthouse keeper hears a voice in the storm, she must decide whether to answer it." />
      </Field>

      <div>
        <div className="label">Production type</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRODUCTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={d.productionType === t.value}
              onClick={() => set('productionType', t.value)}
              className={cn(
                'rounded-md border p-3.5 text-left transition-colors',
                d.productionType === t.value ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-[color-mix(in_srgb,var(--c-ink)_28%,transparent)]',
              )}
            >
              <div className="text-[13.5px] text-ink">{t.label}</div>
              <div className="mt-0.5 text-[11.5px] text-faint">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label">
          Genre <span className="ml-1 font-normal text-faint">Optional · the first one you pick is the primary genre</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Chip key={g} on={d.genres.includes(g)} onClick={() => toggleGenre(g)}>
              {g}
              {d.genres[0] === g && <span className="font-mono text-[9px] tracking-wider text-accent uppercase">Primary</span>}
            </Chip>
          ))}
          {customGenres.map((g) => (
            <span key={g} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-accent bg-accent-soft px-3 text-[12.5px] text-ink">
              {g}
              {d.genres[0] === g && <span className="font-mono text-[9px] tracking-wider text-accent uppercase">Primary</span>}
              <button type="button" aria-label={`Remove ${g}`} onClick={() => toggleGenre(g)} className="text-faint hover:text-ink">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex max-w-sm gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Custom genre, e.g. Folk horror"
            maxLength={40}
            aria-label="Custom genre"
          />
          <Button onClick={addCustom} disabled={!custom.trim()} icon={<Plus className="size-3.5" />}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuggestionChips({ items, onPick, current }: { items: string[]; onPick: (v: string) => void; current: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={cn('h-6 rounded-xs border px-2 text-[11.5px] transition-colors', current === s ? 'border-accent text-ink' : 'border-line text-faint hover:border-line-strong hover:text-ink')}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function StoryStep({ d, set, errors }: { d: Draft; set: SetFn; errors: Errors }) {
  const suggested = RUNTIME_HINT[d.productionType];
  return (
    <div className="space-y-7">
      <Field label="Synopsis" optional htmlFor="film-synopsis" hint="The story from beginning to end. Useful for pitches and for the AI assistant, if you use it.">
        <Textarea id="film-synopsis" rows={7} value={d.synopsis} onChange={(e) => set('synopsis', e.target.value)} placeholder="Begin with the world and the character, then what goes wrong…" />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Target runtime" optional error={errors.runtime} htmlFor="film-runtime" hint={`Minutes. Script progress is measured against this (about one page per minute). Typical ${PRODUCTION_TYPES.find((t) => t.value === d.productionType)?.label.toLowerCase()}: ~${suggested} min.`}>
          <div className="flex items-center gap-2">
            <Input id="film-runtime" inputMode="numeric" value={d.runtime} onChange={(e) => set('runtime', e.target.value.replace(/[^\d]/g, ''))} placeholder={String(suggested)} invalid={!!errors.runtime} className="w-28" />
            <span className="text-[12.5px] text-faint">minutes</span>
            {!d.runtime && (
              <button type="button" className="link text-[12px]" onClick={() => set('runtime', String(suggested))}>
                Use {suggested}
              </button>
            )}
          </div>
        </Field>
        <Field label="Language" htmlFor="film-language">
          <Input id="film-language" list="film-languages" value={d.language} onChange={(e) => set('language', e.target.value)} placeholder="English" />
          <datalist id="film-languages">
            {LANGUAGES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Target audience" optional htmlFor="film-audience">
        <Input id="film-audience" value={d.audience} onChange={(e) => set('audience', e.target.value)} placeholder="Who is this film for?" />
        <SuggestionChips items={AUDIENCE_SUGGESTIONS} current={d.audience} onPick={(v) => set('audience', v)} />
      </Field>
    </div>
  );
}

function LookStep({ d, set }: { d: Draft; set: SetFn }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = useObjectUrl(d.coverFile);
  const take = (file: File | undefined) => {
    if (!file) return;
    const err = validateFile(file, { imageOnly: true });
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    set('coverFile', file);
  };
  return (
    <div className="space-y-8">
      <div>
        <div className="label">Cover image</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              take(e.dataTransfer.files[0]);
            }}
            className={cn('relative aspect-video overflow-hidden rounded-md border', d.coverFile ? 'border-accent' : 'border-dashed border-line-strong', drag && 'border-accent bg-accent-soft')}
          >
            {url ? (
              <>
                <img src={url} alt="Uploaded cover" className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent p-2">
                  <span className="truncate self-end text-[11.5px] text-white/80">{d.coverFile?.name}</span>
                  <button type="button" onClick={() => set('coverFile', undefined)} className="btn btn-sm shrink-0 border-white/20 bg-black/60 text-white hover:bg-black/80">
                    <X className="size-3.5" /> Remove
                  </button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => input.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-muted hover:text-ink">
                <ImagePlus className="size-5" />
                <span className="text-[13px]">Upload a cover</span>
                <span className="text-[11px] text-faint">Drop an image or choose a file · JPG, PNG, WebP, GIF, SVG, AVIF · up to 25 MB</span>
              </button>
            )}
          </div>
          <div className={cn('relative aspect-video overflow-hidden rounded-md border', !d.coverFile ? 'border-accent' : 'border-line')}>
            <CoverArt seed={d.coverSeed} genres={d.genres} productionType={d.productionType} className="absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent p-2">
              <span className="text-[11.5px] text-white/80">{d.coverFile ? 'Generated art (not used)' : 'Generated poster art'}</span>
              <button type="button" onClick={() => set('coverSeed', Math.floor(Math.random() * 1_000_000))} className="btn btn-sm border-white/20 bg-black/60 text-white hover:bg-black/80">
                <Shuffle className="size-3.5" /> Shuffle
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : <p className="mt-2 text-[12px] text-faint">Without an upload, the film gets generated poster art based on its genre. You can replace it later.</p>}
        <input ref={input} type="file" accept={ACCEPT_IMAGES} className="hidden" onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }} />
      </div>
      <Field label="Visual style" optional htmlFor="film-style" hint="How should it feel on screen? Shared with your crew and used in pitch presentations.">
        <Input id="film-style" value={d.visualStyle} onChange={(e) => set('visualStyle', e.target.value)} placeholder="e.g. Cold coastal light, long static takes" />
        <SuggestionChips items={STYLE_SUGGESTIONS} current={d.visualStyle} onPick={(v) => set('visualStyle', v)} />
      </Field>
    </div>
  );
}

function ProductionStep({ d, set, errors, seq }: { d: Draft; set: SetFn; errors: Errors; seq: MutableRefObject<number> }) {
  const add = () => set('collaborators', [...d.collaborators, { key: seq.current++, name: '', role: '', email: '', accessRole: 'editor' }]);
  const update = (key: number, patch: Partial<CollaboratorRow>) => set('collaborators', d.collaborators.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const remove = (key: number) => set('collaborators', d.collaborators.filter((c) => c.key !== key));
  return (
    <div className="space-y-8">
      <div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First filming day" optional htmlFor="film-start">
            <Input id="film-start" type="date" value={d.filmingStart} onChange={(e) => set('filmingStart', e.target.value)} />
          </Field>
          <Field label="Last filming day" optional htmlFor="film-end">
            <Input id="film-end" type="date" min={d.filmingStart || undefined} value={d.filmingEnd} onChange={(e) => set('filmingEnd', e.target.value)} invalid={!!errors.dates} />
          </Field>
        </div>
        {errors.dates ? <p className="mt-1.5 text-[12px] text-danger">{errors.dates}</p> : <p className="mt-1.5 text-[12px] text-faint">Planned dates only — schedule individual filming days later in the Schedule.</p>}
      </div>

      <div>
        <div className="label">You</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={d.youName} onChange={(e) => set('youName', e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={60} />
          <Input value={d.youRole} onChange={(e) => set('youRole', e.target.value)} list="crew-roles" placeholder="Your role, e.g. Director" aria-label="Your role" />
        </div>
        <p className="mt-1.5 text-[12px] text-faint">You’re added to Cast &amp; Crew as the project owner.</p>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="label mb-0">Collaborators</div>
            <p className="mt-1 text-[12px] text-faint">Optional. Add people now or later — contact details aren’t required.</p>
          </div>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={add}>
            Add person
          </Button>
        </div>
        {d.collaborators.length > 0 && (
          <ul className="mt-4 space-y-3">
            {d.collaborators.map((c) => (
              <li key={c.key} className="rounded-md border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr_130px_auto]">
                  <Input value={c.name} onChange={(e) => update(c.key, { name: e.target.value })} placeholder="Name" aria-label="Collaborator name" autoFocus={!c.name} />
                  <Input value={c.role} onChange={(e) => update(c.key, { role: e.target.value })} list="crew-roles" placeholder="Role" aria-label="Collaborator role" />
                  <Input type="email" value={c.email} onChange={(e) => update(c.key, { email: e.target.value })} placeholder="Email (optional)" aria-label="Collaborator email" invalid={!!errors[`collab-${c.key}`]?.includes('email')} />
                  <Select value={c.accessRole} onChange={(e) => update(c.key, { accessRole: e.target.value as AccessRole })} aria-label="Access">
                    <option value="editor">Editor</option>
                    <option value="commenter">Commenter</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                  <IconButton label="Remove collaborator" onClick={() => remove(c.key)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
                {errors[`collab-${c.key}`] && <p className="mt-1.5 text-[12px] text-danger">{errors[`collab-${c.key}`]}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Collaborators are recorded on this device for roles, task assignments and credits. Sending invitations and syncing live between devices needs a sync service, which this build doesn’t include — share the project by exporting a backup instead.
        </p>
        <datalist id="crew-roles">
          {CREW_ROLES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className="min-w-0 text-[13.5px] text-ink">{value || <span className="text-faint">—</span>}</dd>
    </div>
  );
}

function ReviewStep({ d, go, errors }: { d: Draft; go: (k: StepKey) => void; errors: Errors }) {
  const type = PRODUCTION_TYPES.find((t) => t.value === d.productionType)?.label;
  const people = d.collaborators.filter((c) => c.name.trim());
  const block = (key: StepKey, title: string, rows: ReactNode) => (
    <section className="rounded-md border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h3 className="eyebrow text-muted">{title}</h3>
        <button onClick={() => go(key)} className="link text-[12px]">
          Edit
        </button>
      </div>
      <dl className="divide-y divide-line px-4">{rows}</dl>
    </section>
  );
  const errorList = Object.values(errors);
  return (
    <div className="space-y-4">
      {errorList.length > 0 && (
        <div role="alert" className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-[13px] text-danger">
          {errorList.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {block(
        'film',
        'The film',
        <>
          <ReviewRow label="Title" value={<span className="display text-[22px]">{d.title}</span>} />
          <ReviewRow label="Logline" value={d.logline} />
          <ReviewRow label="Type" value={type} />
          <ReviewRow label="Genres" value={d.genres.join(', ')} />
        </>,
      )}
      {block(
        'story',
        'Story',
        <>
          <ReviewRow label="Synopsis" value={d.synopsis && <span className="line-clamp-4 whitespace-pre-wrap">{d.synopsis}</span>} />
          <ReviewRow label="Target runtime" value={d.runtime && `${d.runtime} minutes`} />
          <ReviewRow label="Language" value={d.language} />
          <ReviewRow label="Audience" value={d.audience} />
        </>,
      )}
      {block(
        'look',
        'Look',
        <>
          <ReviewRow label="Cover" value={d.coverFile ? d.coverFile.name : 'Generated poster art'} />
          <ReviewRow label="Visual style" value={d.visualStyle} />
        </>,
      )}
      {block(
        'production',
        'Production',
        <>
          <ReviewRow
            label="Filming"
            value={d.filmingStart ? `${formatDate(d.filmingStart)}${d.filmingEnd ? ` → ${formatDate(d.filmingEnd)}` : ''}` : d.filmingEnd ? `Until ${formatDate(d.filmingEnd)}` : ''}
          />
          <ReviewRow label="You" value={[d.youName.trim() || 'You', d.youRole.trim()].filter(Boolean).join(' · ')} />
          <ReviewRow label="Collaborators" value={people.length ? people.map((c) => [c.name.trim(), c.role.trim()].filter(Boolean).join(' · ')).join(', ') : ''} />
        </>,
      )}
    </div>
  );
}
