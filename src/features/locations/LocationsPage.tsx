import { AlertOctagon, Box, ChevronRight, Lock, MapPin, Plus, Search, Shirt, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { LocationStatusBadge } from '@/components/StatusBadges';
import { AssetImage, Badge, Button, cn, EmptyState, Input, Loading, PageContainer, PageHeader, Segmented, Tabs, Tip, toastError } from '@/components/ui';
import { ITEM_STATUSES, LOCATION_STATUSES } from '@/lib/constants';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeItem, makeLocation } from '@/lib/data/factories';
import { formatShortDate, todayStr } from '@/lib/dates';
import { useProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import { filmingDates } from '@/lib/readiness';
import type { Character, Item, ItemKind, ItemStatus, Location, LocationStatus, Person, Scene, ScheduleEvent } from '@/lib/types';
import { ItemSheet } from './ItemSheet';
import { LocationSheet } from './LocationSheet';
import { NameDialog } from './NameDialog';

type Tab = 'locations' | 'props' | 'wardrobe' | 'blocked';

export default function LocationsPage() {
  const { project } = useWorkspace();
  const data = useProjectData(project.id);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState<null | 'location' | ItemKind>(null);

  const locationId = params.get('location') ?? undefined;
  const itemId = params.get('item') ?? undefined;
  const deepItem = itemId ? data?.items.find((i) => i.id === itemId) : undefined;
  const tab: Tab = (params.get('tab') as Tab | null) ?? (deepItem ? (deepItem.kind === 'wardrobe' ? 'wardrobe' : 'props') : 'locations');

  const setParam = (key: string, value: string | undefined) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  const blocked = useMemo(() => (data ? blockingGroups(data) : []), [data]);

  if (data === undefined) return <Loading label="Loading locations" />;
  if (data === null) return null;

  const { locations, items, scenes, people, characters, events } = data;
  const props = items.filter((i) => i.kind === 'prop');
  const wardrobe = items.filter((i) => i.kind === 'wardrobe');
  const blockedSceneCount = new Set(blocked.flatMap((g) => g.scenes.map((s) => s.scene.id))).size;

  const createLocation = async (name: string, status: LocationStatus = 'scouting') => {
    try {
      const l = await createRecord('locations', makeLocation(project.id, { name, status }));
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('location', l.id);
        next.delete('tab');
        return next;
      });
    } catch (e) {
      toastError(e, 'Location not created');
    }
  };
  const createItem = async (kind: ItemKind, name: string) => {
    try {
      const it = await createRecord('items', makeItem(project.id, kind, { name }));
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('item', it.id);
        next.set('tab', kind === 'wardrobe' ? 'wardrobe' : 'props');
        return next;
      });
    } catch (e) {
      toastError(e, 'Not created');
    }
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Production resources"
        title="Locations & Props"
        description="Where you film and what you need there. Anything unavailable flags the scenes that depend on it."
        actions={
          tab === 'locations' || tab === 'blocked' ? (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating('location')}>
              New location
            </Button>
          ) : (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(tab === 'wardrobe' ? 'wardrobe' : 'prop')}>
              {tab === 'wardrobe' ? 'New costume' : 'New prop'}
            </Button>
          )
        }
      >
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParam('tab', t === 'locations' ? undefined : t)}
          tabs={[
            { value: 'locations', label: 'Locations', count: locations.length },
            { value: 'props', label: 'Props', count: props.length },
            { value: 'wardrobe', label: 'Wardrobe', count: wardrobe.length },
            { value: 'blocked', label: blockedSceneCount ? <span className="text-danger">Blocked scenes</span> : 'Blocked scenes', count: blockedSceneCount },
          ]}
        />
      </PageHeader>

      {tab === 'locations' && <LocationsGrid locations={locations} scenes={scenes} onOpen={(id) => setParam('location', id)} onCreate={() => setCreating('location')} />}
      {tab === 'props' && <Inventory kind="prop" items={props} scenes={scenes} people={people} onOpen={(id) => setParam('item', id)} onCreate={() => setCreating('prop')} />}
      {tab === 'wardrobe' && <Inventory kind="wardrobe" items={wardrobe} scenes={scenes} people={people} characters={characters} onOpen={(id) => setParam('item', id)} onCreate={() => setCreating('wardrobe')} />}
      {tab === 'blocked' && <BlockedScenes groups={blocked} scenes={scenes} />}

      <LocationSheet
        projectId={project.id}
        location={locations.find((l) => l.id === locationId)}
        scenes={scenes}
        events={events}
        open={!!locationId && locations.some((l) => l.id === locationId)}
        onOpenChange={(o) => !o && setParam('location', undefined)}
      />
      <ItemSheet
        projectId={project.id}
        item={items.find((i) => i.id === itemId)}
        scenes={scenes}
        people={people}
        characters={characters}
        open={!!itemId && items.some((i) => i.id === itemId)}
        onOpenChange={(o) => !o && setParam('item', undefined)}
      />

      <NameDialog
        open={creating === 'location'}
        onOpenChange={(o) => !o && setCreating(null)}
        title="New location"
        description="Name it the way your scene headings do, e.g. “Hale House”, so scenes link to it automatically."
        placeholder="e.g. Harbour Diner"
        onSubmit={(name) => createLocation(name)}
        requiredMessage="A location needs a name."
      />
      <NameDialog
        open={creating === 'prop' || creating === 'wardrobe'}
        onOpenChange={(o) => !o && setCreating(null)}
        title={creating === 'wardrobe' ? 'New costume' : 'New prop'}
        placeholder={creating === 'wardrobe' ? 'e.g. Mara’s red raincoat' : 'e.g. Brass lighthouse key'}
        onSubmit={(name) => createItem(creating === 'wardrobe' ? 'wardrobe' : 'prop', name)}
      />
    </PageContainer>
  );
}

