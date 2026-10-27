import { Clapperboard, FilePlus2, LayoutGrid, List, ListOrdered, PenLine, Plus, Route, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { Button, cn, EmptyState, Input, Loading, PageContainer, PageHeader, Segmented, Select, Tip, toast, toastError, toastUndo } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { addSceneToScript, reorderScenes } from '@/lib/data/scenes';
import { useProjectData } from '@/lib/hooks';
import type { Readiness } from '@/lib/readiness';
import { NewSceneDialog } from './NewSceneDialog';
import { SceneDetailSheet } from './SceneDetailSheet';
import { buildSceneInfo, type SceneInfo } from './sceneInfo';
import { AddToScriptButton, CardsView, FilmingDates, ListView, SortableSceneList } from './SceneViews';

type View = 'cards' | 'list' | 'script' | 'production';
type ReadyFilter = 'all' | Readiness | 'reshoot';

const VIEW_KEY = 'sceneforge:scenes-view';

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'cards' || v === 'list' || v === 'script' || v === 'production') return v;
  } catch {
    /* storage unavailable */
  }
  return 'cards';
}

const STRIP: { value: Readiness; label: string; bar: string; text: string }[] = [
  { value: 'ready', label: 'Ready to film', bar: 'bg-success', text: 'text-success' },
  { value: 'prep', label: 'Needs prep', bar: 'bg-faint', text: 'text-muted' },
  { value: 'blocked', label: 'Blocked', bar: 'bg-danger', text: 'text-danger' },
  { value: 'filmed', label: 'Filmed', bar: 'bg-accent', text: 'text-accent' },
];

