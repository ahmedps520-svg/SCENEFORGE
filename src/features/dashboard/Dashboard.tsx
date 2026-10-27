import {
  ArrowRight,
  Camera,
  Check,
  Clapperboard,
  Drama,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  Images,
  LayoutGrid,
  List,
  MonitorPlay,
  MoreHorizontal,
  PenLine,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  ArchiveRestore,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CoverArt, ProjectCover } from '@/components/CoverArt';
import { Badge, Button, cn, IconButton, Loading, Menu, MenuItem, MenuSeparator, ProgressBar, Segmented, Select, toast, toastError, toastUndo, useConfirm } from '@/components/ui';
import { PRODUCTION_TYPES, STAGES, stageLabel } from '@/lib/constants';
import { formatDate, formatShortDate, formatTime, parseDateStr, relativeTime, todayStr } from '@/lib/dates';
import { downloadBlob, exportProject } from '@/lib/data/backup';
import { updateRecord } from '@/lib/data/crud';
import { deleteProject } from '@/lib/data/deletes';
import { updateSettings, useSettings } from '@/lib/data/settings';
import { useProjects } from '@/lib/hooks';
import type { Project, Stage, Task } from '@/lib/types';
import { useSampleLauncher } from './actions';
import { useStudioData, type OpenTask, type ProjectSummary, type RecentEdit, type UpcomingShoot } from './data';
import { StudioBar, useRestoreBackup } from './StudioBar';

type SortKey = 'edited' | 'title' | 'stage';

export default function Dashboard() {
  const settings = useSettings();
  const projects = useProjects();
  const data = useStudioData();
  const navigate = useNavigate();

  useEffect(() => {
    if (settings && projects && !settings.onboardingComplete && projects.length === 0) navigate('/welcome', { replace: true });
  }, [settings, projects, navigate]);

  useEffect(() => {
    document.title = 'SCENEFORGE — Studio';
  }, []);

  if (!settings || !projects || !data) {
    return (
      <div className="min-h-dvh">
        <StudioBar />
        <Loading label="Opening the studio" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="min-h-dvh">
        <StudioBar />
        <WelcomeEmpty />
      </div>
    );
  }

  const featured = [...data.summaries].sort((a, b) => b.project.lastOpenedAt - a.project.lastOpenedAt)[0];

  return (
    <div className="min-h-dvh pb-20">
      <StudioBar />
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <Greeting name={settings.userName} />
        {featured && <Hero summary={featured} />}
        {featured && <QuickAccess summary={featured} />}
        <div className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-3">
          <UpcomingPanel items={data.upcoming} />
          <TasksPanel items={data.tasks} />
          <RecentPanel items={data.recent} />
        </div>
        <ProjectsSection summaries={data.summaries} view={settings.dashboardView} />
      </main>
    </div>
  );
}

function Greeting({ name }: { name: string }) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 pt-8 pb-5 animate-fade-in">
      <div>
        <div className="eyebrow">The studio</div>
        <h1 className="display mt-1.5 text-[30px] text-ink sm:text-[34px]">
          {part}
          {name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ''}.
        </h1>
      </div>
      <div className="slate text-faint">{formatDate(todayStr(), 'EEEE · d MMMM yyyy')}</div>
    </div>
  );
}

// ─── Featured project ───────────────────────────────────────────────────────

function genreLine(p: Project) {
  const type = PRODUCTION_TYPES.find((t) => t.value === p.productionType)?.label;
  return [p.genres[0], type].filter(Boolean).join(' · ');
}

function StageStepper({ stage, onDark }: { stage: Stage; onDark?: boolean }) {
  const idx = STAGES.findIndex((s) => s.value === stage);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label={`Production stage: ${stageLabel(stage)}`}>
      {STAGES.map((s, i) => (
        <li key={s.value} className="flex items-center gap-2">
          <span
            aria-current={i === idx ? 'step' : undefined}
            className={cn(
              'font-mono text-[9.5px] tracking-[0.16em] uppercase whitespace-nowrap',
              i === idx ? 'text-accent' : i < idx ? (onDark ? 'md:text-white/75 text-ink' : 'text-ink') : onDark ? 'text-faint md:text-white/35' : 'text-faint',
            )}
          >
            {s.label}
          </span>
          {i < STAGES.length - 1 && <span className={cn('h-px w-3 sm:w-5', i < idx ? 'bg-accent' : onDark ? 'bg-line-strong md:bg-white/20' : 'bg-line-strong')} />}
        </li>
      ))}
    </ol>
  );
}