// ─── Locations ──────────────────────────────────────────────────────────────

function LocationsGrid({ locations, scenes, onOpen, onCreate }: { locations: Location[]; scenes: Scene[]; onOpen: (id: string) => void; onCreate: () => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | LocationStatus>('all');
  const today = todayStr();
  const filtered = locations.filter(
    (l) =>
      (status === 'all' || l.status === status) &&
      (!q.trim() || `${l.name} ${l.address} ${l.description}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  // Scene headings that name a place with no location profile yet.
  const unprofiled = [...new Set(scenes.filter((s) => !s.locationId && s.locationName).map((s) => s.locationName))];

  if (!locations.length) {
    return (
      <EmptyState
        icon={<MapPin className="size-6" />}
        title="No locations yet"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={onCreate}>
            Add your first location
          </Button>
        }
      >
        Keep photos, access notes, availability and private contact details for every place you film.
        {unprofiled.length > 0 && <span className="mt-2 block text-faint">Your script mentions {unprofiled.slice(0, 3).join(', ')}{unprofiled.length > 3 ? '…' : ''}.</span>}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <Tip id="locations-autolink">Scenes link to a location automatically when the heading names it — “INT. HALE HOUSE - KITCHEN” links to a location called “Hale House”.</Tip>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search locations" className="pl-8" aria-label="Search locations" />
        </div>
        <Segmented<'all' | LocationStatus>
          label="Filter by status"
          size="sm"
          value={status}
          onChange={setStatus}
          options={[{ value: 'all', label: 'All' }, ...LOCATION_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState compact title="No matching locations">
          Try a different search or status.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((l) => {
            const count = scenes.filter((s) => s.locationId === l.id).length;
            const upcomingOff = l.unavailableDates.filter((d) => d >= today).length;
            return (
              <button key={l.id} type="button" onClick={() => onOpen(l.id)} className="panel group overflow-hidden text-left transition-colors hover:border-line-strong animate-rise">
                <div className="relative aspect-[16/9] bg-raised">
                  {l.photoAssetIds[0] ? (
                    <AssetImage assetId={l.photoAssetIds[0]} alt={l.name} className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.02]" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-faint">
                      <MapPin className="size-5" />
                      <span className="text-[11.5px]">No photos yet</span>
                    </div>
                  )}
                  {l.photoAssetIds.length > 1 && <span className="absolute bottom-2 right-2 rounded-xs bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white">{l.photoAssetIds.length} photos</span>}
                </div>
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="display min-w-0 truncate text-[22px] text-ink">{l.name || 'Untitled location'}</h3>
                    <LocationStatusBadge status={l.status} />
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] text-muted">
                    <Lock className="size-3 shrink-0 text-faint" aria-label="Private" />
                    <span className="truncate">{l.address || 'No address yet'}</span>
                  </p>
                  <div className="slate mt-3 flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      {count} scene{count === 1 ? '' : 's'}
                    </span>
                    {upcomingOff > 0 && (
                      <span className="text-warning">
                        {upcomingOff} day{upcomingOff === 1 ? '' : 's'} unavailable
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {unprofiled.length > 0 && (
        <p className="text-[12px] text-faint">
          Headings without a location profile: {unprofiled.slice(0, 6).join(', ')}
          {unprofiled.length > 6 ? ` and ${unprofiled.length - 6} more` : ''}.
        </p>
      )}
    </div>
  );
}

// ─── Props & wardrobe ───────────────────────────────────────────────────────

function Inventory({
  kind,
  items,
  scenes,
  people,
  characters = [],
  onOpen,
  onCreate,
}: {
  kind: ItemKind;
  items: Item[];
  scenes: Scene[];
  people: Person[];
  characters?: Character[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | ItemStatus>('all');
  const numbers = useMemo(() => sceneNumbers(scenes), [scenes]);
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const charById = new Map(characters.map((c) => [c.id, c]));
  const noun = kind === 'wardrobe' ? 'costume' : 'prop';
  const Icon = kind === 'wardrobe' ? Shirt : Box;
  const filtered = items.filter((i) => (status === 'all' || i.status === status) && (!q.trim() || `${i.name} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase())));

  if (!items.length) {
    return (
      <EmptyState
        icon={<Icon className="size-6" />}
        title={kind === 'wardrobe' ? 'No wardrobe yet' : 'No props yet'}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={onCreate}>
            Add a {noun}
          </Button>
        }
      >
        Track every {noun}: who is responsible, how many you need, which scenes need it, and whether it’s ready for set.
      </EmptyState>
    );
  }

  const setItemStatus = (it: Item, s: ItemStatus) => updateRecord<Item>('items', it.id, { status: s }).catch((e) => toastError(e, 'Not saved'));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind === 'wardrobe' ? 'wardrobe' : 'props'}`} className="pl-8" aria-label={`Search ${noun}s`} />
        </div>
        <Segmented<'all' | ItemStatus>
          label="Filter by status"
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: `All ${items.length}` },
            ...ITEM_STATUSES.map((s) => ({ value: s.value, label: `${s.label} ${items.filter((i) => i.status === s.value).length}` })),
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-md border border-line">
        <div className="hidden grid-cols-[56px_minmax(0,1fr)_150px_70px_150px_minmax(0,160px)] items-center gap-3 border-b border-line bg-panel px-3 py-2 md:grid">
          <span />
          <span className="eyebrow">{kind === 'wardrobe' ? 'Costume' : 'Prop'}</span>
          <span className="eyebrow">Status</span>
          <span className="eyebrow text-right">Qty</span>
          <span className="eyebrow">Responsible</span>
          <span className="eyebrow">Scenes</span>
        </div>
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-faint">No matches.</p>}
        <ul className="divide-y divide-line">
          {filtered.map((it) => {
            const sceneNums = it.sceneIds.map((id) => numbers.get(id)).filter(Boolean);
            return (
              <li key={it.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(it.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(it.id);
                    }
                  }}
                  className="grid cursor-pointer grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors hover:bg-hover/50 md:grid-cols-[56px_minmax(0,1fr)_150px_70px_150px_minmax(0,160px)]"
                >
                  <div className="row-span-2 size-12 overflow-hidden rounded-sm border border-line bg-raised md:row-span-1 md:size-14">
                    <AssetImage assetId={it.photoAssetId} alt={it.name} className="size-full" fallback={<div className="flex size-full items-center justify-center text-faint"><Icon className="size-4" /></div>} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink">{it.name}</div>
                    <div className="truncate text-[12px] text-faint">
                      {kind === 'wardrobe' && it.characterId ? `${charById.get(it.characterId)?.name ?? ''} · ` : ''}
                      {it.description || 'No description'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:contents">
                    <select
                      value={it.status}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => void setItemStatus(it, e.target.value as ItemStatus)}
                      aria-label={`Status of ${it.name}`}
                      className={cn(
                        'input h-7 w-auto py-0 pl-2 text-[12px]',
                        it.status === 'available' && 'text-success',
                        it.status === 'needed' && 'text-warning',
                        it.status === 'unavailable' && 'text-danger',
                      )}
                    >
                      {ITEM_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <span className="font-mono text-[12.5px] text-muted md:text-right">×{it.quantity}</span>
                    <span className="truncate text-[12.5px] text-muted">{it.responsibleId ? peopleById.get(it.responsibleId)?.name ?? '—' : <span className="text-faint">Unassigned</span>}</span>
                    <span className="truncate font-mono text-[11.5px] text-faint">{sceneNums.length ? `Sc. ${sceneNums.join(', ')}` : 'No scenes'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ─── Blocked scenes ─────────────────────────────────────────────────────────

interface BlockGroup {
  key: string;
  kind: 'location' | 'prop' | 'wardrobe' | 'cast';
  title: string;
  reason: string;
  fixLink: string;
  fixLabel: string;
  scenes: { scene: Scene; text: string }[];
}

/**
 * The same rules as scene readiness (lib/readiness), grouped by the resource
 * that blocks filming, so one fix shows how many scenes it unblocks.
 */
function blockingGroups(d: { scenes: Scene[]; locations: Location[]; items: Item[]; characters: Character[]; people: Person[]; events: ScheduleEvent[] }): BlockGroup[] {
  const groups = new Map<string, BlockGroup>();
  const add = (g: Omit<BlockGroup, 'scenes'>, scene: Scene, text: string) => {
    const existing = groups.get(g.key) ?? { ...g, scenes: [] };
    if (!existing.scenes.some((s) => s.scene.id === scene.id && s.text === text)) existing.scenes.push({ scene, text });
    groups.set(g.key, existing);
  };
  const locById = new Map(d.locations.map((l) => [l.id, l]));
  const charById = new Map(d.characters.map((c) => [c.id, c]));
  const personById = new Map(d.people.map((p) => [p.id, p]));

  for (const scene of d.scenes) {
    if (scene.status === 'filmed') continue;
    const dates = filmingDates(scene.id, d.events);
    const loc = scene.locationId ? locById.get(scene.locationId) : undefined;
    if (loc) {
      const base = { key: `loc:${loc.id}`, kind: 'location' as const, title: loc.name, fixLink: `?location=${loc.id}`, fixLabel: 'Open location' };
      if (loc.status === 'unavailable') add({ ...base, reason: 'Location marked unavailable' }, scene, 'Location unavailable');
      for (const dt of dates) if (loc.unavailableDates.includes(dt)) add({ ...base, reason: 'Unavailable on scheduled filming days' }, scene, `Unavailable on ${formatShortDate(dt)}`);
    }
    for (const it of d.items) {
      if (!it.sceneIds.includes(scene.id) || it.status === 'available') continue;
      add(
        {
          key: `item:${it.id}`,
          kind: it.kind === 'wardrobe' ? 'wardrobe' : 'prop',
          title: it.name,
          reason: it.status === 'unavailable' ? 'Unavailable' : 'Not yet sourced',
          fixLink: `?item=${it.id}&tab=${it.kind === 'wardrobe' ? 'wardrobe' : 'props'}`,
          fixLabel: it.kind === 'wardrobe' ? 'Open costume' : 'Open prop',
        },
        scene,
        it.status === 'unavailable' ? 'Unavailable' : 'Not yet sourced',
      );
    }
    for (const cid of scene.characterIds) {
      const actor = charById.get(cid)?.actorId ? personById.get(charById.get(cid)!.actorId!) : undefined;
      if (!actor) continue;
      for (const dt of dates) {
        if (actor.unavailableDates.includes(dt)) {
          add(
            { key: `person:${actor.id}`, kind: 'cast', title: actor.name, reason: 'Unavailable on scheduled filming days', fixLink: `../people?person=${actor.id}`, fixLabel: 'Open person' },
            scene,
            `${charById.get(cid)?.name} · ${formatShortDate(dt)}`,
          );
        }
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.scenes.length - a.scenes.length);
}

const KIND_ICON = { location: MapPin, prop: Box, wardrobe: Shirt, cast: UserRound };
const KIND_LABEL = { location: 'Location', prop: 'Prop', wardrobe: 'Costume', cast: 'Cast' };

function BlockedScenes({ groups, scenes }: { groups: BlockGroup[]; scenes: Scene[] }) {
  const numbers = useMemo(() => sceneNumbers(scenes), [scenes]);
  if (!scenes.length) {
    return (
      <EmptyState compact icon={<AlertOctagon className="size-5" />} title="No scenes yet">
        Once your script has scenes, any that can’t be filmed because a location, prop or costume is unavailable show up here.
      </EmptyState>
    );
  }
  if (!groups.length) {
    return (
      <EmptyState compact icon={<AlertOctagon className="size-5" />} title="Nothing is blocking filming">
        Every location, prop and costume your scenes depend on is available on its scheduled days. Scenes still missing a location profile or cast are listed in Scenes.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        These resources stop {new Set(groups.flatMap((g) => g.scenes.map((s) => s.scene.id))).size} scene(s) from being filmed. Fix the resource to unblock every scene under it.
      </p>
      {groups.map((g) => {
        const Icon = KIND_ICON[g.kind];
        return (
          <div key={g.key} className="panel overflow-hidden animate-rise">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <span className="flex size-8 items-center justify-center rounded-full border border-danger/40 text-danger">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="slate">{KIND_LABEL[g.kind]}</div>
                <div className="truncate text-[14px] font-medium text-ink">
                  {g.title} <span className="font-normal text-danger">— {g.reason}</span>
                </div>
              </div>
              <Badge tone="danger">
                {g.scenes.length} scene{g.scenes.length === 1 ? '' : 's'}
              </Badge>
              <Link to={g.fixLink} className="btn btn-secondary btn-sm">
                {g.fixLabel} <ChevronRight className="size-3.5" />
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {g.scenes.map(({ scene, text }) => (
                <li key={scene.id + text} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                  <span className="w-7 shrink-0 font-mono text-[11px] text-faint">{numbers.get(scene.id)}</span>
                  <Link to={`../scenes?scene=${scene.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent">
                    {scene.heading || 'Untitled scene'}
                  </Link>
                  <span className="shrink-0 text-faint">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
