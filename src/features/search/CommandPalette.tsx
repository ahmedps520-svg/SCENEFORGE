import * as RD from '@radix-ui/react-dialog';
import {
  CalendarDays,
  Camera,
  Clapperboard,
  Contact,
  CornerDownLeft,
  Drama,
  FileText,
  FileUp,
  Film,
  FolderOpen,
  Home,
  ListChecks,
  MapPin,
  MonitorPlay,
  Package,
  Plus,
  Radio,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { NAV } from '@/app/WorkspaceLayout';
import { cn } from '@/components/ui';
import { GROUPS, rank, termScore, tokenize, useSearchIndex, type Entry, type GroupKey } from './searchIndex';

const GROUP_ICON: Record<GroupKey, LucideIcon> = {
  projects: Film,
  scenes: Clapperboard,
  script: FileText,
  characters: Drama,
  locations: MapPin,
  items: Package,
  people: Contact,
  shots: Camera,
  tasks: ListChecks,
  assets: FolderOpen,
  events: CalendarDays,
};

interface Item {
  key: string;
  title: string;
  subtitle?: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  mono?: boolean;
}

interface Group {
  key: string;
  label: string;
  items: Item[];
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Highlight the first occurrence of any query term. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const lower = text.toLowerCase();
  let at = -1;
  let len = 0;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) {
      at = i;
      len = t.length;
    }
  }
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[2px] bg-accent-soft px-px text-accent-strong">{text.slice(at, at + len)}</mark>
      {text.slice(at + len)}
    </>
  );
}