function Hero({ summary }: { summary: ProjectSummary }) {
  const { project, progress } = summary;
  const navigate = useNavigate();
  const live = project.stage === 'production';
  const pct = Math.round(progress.overall * 100);
  return (
    <section className="relative overflow-hidden rounded-md border border-line bg-surface animate-rise" aria-label="Current production">
      <div className="relative grain">
        <ProjectCover project={project} variant="full" className="aspect-video w-full md:aspect-[2.39/1]" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-black/90 via-black/45 to-black/5 md:block" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/60 via-black/10 to-transparent md:block" />
      </div>
      <div className="relative p-5 sm:p-7 md:absolute md:inset-x-0 md:bottom-0 md:p-10">
        <div className="flex items-center gap-2">
          {live && <span className="size-1.5 rounded-full bg-live animate-pulse-live" />}
          <span className={cn('eyebrow', live ? 'text-live' : 'text-accent')}>{live ? 'Now filming' : 'Continue where you left off'}</span>
        </div>
        <h2 className="display mt-2 max-w-4xl text-[40px] text-ink sm:text-[54px] md:text-[64px] md:text-[#f4efe5] lg:text-[80px]">{project.title}</h2>
        {project.logline && <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-muted md:text-[15.5px] md:text-white/75">{project.logline}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {genreLine(project) && <span className="slate md:text-white/60">{genreLine(project)}</span>}
          {project.runtimeTarget ? <span className="slate md:text-white/60">{project.runtimeTarget} min target</span> : null}
          {summary.pages > 0 && <span className="slate md:text-white/60">{summary.pages.toFixed(1)} pages</span>}
          <span className="slate text-accent sm:hidden">{stageLabel(project.stage)}</span>
          {project.isSample && <Badge tone="accent">Sample</Badge>}
        </div>
        <div className="mt-5 grid max-w-2xl gap-3">
          <div className="flex items-center gap-3">
            <ProgressBar value={progress.overall} label="Overall production progress" className="md:bg-white/15" />
            <span className="font-mono text-[12px] text-ink md:text-white/85">{pct}%</span>
          </div>
          <div className="hidden sm:block">
            <StageStepper stage={project.stage} onDark />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={() => navigate(`/p/${project.id}/overview`)}>
            Open workspace
          </Button>
          <Button variant="secondary" icon={<PenLine className="size-4" />} onClick={() => navigate(`/p/${project.id}/script`)}>
            Continue writing
          </Button>
          <Button variant="secondary" icon={<MonitorPlay className="size-4" />} onClick={() => navigate(`/p/${project.id}/present/pitch`)}>
            Present pitch
          </Button>
          {live && (
            <Button variant="secondary" icon={<Radio className="size-4 text-live" />} onClick={() => navigate(`/p/${project.id}/on-set`)}>
              On-set mode
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function QuickAccess({ summary }: { summary: ProjectSummary }) {
  const { project, counts, progress, pages, drafts } = summary;
  const tiles: { to: string; label: string; icon: ReactNode; value: string; detail: string }[] = [
    {
      to: 'script',
      label: 'Script',
      icon: <FileText className="size-4" />,
      value: pages > 0 ? `${Math.ceil(pages)}` : '0',
      detail: `page${Math.ceil(pages) === 1 ? '' : 's'} · ~${Math.round(pages)} min · ${drafts} draft${drafts === 1 ? '' : 's'}`,
    },
    {
      to: 'characters',
      label: 'Characters',
      icon: <Drama className="size-4" />,
      value: String(counts.characters),
      detail: counts.characters === 1 ? 'profile' : 'profiles',
    },
    {
      to: 'storyboard',
      label: 'Storyboard',
      icon: <Images className="size-4" />,
      value: String(counts.frames),
      detail: `frame${counts.frames === 1 ? '' : 's'} · ${progress.counts.scenesWithFrames}/${counts.scenes} scenes boarded`,
    },
    {
      to: 'shots',
      label: 'Shot list',
      icon: <Camera className="size-4" />,
      value: `${counts.shotsCompleted}/${counts.shots}`,
      detail: 'shots completed',
    },
  ];
  return (
    <nav className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-4 animate-rise [animation-delay:80ms]" aria-label={`Quick access for ${project.title}`}>
      {tiles.map((t) => (
        <Link key={t.to} to={`/p/${project.id}/${t.to}`} className="group flex flex-col gap-3 bg-surface p-4 transition-colors hover:bg-raised sm:p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="flex items-center gap-2 text-[12.5px] group-hover:text-ink">
              <span className="text-accent">{t.icon}</span>
              {t.label}
            </span>
            <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <div>
            <div className="font-mono text-[22px] leading-none text-ink">{t.value}</div>
            <div className="mt-1.5 truncate text-[12px] text-faint">{t.detail}</div>
          </div>
        </Link>
      ))}
    </nav>
  );
}

// ─── Panels ─────────────────────────────────────────────────────────────────

function Panel({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="min-w-0 animate-rise [animation-delay:120ms]">
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2.5">
        <h2 className="eyebrow text-muted">{title}</h2>
        {footer}
      </div>
      {children}
    </section>
  );
}

function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-[13px] leading-relaxed text-faint">{children}</p>;
}

function UpcomingPanel({ items }: { items: UpcomingShoot[] }) {
  return (
    <Panel title="Upcoming filming">
      {items.length === 0 ? (
        <PanelEmpty>Nothing scheduled for the next 30 days. Filming days you add in a project’s Schedule appear here.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map(({ event, project, locationName }) => {
            const d = parseDateStr(event.date);
            const isToday = event.date === todayStr();
            return (
              <li key={event.id}>
                <Link to={`/p/${project.id}/schedule?event=${event.id}`} className="group flex items-center gap-4 py-3">
                  <div className={cn('flex w-11 shrink-0 flex-col items-center rounded-sm border py-1', isToday ? 'border-live text-live' : 'border-line-strong text-ink')}>
                    <span className="font-mono text-[9px] tracking-[0.14em] uppercase">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                    <span className="font-mono text-[17px] leading-tight">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] text-ink group-hover:text-accent-strong">{event.title || 'Filming day'}</div>
                    <div className="truncate text-[12px] text-faint">
                      {[project.title, locationName, `${event.sceneIds.length} scene${event.sceneIds.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{isToday ? 'Today' : formatTime(event.startTime)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function dueLabel(t: Task, overdue: boolean): string {
  if (!t.due) return 'No due date';
  if (overdue) {
    const days = Math.round((parseDateStr(todayStr()).getTime() - parseDateStr(t.due).getTime()) / 86_400_000);
    return `Overdue · ${days} day${days === 1 ? '' : 's'}`;
  }
  if (t.due === todayStr()) return 'Due today';
  return `Due ${formatShortDate(t.due)}`;
}

function TasksPanel({ items }: { items: OpenTask[] }) {
  const complete = async (t: Task) => {
    try {
      await updateRecord<Task>('tasks', t.id, { status: 'done', completedAt: Date.now() }, { summary: `Completed task “${t.title}”` });
      toast('Task completed', {
        detail: t.title,
        action: { label: 'Undo', onClick: () => updateRecord<Task>('tasks', t.id, { status: t.status, completedAt: undefined }, { silent: true }) },
      });
    } catch (e) {
      toastError(e, 'Task not updated');
    }
  };
  return (
    <Panel title="Outstanding tasks">
      {items.length === 0 ? (
        <PanelEmpty>No open tasks. Production to-dos from every film collect here, overdue ones first.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map(({ task, project, overdue }) => (
            <li key={task.id} className="group flex items-start gap-3 py-3">
              <button
                onClick={() => void complete(task)}
                aria-label={`Mark “${task.title}” done`}
                title="Mark done"
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs border border-line-strong text-transparent transition-colors hover:border-success hover:text-success"
              >
                <Check className="size-3" />
              </button>
              <Link to={`/p/${project.id}/tasks?task=${task.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-ink group-hover:text-accent-strong">{task.title || 'Untitled task'}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-[12px]">
                  <span className={overdue ? 'text-danger' : 'text-faint'}>{dueLabel(task, overdue)}</span>
                  <span className="text-faint">· {project.title}</span>
                </div>
              </Link>
              {(task.priority === 'urgent' || task.priority === 'high') && (
                <Badge tone={task.priority === 'urgent' ? 'danger' : 'warning'} className="shrink-0">
                  {task.priority === 'urgent' ? 'Urgent' : 'High'}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentPanel({ items }: { items: RecentEdit[] }) {
  return (
    <Panel title="Recently edited">
      {items.length === 0 ? (
        <PanelEmpty>Scripts and scenes you work on will be listed here.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((r) => (
            <li key={r.key}>
              <Link to={r.href} className="group flex items-start gap-3 py-3">
                <span className="mt-0.5 text-faint group-hover:text-accent">{r.kind === 'script' ? <FileText className="size-4" /> : <Clapperboard className="size-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-ink group-hover:text-accent-strong', r.kind === 'scene' ? 'font-mono text-[12px] uppercase tracking-wide' : 'text-[13.5px]')}>{r.title}</div>
                  <div className="truncate text-[12px] text-faint">
                    {r.project.title} · {r.subtitle}
                  </div>
                </div>
                <span className="shrink-0 text-[11.5px] text-faint">{relativeTime(r.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Projects ───────────────────────────────────────────────────────────────

function useProjectActions() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  return {
    open: (p: Project) => navigate(`/p/${p.id}/overview`),
    present: (p: Project) => navigate(`/p/${p.id}/present/pitch`),
    exportBackup: async (p: Project) => {
      try {
        const { blob, filename } = await exportProject(p.id);
        downloadBlob(blob, filename);
        toast('Backup exported', { detail: `${filename} contains the whole project, including uploaded files.` });
      } catch (e) {
        toastError(e, 'Backup failed');
      }
    },
    remove: async (p: Project) => {
      const ok = await confirm({
        title: `Delete “${p.title}”?`,
        message: 'This removes the film and everything in it — drafts, scenes, storyboards, schedules and uploaded files — from this device. You can undo right after, but consider exporting a backup first.',
        confirmLabel: 'Delete film',
        danger: true,
        typeToConfirm: p.isSample ? undefined : p.title,
      });
      if (!ok) return;
      try {
        const { summary, restore } = await deleteProject(p.id);
        toastUndo(summary, restore);
      } catch (e) {
        toastError(e, 'Couldn’t delete the film');
      }
    },
  };
}

function ProjectMenu({ project, className }: { project: Project; className?: string }) {
  const a = useProjectActions();
  return (
    <Menu
      trigger={
        <IconButton label={`Actions for ${project.title}`} size="sm" className={className} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      }
    >
      <MenuItem icon={<FolderOpen className="size-3.5" />} onSelect={() => a.open(project)}>
        Open workspace
      </MenuItem>
      <MenuItem icon={<MonitorPlay className="size-3.5" />} onSelect={() => a.present(project)}>
        Present pitch
      </MenuItem>
      <MenuItem icon={<Download className="size-3.5" />} onSelect={() => void a.exportBackup(project)}>
        Export backup
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Trash2 className="size-3.5" />} danger onSelect={() => void a.remove(project)}>
        {project.isSample ? 'Remove sample' : 'Delete film'}
      </MenuItem>
    </Menu>
  );
}

function stageTone(stage: Stage) {
  return stage === 'production' ? 'live' : stage === 'completed' ? 'success' : stage === 'postproduction' ? 'info' : 'accent';
}

function ProjectsSection({ summaries, view }: { summaries: ProjectSummary[]; view: 'grid' | 'list' }) {
  const [sort, setSort] = useState<SortKey>('edited');
  const navigate = useNavigate();
  const sorted = useMemo(() => {
    const list = [...summaries];
    if (sort === 'title') list.sort((a, b) => a.project.title.localeCompare(b.project.title));
    else if (sort === 'stage') list.sort((a, b) => STAGES.findIndex((s) => s.value === a.project.stage) - STAGES.findIndex((s) => s.value === b.project.stage) || b.project.updatedAt - a.project.updatedAt);
    else list.sort((a, b) => b.project.updatedAt - a.project.updatedAt);
    return list;
  }, [summaries, sort]);

  return (
    <section className="mt-14" aria-labelledby="your-films">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-baseline gap-3">
          <h2 id="your-films" className="display text-[30px] text-ink">
            Your films
          </h2>
          <span className="font-mono text-[12px] text-faint">{summaries.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="project-sort">
            Sort films
          </label>
          <Select id="project-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 w-[150px] text-[12.5px]">
            <option value="edited">Last edited</option>
            <option value="title">Title</option>
            <option value="stage">Stage</option>
          </Select>
          <Segmented
            label="Layout"
            value={view}
            onChange={(v) => void updateSettings({ dashboardView: v })}
            options={[
              { value: 'grid', label: <span className="sr-only">Grid</span>, icon: <LayoutGrid className="size-3.5" />, title: 'Grid view' },
              { value: 'list', label: <span className="sr-only">List</span>, icon: <List className="size-3.5" />, title: 'List view' },
            ]}
          />
        </div>
      </div>

      {view === 'grid' ? (
        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((s, i) => (
            <ProjectCard key={s.project.id} summary={s} index={i} />
          ))}
          <button
            onClick={() => navigate('/new')}
            className="group flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-ink"
          >
            <Plus className="size-5 text-accent transition-transform group-hover:scale-110" />
            <span className="display text-[22px]">Start a new film</span>
            <span className="text-[12px] text-faint">Title, story, look and production — skip anything for later</span>
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-line">
          <div className="hidden grid-cols-[88px_minmax(0,1fr)_140px_150px_140px_110px_40px] items-center gap-4 border-b border-line bg-panel px-4 py-2 md:grid">
            {['', 'Film', 'Genre', 'Stage', 'Progress', 'Edited', ''].map((h, i) => (
              <span key={i} className="eyebrow">
                {h}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {sorted.map((s) => (
              <ProjectRow key={s.project.id} summary={s} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ProjectCard({ summary, index }: { summary: ProjectSummary; index: number }) {
  const { project, progress } = summary;
  const navigate = useNavigate();
  const pct = Math.round(progress.overall * 100);
  return (
    <article className="group relative animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <Link to={`/p/${project.id}/overview`} className="block overflow-hidden rounded-md border border-line bg-black" aria-label={`Open ${project.title}`}>
        <div className="relative aspect-video overflow-hidden">
          <ProjectCover project={project} className="absolute inset-0 transition-transform duration-700 ease-[var(--ease-film)] group-hover:scale-[1.035]" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            <Badge tone={stageTone(project.stage)} dot className="bg-black/55 backdrop-blur-sm">
              {stageLabel(project.stage)}
            </Badge>
          </div>
          {project.isSample && (
            <div className="absolute right-3 top-3">
              <Badge tone="accent" className="bg-black/55 backdrop-blur-sm">
                Sample
              </Badge>
            </div>
          )}
          <span className="absolute bottom-3 right-3 font-mono text-[11px] text-white/80">{pct}%</span>
        </div>
      </Link>
      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/p/${project.id}/overview`)}>
          <h3 className="display truncate text-[24px] text-ink transition-colors group-hover:text-accent-strong">{project.title}</h3>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">{genreLine(project) || 'No genre yet'}</div>
        </div>
        <ProjectMenu project={project} className="mt-1" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={progress.overall} label={`${project.title} progress`} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-faint">
        <span>Edited {relativeTime(project.updatedAt)}</span>
        <span className="font-mono">{pct}% complete</span>
      </div>
    </article>
  );
}

function ProjectRow({ summary }: { summary: ProjectSummary }) {
  const { project, progress } = summary;
  const pct = Math.round(progress.overall * 100);
  return (
    <li className="group relative grid grid-cols-[72px_minmax(0,1fr)_40px] items-center gap-4 px-4 py-3 transition-colors hover:bg-surface md:grid-cols-[88px_minmax(0,1fr)_140px_150px_140px_110px_40px]">
      <Link to={`/p/${project.id}/overview`} className="block overflow-hidden rounded-xs border border-line" aria-label={`Open ${project.title}`}>
        <ProjectCover project={project} className="aspect-video w-full" />
      </Link>
      <Link to={`/p/${project.id}/overview`} className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="display truncate text-[20px] text-ink group-hover:text-accent-strong">{project.title}</span>
          {project.isSample && <Badge tone="accent">Sample</Badge>}
        </div>
        <div className="truncate text-[12px] text-faint md:hidden">
          {stageLabel(project.stage)} · {pct}% · edited {relativeTime(project.updatedAt)}
        </div>
        {project.logline && <div className="hidden truncate text-[12.5px] text-muted md:block">{project.logline}</div>}
      </Link>
      <span className="hidden truncate text-[12.5px] text-muted md:block">{project.genres[0] ?? '—'}</span>
      <span className="hidden md:block">
        <Badge tone={stageTone(project.stage)} dot>
          {stageLabel(project.stage)}
        </Badge>
      </span>
      <span className="hidden items-center gap-2 md:flex">
        <ProgressBar value={progress.overall} label={`${project.title} progress`} />
        <span className="w-9 shrink-0 text-right font-mono text-[11.5px] text-muted">{pct}%</span>
      </span>
      <span className="hidden text-[12px] text-faint md:block">{relativeTime(project.updatedAt)}</span>
      <ProjectMenu project={project} />
    </li>
  );
}

// ─── First run ──────────────────────────────────────────────────────────────

function WelcomeEmpty() {
  const navigate = useNavigate();
  const sample = useSampleLauncher();
  const restore = useRestoreBackup();
  const options = [
    {
      icon: <Plus className="size-5" />,
      title: 'Start a new film',
      body: 'Name it, sketch the story, and step into a full production workspace.',
      action: () => navigate('/new'),
      busy: false,
    },
    {
      icon: <Sparkles className="size-5" />,
      title: 'Explore a sample film',
      body: 'A short film already in pre-production — see how scripts, scenes, storyboards and shots connect.',
      action: () => void sample.launch(),
      busy: sample.busy,
    },
    {
      icon: <FileUp className="size-5" />,
      title: 'Import a screenplay',
      body: 'Bring in a Fountain or Final Draft file and get a scene breakdown instantly.',
      action: () => navigate('/import'),
      busy: false,
    },
  ];
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10">
      <section className="relative overflow-hidden rounded-md border border-line grain animate-fade-in">
        <div className="absolute inset-0">
          <CoverArt seed={2417} genres={['Drama']} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/30" />
        <div className="relative px-6 pb-8 pt-20 sm:px-10 sm:pt-28 lg:px-14 lg:pb-12">
          <div className="eyebrow text-accent">Welcome to the studio</div>
          <h1 className="display mt-3 max-w-3xl text-[44px] text-[#f4efe5] sm:text-[64px] lg:text-[80px]">Every film starts with a blank page.</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">
            SCENEFORGE keeps your screenplay, scenes, storyboards, shot lists, cast and schedule in one place — stored privately on this device.
          </p>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {options.map((o, i) => (
              <button
                key={o.title}
                onClick={o.action}
                disabled={o.busy}
                className="group flex flex-col items-start gap-3 rounded-md border border-white/15 bg-black/45 p-5 text-left backdrop-blur-sm transition-colors hover:border-accent hover:bg-black/60 animate-rise disabled:opacity-60"
                style={{ animationDelay: `${150 + i * 70}ms` }}
              >
                <span className="flex size-10 items-center justify-center rounded-full border border-white/20 text-accent">{o.icon}</span>
                <span className="display text-[24px] text-[#f4efe5]">{o.busy ? 'Opening…' : o.title}</span>
                <span className="text-[13px] leading-relaxed text-white/65">{o.body}</span>
                <ArrowRight className="mt-auto size-4 text-white/50 transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </button>
            ))}
          </div>
          <button onClick={restore.open} className="mt-6 inline-flex items-center gap-2 text-[12.5px] text-white/60 hover:text-white">
            <ArchiveRestore className="size-3.5" /> Have a .sceneforge backup? Restore it
          </button>
        </div>
      </section>
      {restore.element}
    </main>
  );
}
