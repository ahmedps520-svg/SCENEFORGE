import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  Clapperboard,
  Drama,
  FileText,
  Images,
  Info,
  ListChecks,
  MapPin,
  MonitorPlay,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { ProjectCover } from '@/components/CoverArt';
import { Button, cn, Loading, PageContainer, Popover, ProgressBar, Section, Switch, toastError } from '@/components/ui';
import { POST_CHECKLIST, PRODUCTION_TYPES, STAGES, eventTypeMeta } from '@/lib/constants';
import { formatDate, formatSeconds, formatShortDate, formatTime, relativeTime, todayStr } from '@/lib/dates';
import { updateProject } from '@/lib/data/projects';
import { dismissTip, useSettings } from '@/lib/data/settings';
import { useActivity, useProjectData, type ProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import { computeProgress } from '@/lib/progress';
import { buildReadinessContext, sceneBlockers } from '@/lib/readiness';
import { scriptStats } from '@/lib/screenplay/paginate';
import type { Project, Stage } from '@/lib/types';

export default function Overview() {
  const { project } = useWorkspace();
  const data = useProjectData(project.id);
  if (!data) return <Loading label="Gathering the production" />;
  return <OverviewContent project={project} data={data} />;
}

function OverviewContent({ project, data }: { project: Project; data: ProjectData }) {
  const base = `/p/${project.id}`;
  const primary = data.scripts.find((s) => s.id === project.primaryScriptId) ?? data.scripts[0];
  const stats = useMemo(() => scriptStats(primary?.elements ?? []), [primary?.elements]);
  const progress = useMemo(
    () => computeProgress({ project, scriptPages: stats.pages, scenes: data.scenes, shots: data.shots, frames: data.frames, tasks: data.tasks, events: data.events }),
    [project, stats.pages, data],
  );
  const numbers = useMemo(() => sceneNumbers(data.scenes), [data.scenes]);
  const today = todayStr();
  const upcoming = data.events.filter((e) => e.date >= today).slice(0, 5);
  const nextFilming = data.events.find((e) => e.type === 'filming' && e.date >= today);
  const openTasks = data.tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      const ao = a.due && a.due < today ? 0 : 1;
      const bo = b.due && b.due < today ? 0 : 1;
      return ao - bo || (a.due ?? '9999').localeCompare(b.due ?? '9999');
    })
    .slice(0, 5);
  const typeLabel = PRODUCTION_TYPES.find((p) => p.value === project.productionType)?.label;

  return (
    <PageContainer>
      {/* Header */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div className="flex min-w-0 gap-5">
          <ProjectCover project={project} className="hidden aspect-[2/3] w-[104px] shrink-0 rounded-sm border border-line sm:block" />
          <div className="min-w-0">
            <div className="eyebrow mb-2">Production overview</div>
            <h1 className="display text-[40px] text-ink sm:text-[52px]">{project.title}</h1>
            {project.logline ? (
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{project.logline}</p>
            ) : (
              <p className="mt-2 text-[13.5px] text-faint">
                No logline yet. <Link to={`${base}/settings`} className="link">Add one in Settings</Link> — it helps pitches and the assistant.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 slate">
              {project.genres.length > 0 && <span>{project.genres.join(' / ')}</span>}
              {typeLabel && <span>· {typeLabel}</span>}
              {project.runtimeTarget ? <span>· {project.runtimeTarget} min target</span> : null}
              {project.language && <span>· {project.language}</span>}
            </div>
          </div>
        </div>
        <OverallCard value={progress.overall} components={progress.components} />
      </div>

      <StageTrack project={project} />

      <StartHere project={project} data={data} />

      {/* Key numbers */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        <Tile icon={Clapperboard} label="Scenes" to={`${base}/scenes`} value={progress.counts.scenes} detail={`${progress.counts.scenesFilmed} filmed · ${progress.counts.scenesReady - progress.counts.scenesFilmed} ready`} />
        <Tile icon={Camera} label="Shots" to={`${base}/shots`} value={progress.counts.shots} detail={`${progress.counts.shotsCompleted} completed`} />
        <Tile icon={FileText} label="Script" to={`${base}/script`} value={`${stats.pageCount} pg`} detail={stats.runtimeSec ? `≈ ${formatSeconds(stats.runtimeSec)} runtime` : 'Not started'} />
        <Tile icon={Images} label="Storyboard" to={`${base}/storyboard`} value={`${data.frames.length}`} detail={`${progress.counts.scenesWithFrames} of ${progress.counts.scenes} scenes boarded`} />
        <Tile icon={ListChecks} label="Open tasks" to={`${base}/tasks`} value={progress.counts.tasksOpen} detail={progress.counts.tasksOverdue ? `${progress.counts.tasksOverdue} overdue` : 'None overdue'} alert={progress.counts.tasksOverdue > 0} />
        <Tile icon={CalendarDays} label="Filming days ahead" to={`${base}/schedule`} value={progress.counts.upcomingFilmingDays} detail={nextFilming ? `Next ${formatShortDate(nextFilming.date)}` : 'None scheduled'} />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-10">
          <Breakdown components={progress.components} />
          <MissingResources project={project} data={data} numbers={numbers} />
          <ScriptCompletion project={project} pages={stats.pages} />
        </div>
        <div className="min-w-0 space-y-10">
          <Section title="Coming up" actions={<Link to={`${base}/schedule`} className="text-[12px] text-muted hover:text-ink">Schedule →</Link>}>
            {upcoming.length === 0 ? (
              <Empty>
                Nothing scheduled. <Link className="link" to={`${base}/schedule`}>Plan a filming day</Link>.
              </Empty>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {upcoming.map((e) => {
                  const meta = eventTypeMeta(e.type);
                  const loc = data.locations.find((l) => l.id === e.locationId);
                  return (
                    <li key={e.id} className="flex items-start gap-3 px-3.5 py-3 hover:bg-hover/50">
                      <Link to={`${base}/schedule?event=${e.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="w-11 shrink-0 text-center">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{formatDate(e.date, 'MMM')}</div>
                          <div className="display text-[24px] leading-none text-ink">{formatDate(e.date, 'd')}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
                            <span className="truncate text-[13px] text-ink">{e.title || meta.label}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-faint">
                            {formatTime(e.startTime)}
                            {loc ? ` · ${loc.name}` : ''}
                            {e.sceneIds.length ? ` · ${e.sceneIds.length} scene${e.sceneIds.length === 1 ? '' : 's'}` : ''}
                          </div>
                        </div>
                      </Link>
                      {e.type === 'filming' && (
                        <Link to={`${base}/schedule/call-sheet/${e.id}`} className="shrink-0 text-[11.5px] text-muted hover:text-accent">
                          Call sheet
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Outstanding tasks" actions={<Link to={`${base}/tasks`} className="text-[12px] text-muted hover:text-ink">All tasks →</Link>}>
            {openTasks.length === 0 ? (
              <Empty>No open tasks.</Empty>
            ) : (
              <ul className="space-y-1">
                {openTasks.map((t) => {
                  const overdue = !!t.due && t.due < today;
                  const who = data.people.find((p) => p.id === t.assigneeId);
                  return (
                    <li key={t.id}>
                      <Link to={`${base}/tasks?task=${t.id}`} className="flex items-center gap-3 rounded-sm px-2 py-2 hover:bg-hover/60">
                        <Circle className={cn('size-3.5 shrink-0', t.status === 'blocked' ? 'text-danger' : 'text-faint')} />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                        {who && <span className="hidden truncate text-[11.5px] text-faint sm:inline">{who.name}</span>}
                        {t.due && <span className={cn('shrink-0 font-mono text-[11px]', overdue ? 'text-danger' : 'text-faint')}>{overdue ? 'Overdue' : formatShortDate(t.due)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <PostChecklist project={project} />

          <RecentActivity projectId={project.id} />

          <Section title="Take it further">
            <div className="grid grid-cols-2 gap-2">
              <Link to={`${base}/present/pitch`} className="btn btn-secondary justify-start">
                <MonitorPlay className="size-4 text-accent" /> Pitch presentation
              </Link>
              <Link to={`${base}/on-set`} className="btn btn-secondary justify-start">
                <Radio className="size-4 text-live" /> On-set mode
              </Link>
            </div>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-center text-[12.5px] text-faint">{children}</p>;
}

function OverallCard({ value, components }: { value: number; components: ReturnType<typeof computeProgress>['components'] }) {
  const pct = Math.round(value * 100);
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Overall progress</span>
        <Popover
          align="end"
          className="w-[300px] p-4"
          trigger={
            <button className="flex items-center gap-1 text-[11.5px] text-faint hover:text-ink">
              <Info className="size-3.5" /> How it’s measured
            </button>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-muted">
            A weighted average of the parts that can be measured from your project data. Parts with nothing to measure yet are left out instead of guessed.
          </p>
          <ul className="mt-3 space-y-1.5">
            {components.map((c) => (
              <li key={c.key} className="flex justify-between gap-3 text-[12px]">
                <span className="text-ink">{c.label}</span>
                <span className="font-mono text-faint">{c.weight}%</span>
              </li>
            ))}
          </ul>
        </Popover>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="display text-[56px] leading-none text-ink">{pct}</span>
        <span className="font-mono text-[13px] text-faint">%</span>
      </div>
      <ProgressBar value={value} className="mt-3" label="Overall progress" />
    </div>
  );
}

function StageTrack({ project }: { project: Project }) {
  const current = STAGES.findIndex((s) => s.value === project.stage);
  const setStage = async (stage: Stage) => {
    if (stage === project.stage) return;
    try {
      await updateProject(project.id, { stage }, `Moved the production to ${STAGES.find((s) => s.value === stage)?.label}`);
    } catch (e) {
      toastError(e, 'Stage not changed');
    }
  };
  return (
    <div className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">Production stage</span>
        <span className="hidden text-[11.5px] text-faint sm:inline">Set by the project owner — click a stage to move the production</span>
      </div>
      <ol className="no-scrollbar flex overflow-x-auto rounded-md border border-line">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.value} className="min-w-[140px] flex-1 border-r border-line last:border-r-0">
              <button
                onClick={() => void setStage(s.value)}
                aria-current={active ? 'step' : undefined}
                className={cn('group flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors', active ? 'bg-accent-soft' : 'hover:bg-hover/60')}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono',
                    active ? 'border-accent bg-accent text-accent-ink' : done ? 'border-accent text-accent' : 'border-line-strong text-faint',
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={cn('truncate font-mono text-[11px] uppercase tracking-[0.12em]', active ? 'text-accent' : done ? 'text-ink' : 'text-faint group-hover:text-muted')}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StartHere({ project, data }: { project: Project; data: ProjectData }) {
  const settings = useSettings();
  const base = `/p/${project.id}`;
  const primary = data.scripts.find((s) => s.id === project.primaryScriptId);
  const steps = [
    { label: 'Write your first scene', done: !!primary?.elements.some((e) => e.type === 'scene' && e.text.trim()), to: `${base}/script`, icon: FileText },
    { label: 'Create your characters', done: data.characters.length > 0, to: `${base}/characters`, icon: Drama },
    { label: 'Add a filming location', done: data.locations.length > 0, to: `${base}/locations`, icon: MapPin },
    { label: 'Storyboard a scene', done: data.frames.length > 0, to: `${base}/storyboard`, icon: Images },
    { label: 'Plan your shots', done: data.shots.length > 0, to: `${base}/shots`, icon: Camera },
    { label: 'Schedule a filming day', done: data.events.some((e) => e.type === 'filming'), to: `${base}/schedule`, icon: CalendarDays },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const tipId = `start-here:${project.id}`;
  if (!settings || settings.dismissedTips.includes(tipId) || doneCount === steps.length) return null;
  return (
    <div className="mt-8 rounded-md border border-line bg-surface p-5 animate-rise">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-accent">Start here</div>
          <h2 className="display mt-1 text-[26px]">From idea to first shot</h2>
          <p className="mt-1 text-[13px] text-muted">
            Each step feeds the next: headings you write become scenes, characters attach to scenes, and shots and storyboards hang off each scene. {doneCount} of {steps.length} done.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void dismissTip(tipId)}>
          Hide
        </Button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link to={s.to} className={cn('group flex items-center gap-3 rounded-sm border px-3 py-2.5 transition-colors', s.done ? 'border-line text-faint' : 'border-line-strong hover:border-accent')}>
              {s.done ? <CheckCircle2 className="size-4 text-success" /> : <span className="flex size-4 items-center justify-center font-mono text-[10px] text-accent">{i + 1}</span>}
              <span className={cn('flex-1 text-[13px]', s.done ? 'line-through decoration-line-strong' : 'text-ink')}>{s.label}</span>
              {!s.done && <ArrowRight className="size-3.5 text-faint transition-transform group-hover:translate-x-0.5" />}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Tile({ icon: Icon, label, value, detail, to, alert }: { icon: LucideIcon; label: string; value: ReactNode; detail: string; to: string; alert?: boolean }) {
  return (
    <Link to={to} className="group bg-surface p-4 transition-colors hover:bg-raised">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-faint group-hover:text-accent" />
        <span className="eyebrow">{label}</span>
      </div>
      <div className="mt-3 display text-[34px] leading-none text-ink">{value}</div>
      <div className={cn('mt-1.5 truncate text-[12px]', alert ? 'text-danger' : 'text-faint')}>{detail}</div>
    </Link>
  );
}

function Breakdown({ components }: { components: ReturnType<typeof computeProgress>['components'] }) {
  return (
    <Section title="Where the production stands" description="Measured from scenes, shots, storyboards, the script and the post checklist.">
      <ul className="space-y-4">
        {components.map((c) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] text-ink">{c.label}</span>
              <span className="font-mono text-[12px] text-muted">{c.value === null ? '—' : `${Math.round(c.value * 100)}%`}</span>
            </div>
            <ProgressBar value={c.value ?? 0} tone={c.value === null ? 'muted' : c.value >= 1 ? 'success' : 'accent'} className="mt-1.5" label={c.label} />
            <p className="mt-1 text-[12px] text-faint">{c.detail}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface Issue {
  key: string;
  level: 'block' | 'warn';
  text: string;
  to: string;
  context?: string;
}

function MissingResources({ project, data, numbers }: { project: Project; data: ProjectData; numbers: Map<string, string> }) {
  const [showAll, setShowAll] = useState(false);
  const base = `/p/${project.id}`;
  const issues = useMemo(() => {
    const ctx = buildReadinessContext(data);
    const out: Issue[] = [];
    for (const s of data.scenes) {
      for (const b of sceneBlockers(s, ctx)) {
        if (b.kind === 'cast') continue; // reported once per character below
        if (b.kind === 'shots' && s.status === 'filmed') continue;
        out.push({ key: `${s.id}:${b.text}`, level: b.level, text: b.text, to: b.kind === 'shots' ? `${base}/shots?scene=${s.id}` : `${base}/scenes?scene=${s.id}`, context: `Scene ${numbers.get(s.id)}` });
      }
    }
    const appearing = new Set(data.scenes.flatMap((s) => s.characterIds));
    for (const c of data.characters) {
      if (!c.actorId && appearing.has(c.id)) out.push({ key: `cast:${c.id}`, level: 'warn', text: `${c.name} hasn’t been cast`, to: `${base}/characters?character=${c.id}` });
    }
    return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1));
  }, [data, numbers, base]);

  const blocking = issues.filter((i) => i.level === 'block').length;
  const visible = showAll ? issues : issues.slice(0, 8);

  return (
    <Section
      title="Missing production resources"
      description={issues.length ? `${blocking} blocking · ${issues.length - blocking} to prepare` : undefined}
      actions={<Link to={`${base}/locations`} className="text-[12px] text-muted hover:text-ink">Locations & props →</Link>}
    >
      {issues.length === 0 ? (
        <Empty>{data.scenes.length ? 'Every scene has what it needs. Nice.' : 'Nothing to check yet — scenes appear as you write headings in the script.'}</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-md border border-line">
            {visible.map((i) => (
              <li key={i.key}>
                <Link to={i.to} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-hover/50">
                  {i.level === 'block' ? <AlertTriangle className="size-3.5 shrink-0 text-danger" /> : <Circle className="size-3.5 shrink-0 text-warning" />}
                  <span className="min-w-0 flex-1 truncate text-[13px]">{i.text}</span>
                  {i.context && <span className="shrink-0 font-mono text-[11px] text-faint">{i.context}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {issues.length > 8 && (
            <button className="mt-2 text-[12px] text-muted hover:text-ink" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${issues.length}`}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function ScriptCompletion({ project, pages }: { project: Project; pages: number }) {
  return (
    <Section title="Script">
      <div className="rounded-md border border-line p-4">
        <Switch
          checked={project.scriptComplete}
          onChange={(v) => void updateProject(project.id, { scriptComplete: v }, v ? 'Marked the script complete' : 'Reopened the script').catch((e) => toastError(e))}
          label="Script is complete"
          description={
            project.runtimeTarget
              ? `Otherwise measured as pages against the ${project.runtimeTarget}-minute target (currently ${pages.toFixed(1)} pages).`
              : 'Without a target runtime, the script only counts toward progress once you mark it complete.'
          }
        />
      </div>
    </Section>
  );
}

function PostChecklist({ project }: { project: Project }) {
  const done = POST_CHECKLIST.filter((c) => project.postChecklist[c.key]).length;
  return (
    <Section title={`Post-production · ${done}/${POST_CHECKLIST.length}`} description="SCENEFORGE tracks post; the edit itself happens in your editing software.">
      <ul className="divide-y divide-line rounded-md border border-line">
        {POST_CHECKLIST.map((c) => {
          const on = project.postChecklist[c.key];
          return (
            <li key={c.key}>
              <button
                onClick={() =>
                  void updateProject(project.id, { postChecklist: { ...project.postChecklist, [c.key]: !on } }, `${on ? 'Reopened' : 'Completed'} post step: ${c.label}`).catch((e) => toastError(e))
                }
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-hover/50"
                aria-pressed={on}
              >
                <span className={cn('flex size-4 items-center justify-center rounded-xs border', on ? 'border-success bg-success text-bg' : 'border-line-strong')}>{on && <Check className="size-3" />}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[13px]', on ? 'text-muted line-through decoration-line-strong' : 'text-ink')}>{c.label}</span>
                  <span className="block text-[11.5px] text-faint">{c.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function RecentActivity({ projectId }: { projectId: string }) {
  const activity = useActivity(projectId, 6);
  return (
    <Section title="Recent activity" actions={<Link to={`/p/${projectId}/settings#activity`} className="text-[12px] text-muted hover:text-ink">History →</Link>}>
      {!activity?.length ? (
        <Empty>No activity yet.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {activity.map((a) => (
            <li key={a.id} className="flex gap-3 text-[12.5px]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" />
              <span className="min-w-0 flex-1">
                <span className="text-ink">{a.summary}</span>
                <span className="block text-[11.5px] text-faint">
                  {a.actor} · {relativeTime(a.at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