/** Long script lines are trimmed to a window around the match. */
function snippet(text: string, terms: string[], radius = 48): string {
  const lower = text.toLowerCase();
  const i = Math.max(0, Math.min(...terms.map((t) => lower.indexOf(t)).filter((x) => x >= 0)));
  if (text.length <= radius * 2 + 10) return text;
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = matchPath('/p/:projectId/*', location.pathname)?.params.projectId;
  const index = useSearchIndex(projectId, open);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 110);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const terms = useMemo(() => tokenize(dq), [dq]);

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    const navItems: Item[] = [];
    if (projectId) {
      for (const n of NAV) navItems.push({ key: `nav:${n.to}`, title: n.label, subtitle: n.description, href: `/p/${projectId}/${n.to}`, icon: n.icon });
      navItems.push({ key: 'nav:on-set', title: 'On-set mode', subtitle: 'Large controls for marking shots on set', href: `/p/${projectId}/on-set`, icon: Radio });
      navItems.push({ key: 'nav:present', title: 'Present pitch', subtitle: 'Full-screen pitch presentation', href: `/p/${projectId}/present/pitch`, icon: MonitorPlay });
    }
    navItems.push(
      { key: 'app:studio', title: 'Studio', subtitle: 'All your films', href: '/', icon: Home },
      { key: 'app:new', title: 'New film', subtitle: 'Start a new production', href: '/new', icon: Plus },
      { key: 'app:import', title: 'Import a screenplay', subtitle: 'Fountain or Final Draft', href: '/import', icon: FileUp },
      { key: 'app:settings', title: 'App settings', subtitle: 'Theme, editor, AI assistant, data', href: '/settings', icon: Settings },
    );

    if (!terms.length) {
      if (index?.projects.length) {
        out.push({
          key: 'recent',
          label: projectId ? 'Switch film' : 'Recent films',
          items: index.projects
            .filter((p) => p.id !== projectId)
            .slice(0, 5)
            .map((p) => ({ key: `project:${p.id}`, title: p.title, subtitle: p.logline || undefined, href: `/p/${p.id}/overview`, icon: Film })),
        });
      }
      out.unshift({ key: 'nav', label: projectId ? 'Go to' : 'Navigate', items: navItems });
      return out.filter((g) => g.items.length);
    }

    const navMatches = navItems
      .map((n) => ({ n, s: Math.max(...terms.map((t) => termScore(n.title, t) * 2), ...terms.map((t) => termScore(n.subtitle, t))) }))
      .filter((x) => terms.every((t) => termScore(x.n.title, t) || termScore(x.n.subtitle, t)))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.n);

    const ranked = rank(index?.entries ?? [], dq);
    for (const g of GROUPS) {
      const list = ranked.get(g.key);
      if (!list?.length) continue;
      out.push({
        key: g.key,
        label: g.label,
        items: list.map((e: Entry) => ({
          key: e.key,
          title: e.group === 'script' ? snippet(e.title, terms) : e.title,
          subtitle: [e.subtitle, e.projectTitle].filter(Boolean).join(' · ') || undefined,
          href: e.href,
          icon: GROUP_ICON[e.group],
          mono: e.group === 'scenes' || e.group === 'script',
        })),
      });
    }
    if (navMatches.length) out.push({ key: 'nav', label: 'Go to', items: navMatches });
    return out;
  }, [terms, dq, index, projectId]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [dq]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onOpenChange(false);
    setQ('');
    navigate(item.href);
  };

  let i = -1;
  const pending = q !== dq;

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <RD.Content
          className="fixed left-1/2 top-[max(16px,10vh)] z-[70] flex max-h-[min(640px,calc(100dvh-32px))] w-[calc(100vw-24px)] max-w-[660px] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-line-strong bg-raised shadow-pop data-[state=open]:animate-pop focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector('input')?.focus();
          }}
        >
          <RD.Title className="sr-only">Search and navigate</RD.Title>
          <RD.Description className="sr-only">Search scenes, script lines, characters, locations, shots, tasks and more, or jump to a section.</RD.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(flat[active]);
                }
              }}
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
              aria-activedescendant={flat[active] ? `palette-${flat[active].key}` : undefined}
              placeholder={index?.scopeTitle ? `Search “${index.scopeTitle}”…` : 'Search all films, or jump to…'}
              className="h-13 min-w-0 flex-1 bg-transparent py-4 text-[15px] text-ink outline-none placeholder:text-faint"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="kbd hidden sm:inline-flex">esc</span>
          </div>
          <div ref={listRef} id="palette-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!index ? (
              <p className="px-3 py-8 text-center text-[13px] text-faint">Building the index…</p>
            ) : flat.length === 0 && terms.length ? (
              <div className="px-3 py-10 text-center">
                <p className="text-[13.5px] text-muted">{pending ? 'Searching…' : `Nothing matches “${q.trim()}”.`}</p>
                <p className="mt-1 text-[12px] text-faint">Try a character name, a location, or a line of dialogue.</p>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="mb-1.5" role="group" aria-label={g.label}>
                  <div className="eyebrow px-2.5 pb-1 pt-2">{g.label}</div>
                  {g.items.map((item) => {
                    i += 1;
                    const idx = i;
                    const Icon = item.icon;
                    return (
                      <Row key={item.key} id={`palette-${item.key}`} index={idx} active={idx === active} onHover={() => setActive(idx)} onClick={() => go(item)}>
                        <Icon className={cn('size-4 shrink-0', idx === active ? 'text-accent' : 'text-faint')} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-ink', item.mono ? 'font-mono text-[12px] uppercase tracking-wide' : 'text-[13.5px]')}>
                            <Highlight text={item.title} terms={terms} />
                          </span>
                          {item.subtitle && (
                            <span className="block truncate text-[12px] text-faint">
                              <Highlight text={item.subtitle} terms={terms} />
                            </span>
                          )}
                        </span>
                        {idx === active && <CornerDownLeft className="size-3.5 shrink-0 text-faint" />}
                      </Row>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-faint sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> move
            </span>
            <span className="flex items-center gap-1.5">
              <span className="kbd">↵</span> open
            </span>
            <span className="ml-auto truncate">{index?.scopeTitle ? `Searching ${index.scopeTitle}` : 'Searching all films'}</span>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

function Row({ id, index, active, onHover, onClick, children }: { id: string; index: number; active: boolean; onHover: () => void; onClick: () => void; children: ReactNode }) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-index={index}
      onMouseMove={onHover}
      onClick={onClick}
      className={cn('flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2', active && 'bg-hover')}
    >
      {children}
    </div>
  );
}
