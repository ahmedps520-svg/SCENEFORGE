import { Plus, Shuffle, X } from 'lucide-react';
import { useState } from 'react';
import { ProjectCover } from '@/components/CoverArt';
import { AutoText, Button, cn, Field, ImageUpload, Input, Section, Segmented, Select, toast, toastError } from '@/components/ui';
import { GENRES, PRODUCTION_TYPES, STAGES } from '@/lib/constants';
import { updateProject } from '@/lib/data/projects';
import type { Project, ProductionType, Stage } from '@/lib/types';

export function DetailsSection({ project }: { project: Project }) {
  const save = (patch: Partial<Project>, summary?: string) => updateProject(project.id, patch, summary).catch((e) => toastError(e, 'Change not saved'));
  const [custom, setCustom] = useState('');
  const [runtime, setRuntime] = useState(project.runtimeTarget ? String(project.runtimeTarget) : '');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const toggleGenre = (g: string) => {
    const has = project.genres.includes(g);
    void save({ genres: has ? project.genres.filter((x) => x !== g) : [...project.genres, g] }, has ? `Removed genre ${g}` : `Added genre ${g}`);
  };
  const addCustom = () => {
    const g = custom.trim();
    if (!g) return;
    if (project.genres.some((x) => x.toLowerCase() === g.toLowerCase())) return setCustom('');
    void save({ genres: [...project.genres, g] }, `Added genre ${g}`);
    setCustom('');
  };
  const customGenres = project.genres.filter((g) => !(GENRES as readonly string[]).includes(g));

  const saveRuntime = (v: string) => {
    if (!v.trim()) {
      setRuntimeError(null);
      return void save({ runtimeTarget: undefined }, 'Cleared target runtime');
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1000 || !Number.isInteger(n)) return setRuntimeError('Enter whole minutes between 1 and 1000.');
    setRuntimeError(null);
    if (n !== project.runtimeTarget) void save({ runtimeTarget: n }, `Set target runtime to ${n} minutes`);
  };

  const saveDate = (k: 'filmingStart' | 'filmingEnd', v: string) => {
    const start = k === 'filmingStart' ? v : project.filmingStart;
    const end = k === 'filmingEnd' ? v : project.filmingEnd;
    if (start && end && end < start) return setDateError('Filming can’t end before it starts.');
    setDateError(null);
    void save({ [k]: v || undefined }, 'Updated planned filming dates');
  };

  return (
    <div className="space-y-10">
      <Section title="Cover" description="Shown on the studio dashboard, in the workspace and on pitch presentations.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <ProjectCover project={project} variant="full" className="aspect-[2.39/1] w-full rounded-md border border-line" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {project.coverAssetId ? (
                <Button size="sm" variant="ghost" onClick={() => void save({ coverAssetId: undefined }, 'Switched to generated cover art')}>
                  Use generated poster instead
                </Button>
              ) : (
                <>
                  <Button size="sm" icon={<Shuffle className="size-3.5" />} onClick={() => void save({ coverSeed: Math.floor(Math.random() * 1_000_000) }, 'Shuffled generated cover art')}>
                    Shuffle poster
                  </Button>
                  <span className="text-[11.5px] text-faint">Generated from the genre. Upload an image to replace it.</span>
                </>
              )}
            </div>
          </div>
          <ImageUpload
            projectId={project.id}
            value={project.coverAssetId}
            onChange={(id) => void save({ coverAssetId: id }, id ? 'Uploaded a cover image' : 'Removed the cover image')}
            category="cover"
            aspect="aspect-[2.39/1]"
            label="Upload a cover image"
          />
        </div>
      </Section>

      <Section title="The film">
        <div className="grid gap-4">
          <AutoText label="Title" value={project.title} required="Every film needs a title" onSave={(v) => save({ title: v.trim() }, `Renamed the project to “${v.trim()}”`)} maxLength={120} />
          <AutoText label="Logline" optional multiline rows={2} value={project.logline} placeholder="One sentence: who wants what, and what stands in the way" onSave={(v) => save({ logline: v }, 'Edited the logline')} />
          <AutoText label="Synopsis" optional multiline rows={6} value={project.synopsis} placeholder="The story in a few paragraphs" onSave={(v) => save({ synopsis: v }, 'Edited the synopsis')} />
          <Field label="Genre" hint="The first genre you pick is treated as the primary genre.">
            <div className="flex flex-wrap gap-1.5">
              {[...GENRES, ...customGenres].map((g) => {
                const on = project.genres.includes(g);
                const idx = project.genres.indexOf(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleGenre(g)}
                    className={cn('chip h-7 px-2.5 transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'text-muted hover:text-ink')}
                  >
                    {g}
                    {idx === 0 && <span className="slate text-[9px] text-accent">primary</span>}
                    {on && !(GENRES as readonly string[]).includes(g) && <X className="size-3" />}
                  </button>
                );
              })}
              <span className="inline-flex items-center gap-1">
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
                  placeholder="Custom genre"
                  className="h-7 w-36 text-[12px]"
                  maxLength={40}
                />
                <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={addCustom} disabled={!custom.trim()}>
                  Add
                </Button>
              </span>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Production">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Production type">
            <Select value={project.productionType} onChange={(e) => void save({ productionType: e.target.value as ProductionType }, 'Changed production type')}>
              {PRODUCTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.hint}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target runtime (minutes)" optional error={runtimeError} hint="Used to measure script progress (1 page ≈ 1 minute).">
            <Input type="number" inputMode="numeric" min={1} max={1000} value={runtime} invalid={!!runtimeError} onChange={(e) => setRuntime(e.target.value)} onBlur={() => saveRuntime(runtime)} onKeyDown={(e) => e.key === 'Enter' && saveRuntime(runtime)} placeholder="e.g. 12" />
          </Field>
          <AutoText label="Language" value={project.language} onSave={(v) => save({ language: v }, 'Changed language')} placeholder="English" />
          <AutoText label="Target audience" optional value={project.audience} onSave={(v) => save({ audience: v }, 'Changed target audience')} placeholder="e.g. Festival audiences, teens, families" />
          <AutoText className="sm:col-span-2" label="Visual style" optional multiline rows={2} value={project.visualStyle} onSave={(v) => save({ visualStyle: v }, 'Edited visual style')} placeholder="e.g. Handheld naturalism, sodium-vapour nights, 2.39:1" />
          <Field label="Filming starts" optional error={dateError}>
            <Input type="date" value={project.filmingStart ?? ''} onChange={(e) => saveDate('filmingStart', e.target.value)} />
          </Field>
          <Field label="Filming ends" optional>
            <Input type="date" value={project.filmingEnd ?? ''} min={project.filmingStart} onChange={(e) => saveDate('filmingEnd', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Production stage" description="Set by the project owner. Progress percentages are calculated separately, from the project’s actual data.">
        <div className="overflow-x-auto no-scrollbar">
          <Segmented
            label="Production stage"
            value={project.stage}
            onChange={(v: Stage) => {
              void save({ stage: v }, `Moved the project to ${STAGES.find((s) => s.value === v)?.label}`).then(() => toast(`Stage set to ${STAGES.find((s) => s.value === v)?.label}`));
            }}
            options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
      </Section>
    </div>
  );
}