export default function ScenesPage() {
  const { project, openAssistant } = useWorkspace();
  const data = useProjectData(project.id);
  const [params, setParams] = useSearchParams();
  const openId = params.get('scene');
  const [view, setViewState] = useState<View>(loadView);
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [char, setChar] = useState('');
  const [ready, setReady] = useState<ReadyFilter>('all');
  const [date, setDate] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const derived = useMemo(() => (data ? buildSceneInfo(data) : null), [data]);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const openScene = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('scene', id);
    setParams(next);
  };
  const closeScene = () => {
    const next = new URLSearchParams(params);
    next.delete('scene');
    setParams(next, { replace: true });
  };

  if (data === undefined || !derived) return <Loading label="Loading scenes" />;
  if (data === null) return null;

  const all = data.scenes.map((s) => derived.infos.get(s.id)!).filter(Boolean);
  const counts = {
    ready: all.filter((i) => i.readiness === 'ready').length,
    prep: all.filter((i) => i.readiness === 'prep').length,
    blocked: all.filter((i) => i.readiness === 'blocked').length,
    filmed: all.filter((i) => i.readiness === 'filmed').length,
  };

  const filmingDays = [...new Set(data.events.filter((e) => e.type === 'filming').map((e) => e.date))].sort();
  const locationChoices = [
    ...data.locations.map((l) => ({ value: `loc:${l.id}`, label: l.name || 'Unnamed location' })),
    ...[...new Set(data.scenes.filter((s) => !s.locationId && s.locationName).map((s) => s.locationName))].sort().map((n) => ({ value: `name:${n}`, label: `${n} (no profile)` })),
  ];

  const filtersActive = !!(q.trim() || loc || char || ready !== 'all' || date);
  const needle = q.trim().toLowerCase();
  const matches = (i: SceneInfo) => {
    const s = i.scene;
    if (needle) {
      const hay = `${i.number} ${s.heading} ${s.summary} ${s.scriptExcerpt} ${s.notes} ${i.characters.map((c) => c.name).join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (loc) {
      if (loc.startsWith('loc:') && s.locationId !== loc.slice(4)) return false;
      if (loc.startsWith('name:') && (s.locationId || s.locationName !== loc.slice(5))) return false;
    }
    if (char && !s.characterIds.includes(char)) return false;
    if (ready === 'reshoot' ? s.status !== 'reshoot' : ready !== 'all' && i.readiness !== ready) return false;
    if (date === 'scheduled' && !i.dates.length) return false;
    if (date === 'unscheduled' && i.dates.length) return false;
    if (date && date !== 'scheduled' && date !== 'unscheduled' && !i.dates.includes(date)) return false;
    return true;
  };
  const filtered = all.filter(matches);
  const clearFilters = () => {
    setQ('');
    setLoc('');
    setChar('');
    setReady('all');
    setDate('');
  };

  const scripted = all.filter((i) => i.scene.inScript);
  const unscripted = all.filter((i) => !i.scene.inScript);

  const reorderStory = async (group: 'scripted' | 'unscripted', next: string[], prev: string[]) => {
    const sIds = scripted.map((i) => i.scene.id);
    const uIds = unscripted.map((i) => i.scene.id);
    const full = group === 'scripted' ? [...next, ...uIds] : [...sIds, ...next];
    const before = group === 'scripted' ? [...prev, ...uIds] : [...sIds, ...prev];
    try {
      await reorderScenes(project.id, full, 'story');
      toastUndo(group === 'scripted' ? 'Scene moved — the script now matches' : 'Scene order updated', () => reorderScenes(project.id, before, 'story'));
    } catch (e) {
      toastError(e, 'Scenes not reordered');
    }
  };

  const reorderProduction = async (next: string[], prev: string[]) => {
    try {
      await reorderScenes(project.id, next, 'production');
      toastUndo('Shooting order updated', () => reorderScenes(project.id, prev, 'production'));
    } catch (e) {
      toastError(e, 'Shooting order not saved');
    }
  };

  const addToScript = async (id: string) => {
    setAdding(id);
    try {
      await addSceneToScript(id);
      toast('Added to the production draft');
    } catch (e) {
      toastError(e, 'Couldn’t add to script');
    } finally {
      setAdding(null);
    }
  };

  const openInfo = openId ? derived.infos.get(openId) : undefined;
  const productionSorted = [...filtered].sort((a, b) => a.scene.productionOrder - b.scene.productionOrder);

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={`${all.length} scene${all.length === 1 ? '' : 's'} · ${counts.ready} ready · ${counts.blocked} blocked · ${counts.filmed} filmed`}
        title="Scenes"
        description="The film, scene by scene. Headings in your production draft become scenes automatically; everything here stays linked to the script, storyboard and shot list."
        actions={
          <>
            <Link to={`/p/${project.id}/script`} className="btn btn-secondary">
              <PenLine className="size-4" /> Open script
            </Link>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setNewOpen(true)}>
              New scene
            </Button>
          </>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="size-6" />}
          title="No scenes yet"
          actions={
            <>
              <Link to={`/p/${project.id}/script`} className="btn btn-primary">
                <PenLine className="size-4" /> Write the first scene
              </Link>
              <Button icon={<Plus className="size-4" />} onClick={() => setNewOpen(true)}>
                Add a scene manually
              </Button>
            </>
          }
        >
          Type a scene heading like <span className="font-script text-ink">INT. KITCHEN – NIGHT</span> in the script and it appears here, ready to break down. Or plan scenes first and add them to the script later.
        </EmptyState>
      ) : (
        <>
          <Tip id="scenes-intro" className="mb-5">
            Click a scene to break it down. In <b className="text-ink">Script order</b>, dragging a scene moves its pages in the screenplay too; <b className="text-ink">Production order</b> is your shooting order and leaves the script alone.
          </Tip>

          {/* Readiness strip */}
          <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {STRIP.map((st) => {
              const n = counts[st.value];
              const active = ready === st.value;
              return (
                <button
                  key={st.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReady(active ? 'all' : st.value)}
                  className={cn('group relative bg-surface px-4 py-3 text-left transition-colors hover:bg-raised', active && 'bg-raised')}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={cn('display text-[30px] leading-none', n ? st.text : 'text-faint')}>{n}</span>
                    <span className="font-mono text-[10.5px] text-faint">{all.length ? Math.round((n / all.length) * 100) : 0}%</span>
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted">{st.label}</div>
                  <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--c-ink)_7%,transparent)]">
                    <div className={cn('h-full rounded-full transition-[width] duration-700', st.bar)} style={{ width: `${all.length ? (n / all.length) * 100 : 0}%` }} />
                  </div>
                  {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" />}
                </button>
              );
            })}
          </div>

          {/* Controls */}
          <div className="mb-5 space-y-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Segmented<View>
                label="Scene view"
                value={view}
                onChange={setView}
                className="max-w-full self-start overflow-x-auto no-scrollbar"
                options={[
                  { value: 'cards', label: <span className="whitespace-nowrap">Cards</span>, icon: <LayoutGrid className="size-3.5" /> },
                  { value: 'list', label: <span className="whitespace-nowrap">List</span>, icon: <List className="size-3.5" /> },
                  { value: 'script', label: <span className="whitespace-nowrap">Script order</span>, icon: <ListOrdered className="size-3.5" /> },
                  { value: 'production', label: <span className="whitespace-nowrap">Production order</span>, icon: <Route className="size-3.5" /> },
                ]}
              />
              <div className="relative sm:ml-auto sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scenes" className="pl-8" aria-label="Search scenes" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
              <Select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Filter by location">
                <option value="">All locations</option>
                {locationChoices.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select value={char} onChange={(e) => setChar(e.target.value)} aria-label="Filter by character">
                <option value="">All characters</option>
                {data.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Unnamed'}
                  </option>
                ))}
              </Select>
              <Select value={ready} onChange={(e) => setReady(e.target.value as ReadyFilter)} aria-label="Filter by status">
                <option value="all">Any status</option>
                <option value="ready">Ready to film</option>
                <option value="prep">Needs prep</option>
                <option value="blocked">Blocked</option>
                <option value="filmed">Filmed</option>
                <option value="reshoot">Needs reshoot</option>
              </Select>
              <Select value={date} onChange={(e) => setDate(e.target.value)} aria-label="Filter by filming date">
                <option value="">Any filming date</option>
                <option value="scheduled">Scheduled</option>
                <option value="unscheduled">Not scheduled</option>
                {filmingDays.map((d) => (
                  <option key={d} value={d}>
                    {formatDate(d)}
                  </option>
                ))}
              </Select>
              {filtersActive && (
                <Button variant="ghost" icon={<X className="size-3.5" />} onClick={clearFilters} className="col-span-2 justify-self-start md:col-span-1">
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {filtersActive && (
            <p className="mb-3 text-[12.5px] text-muted">
              Showing {filtered.length} of {all.length} scenes
              {(view === 'script' || view === 'production') && ' · clear filters to drag and reorder'}
            </p>
          )}

          {filtered.length === 0 ? (
            <EmptyState compact title="No scenes match" actions={<Button onClick={clearFilters}>Clear filters</Button>}>
              Try a different location, character or status.
            </EmptyState>
          ) : view === 'cards' ? (
            <CardsView infos={filtered} onOpen={openScene} />
          ) : view === 'list' ? (
            <ListView infos={filtered} onOpen={openScene} />
          ) : view === 'script' ? (
            <div className="space-y-8">
              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="eyebrow text-muted">In the script · {scripted.filter(matches).length}</h2>
                  <span className="text-[11.5px] text-faint">Story order</span>
                </div>
                {scripted.filter(matches).length ? (
                  <SortableSceneList infos={scripted.filter(matches)} disabled={filtersActive} onOpen={openScene} onReorder={(n, p) => void reorderStory('scripted', n, p)} renderExtra={(i) => <FilmingDates info={i} />} />
                ) : (
                  <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-faint">No scenes from the production draft match.</p>
                )}
              </section>
              {unscripted.filter(matches).length > 0 && (
                <section>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="eyebrow text-warning">Not in script · {unscripted.filter(matches).length}</h2>
                    <span className="text-[11.5px] text-faint">Planned scenes, or headings removed from the draft</span>
                  </div>
                  <SortableSceneList
                    infos={unscripted.filter(matches)}
                    disabled={filtersActive}
                    onOpen={openScene}
                    onReorder={(n, p) => void reorderStory('unscripted', n, p)}
                    renderTrailing={(i) => <AddToScriptButton busy={adding === i.scene.id} onClick={() => void addToScript(i.scene.id)} />}
                  />
                </section>
              )}
            </div>
          ) : (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="eyebrow text-muted">Shooting order</h2>
                <span className="text-[11.5px] text-faint">Doesn’t change the script</span>
              </div>
              <SortableSceneList
                infos={productionSorted}
                disabled={filtersActive}
                onOpen={openScene}
                onReorder={(n, p) => void reorderProduction(n, p)}
                positionLabel={(idx) => String(idx + 1).padStart(2, '0')}
                renderExtra={(i) => (
                  <>
                    <span className="font-mono">Sc {i.number}</span>
                    <FilmingDates info={i} />
                  </>
                )}
              />
            </section>
          )}

          {unscripted.length > 0 && view !== 'script' && !filtersActive && (
            <p className="mt-6 flex items-center gap-2 text-[12px] text-faint">
              <FilePlus2 className="size-3.5" />
              {unscripted.length} scene{unscripted.length === 1 ? ' isn’t' : 's aren’t'} in the production draft yet — see Script order to add {unscripted.length === 1 ? 'it' : 'them'}.
            </p>
          )}
        </>
      )}

      <SceneDetailSheet info={openInfo} data={data} numbers={derived.numbers} open={!!openId} onOpenChange={(o) => !o && closeScene()} openAssistant={openAssistant} />
      <NewSceneDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        projectId={project.id}
        locations={data.locations}
        scenes={data.scenes}
        hasScript={!!project.primaryScriptId}
        onCreated={openScene}
      />
    </PageContainer>
  );
}
