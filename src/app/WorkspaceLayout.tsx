import {
  CalendarDays,
  Camera,
  ChevronLeft,
  Clapperboard,
  Contact,
  Drama,
  FileText,
  FolderOpen,
  Images,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MonitorPlay,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ProjectCover } from '@/components/CoverArt';
import { Badge, Button, cn, IconButton, Loading, Menu, MenuItem, Sheet, toastError, useConfirm } from '@/components/ui';
import { stageLabel } from '@/lib/constants';
import { deleteProject } from '@/lib/data/deletes';
import { openProject } from '@/lib/data/projects';
import { useProject } from '@/lib/hooks';
import type { Project } from '@/lib/types';
import { openCommandPalette } from './commands';
import { ThemeToggle } from './ThemeToggle';

const AssistantPanel = lazy(() => import('@/features/assistant/AssistantPanel'));

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV: NavItem[] = [
  { to: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Progress, stage and what needs attention' },
  { to: 'script', label: 'Script', icon: FileText, description: 'Write and revise the screenplay' },
  { to: 'storyboard', label: 'Storyboard', icon: Images, description: 'Plan how every scene looks' },
  { to: 'scenes', label: 'Scenes', icon: Clapperboard, description: 'Breakdown and readiness of each scene' },
  { to: 'shots', label: 'Shot List', icon: Camera, description: 'Every camera setup, grouped by scene or day' },
  { to: 'characters', label: 'Characters', icon: Drama, description: 'Profiles, arcs and relationships' },
  { to: 'locations', label: 'Locations', icon: MapPin, description: 'Locations, props and wardrobe' },
  { to: 'people', label: 'Cast & Crew', icon: Contact, description: 'Team, roles and availability' },
  { to: 'schedule', label: 'Schedule', icon: CalendarDays, description: 'Filming calendar and call sheets' },
  { to: 'tasks', label: 'Tasks', icon: ListChecks, description: 'Production to-dos' },
  { to: 'assets', label: 'Assets', icon: FolderOpen, description: 'Files, references and media' },
  { to: 'settings', label: 'Settings', icon: Settings2, description: 'Details, team access and backups' },
];

const MOBILE_PRIMARY = ['overview', 'script', 'scenes', 'shots'];

export interface AssistantFocus {
  type: 'scene' | 'character';
  id: string;
  label: string;
}

export interface WorkspaceContext {
  project: Project;
  /** Open the AI assistant, optionally focused on a scene or character. */
  openAssistant: (focus?: AssistantFocus) => void;
}

export function useWorkspace(): WorkspaceContext {
  return useOutletContext<WorkspaceContext>();
}

const COLLAPSE_KEY = 'sceneforge:nav-collapsed';

export function WorkspaceLayout() {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [assistant, setAssistant] = useState<{ open: boolean; focus?: AssistantFocus }>({ open: false });
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (projectId) void openProject(projectId);
  }, [projectId]);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  if (project === undefined) return <Loading label="Opening project" className="min-h-dvh" />;
  if (project === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="eyebrow mb-3">Project not found</div>
        <h1 className="display text-[38px]">This film isn’t in your studio</h1>
        <p className="mt-2 max-w-sm text-[13.5px] text-muted">It may have been deleted, or it was created in another browser. Projects live on the device where they were made unless you import a backup.</p>
        <Link to="/" className="btn btn-primary mt-6">
          Back to the studio
        </Link>
      </div>
    );
  }

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const ctx: WorkspaceContext = {
    project,
    openAssistant: (focus) => setAssistant({ open: true, focus }),
  };

  const section = NAV.find((n) => location.pathname.includes(`/${n.to}`));
  const fullBleed = /\/(script|storyboard)$/.test(location.pathname);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Desktop sidebar */}
      <aside className={cn('hidden md:flex flex-col shrink-0 border-r border-line bg-panel transition-[width] duration-300 ease-[var(--ease-film)]', collapsed ? 'w-[60px]' : 'w-[236px]')}>
        <div className={cn('flex h-12 items-center border-b border-line', collapsed ? 'justify-center' : 'justify-between pl-4 pr-2')}>
          {!collapsed && (
            <Link to="/" className="group flex items-center gap-2" title="Back to the studio">
              <ChevronLeft className="size-3.5 text-faint transition-transform group-hover:-translate-x-0.5" />
              <span className="font-mono text-[11px] font-semibold tracking-[0.28em] text-ink">SCENEFORGE</span>
            </Link>
          )}
          <IconButton label={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={toggleCollapsed} size="sm">
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </IconButton>
        </div>

        <ProjectBlock project={project} collapsed={collapsed} />

        <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Project sections">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : item.description}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-8 items-center gap-3 rounded-sm text-[13px] transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-2.5',
                  isActive ? 'bg-hover text-ink' : 'text-muted hover:bg-hover/60 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent" />}
                  <item.icon className={cn('size-4 shrink-0', isActive ? 'text-accent' : 'text-faint group-hover:text-muted')} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={cn('border-t border-line p-2 space-y-0.5', collapsed && 'flex flex-col items-center')}>
          <SidebarAction collapsed={collapsed} icon={Radio} label="On-set mode" to={`/p/${project.id}/on-set`} live />
          <PresentMenu projectId={project.id} collapsed={collapsed} />
          <button
            onClick={() => setAssistant((a) => ({ open: !a.open, focus: a.focus }))}
            className={cn('flex h-8 w-full items-center gap-3 rounded-sm text-[13px] text-muted hover:bg-hover hover:text-ink', collapsed ? 'justify-center' : 'px-2.5', assistant.open && 'bg-hover text-ink')}
            title="AI filmmaking assistant"
          >
            <Sparkles className="size-4 shrink-0 text-faint" />
            {!collapsed && <span>Assistant</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel/80 px-3 backdrop-blur md:px-4">
          <Link to="/" className="btn-icon md:hidden" aria-label="Back to the studio">
            <ChevronLeft className="size-4" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
            <span className="hidden truncate text-muted sm:inline md:hidden lg:inline">{project.title}</span>
            <span className="truncate font-medium text-ink sm:before:mr-2 sm:before:text-faint sm:before:content-['/'] md:before:content-none lg:before:content-['/']">
              <span className="sm:hidden">{project.title} · </span>
              {section?.label ?? 'Workspace'}
            </span>
          </div>
          <button
            onClick={() => openCommandPalette()}
            className="hidden h-8 items-center gap-2 rounded-sm border border-line-strong bg-surface pl-2.5 pr-1.5 text-[12.5px] text-faint hover:text-ink sm:flex"
          >
            <Search className="size-3.5" />
            <span className="w-28 text-left lg:w-44">Search project…</span>
            <span className="kbd">⌘K</span>
          </button>
          <IconButton label="Search" onClick={() => openCommandPalette()} className="sm:hidden">
            <Search className="size-4" />
          </IconButton>
          <Link to={`/p/${project.id}/on-set`} className="btn-icon md:hidden" aria-label="On-set mode" title="On-set mode">
            <Radio className="size-4" />
          </Link>
          <IconButton label="AI assistant" onClick={() => setAssistant((a) => ({ open: !a.open }))} active={assistant.open} className="md:hidden">
            <Sparkles className="size-4" />
          </IconButton>
          <ThemeToggle />
        </header>

        {project.isSample && <SampleBanner project={project} />}

        <div className="flex min-h-0 flex-1">
          <main id="workspace-main" className={cn('min-w-0 flex-1 pb-16 md:pb-0', fullBleed ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}>
            <Outlet context={ctx} />
          </main>
          {assistant.open && (
            <Suspense fallback={null}>
              <AssistantPanel
                projectId={project.id}
                focus={assistant.focus}
                onFocusChange={(focus) => setAssistant({ open: true, focus })}
                onClose={() => setAssistant({ open: false })}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-panel/95 backdrop-blur md:hidden safe-bottom" aria-label="Project sections">
        {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to)).map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10.5px]', isActive ? 'text-accent' : 'text-muted')}>
            <item.icon className="size-[18px]" />
            {item.label}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className={cn('flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10.5px]', !MOBILE_PRIMARY.includes(section?.to ?? '') ? 'text-accent' : 'text-muted')}>
          <MoreHorizontal className="size-[18px]" />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={project.title} description={stageLabel(project.stage)}>
        <div className="grid grid-cols-2 gap-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-md border px-3 py-3 text-[13.5px]', isActive ? 'border-accent text-ink' : 'border-line text-muted')}
            >
              <item.icon className="size-4 text-accent" />
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link to={`/p/${project.id}/on-set`} className="btn btn-secondary">
            <Radio className="size-4 text-live" /> On-set mode
          </Link>
          <Link to={`/p/${project.id}/present/pitch`} className="btn btn-secondary">
            <MonitorPlay className="size-4" /> Present
          </Link>
        </div>
      </Sheet>
    </div>
  );
}

function ProjectBlock({ project, collapsed }: { project: Project; collapsed: boolean }) {
  if (collapsed) {
    return (
      <Link to="overview" className="mx-auto mt-3 block size-9 overflow-hidden rounded-sm border border-line" title={project.title}>
        <ProjectCover project={project} className="size-full" />
      </Link>
    );
  }
  return (
    <div className="border-b border-line p-3">
      <Link to="overview" className="group block">
        <ProjectCover project={project} className="aspect-[2.39/1] w-full rounded-sm border border-line" />
        <div className="mt-2.5 display text-[21px] leading-tight text-ink line-clamp-2 group-hover:text-accent-strong transition-colors">{project.title}</div>
      </Link>
      <div className="mt-1.5 flex items-center gap-2">
        <Badge tone={project.stage === 'production' ? 'live' : project.stage === 'completed' ? 'success' : 'accent'} dot>
          {stageLabel(project.stage)}
        </Badge>
      </div>
    </div>
  );
}

function SidebarAction({ collapsed, icon: Icon, label, to, live }: { collapsed: boolean; icon: LucideIcon; label: string; to: string; live?: boolean }) {
  return (
    <Link to={to} className={cn('flex h-8 w-full items-center gap-3 rounded-sm text-[13px] text-muted hover:bg-hover hover:text-ink', collapsed ? 'justify-center' : 'px-2.5')} title={label}>
      <Icon className={cn('size-4 shrink-0', live ? 'text-live' : 'text-faint')} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export const PRESENT_KINDS = [
  { kind: 'pitch', label: 'Pitch presentation' },
  { kind: 'storyboard', label: 'Storyboard' },
  { kind: 'screenplay', label: 'Screenplay' },
  { kind: 'characters', label: 'Character profiles' },
  { kind: 'scenes', label: 'Scene breakdown' },
  { kind: 'shots', label: 'Shot list' },
];

function PresentMenu({ projectId, collapsed }: { projectId: string; collapsed: boolean }) {
  const navigate = useNavigate();
  return (
    <Menu
      align="start"
      trigger={
        <button className={cn('flex h-8 w-full items-center gap-3 rounded-sm text-[13px] text-muted hover:bg-hover hover:text-ink', collapsed ? 'justify-center' : 'px-2.5')} title="Presentation mode">
          <MonitorPlay className="size-4 shrink-0 text-faint" />
          {!collapsed && <span>Present</span>}
        </button>
      }
    >
      {PRESENT_KINDS.map((p) => (
        <MenuItem key={p.kind} onSelect={() => navigate(`/p/${projectId}/present/${p.kind}`)}>
          {p.label}
        </MenuItem>
      ))}
    </Menu>
  );
}

function SampleBanner({ project }: { project: Project }) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-accent-soft px-4 py-2 text-[12.5px]">
      <span className="eyebrow text-accent">Sample film</span>
      <span className="text-muted">Everything here is example content, so explore freely — edits are saved like a real project.</span>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto"
        onClick={async () => {
          const ok = await confirm({
            title: 'Remove the sample film?',
            message: 'This deletes the sample project and all of its example content from this device.',
            confirmLabel: 'Remove sample',
            danger: true,
          });
          if (!ok) return;
          try {
            await deleteProject(project.id);
            navigate('/');
          } catch (e) {
            toastError(e, 'Couldn’t remove the sample');
          }
        }}
      >
        Remove sample
      </Button>
    </div>
  );
}
