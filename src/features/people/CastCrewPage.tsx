import { CalendarSearch, ChevronLeft, ChevronRight, Lock, Mail, Phone, Plus, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { Avatar, Badge, Button, cn, EmptyState, Field, IconButton, Input, Loading, PageContainer, PageHeader, Section, Segmented, Select, Tabs, Tip, toastError } from '@/components/ui';
import { CAST_ROLES, CREW_ROLES } from '@/lib/constants';
import { buildScheduleContext, requiredPeople } from '@/lib/conflicts';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makePerson } from '@/lib/data/factories';
import { formatDate, todayStr } from '@/lib/dates';
import { useProjectData, type ProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import type { Person } from '@/lib/types';
import { NameDialog } from '../locations/NameDialog';
import { dayNumber, monthDays, monthLabel, shiftMonth, weekdayShort } from '../schedule/calendar';
import { FindDates } from '../schedule/FindDates';
import { PersonSheet } from './PersonSheet';

type Tab = 'team' | 'participation' | 'availability';

export function isCast(p: Person, playsCharacter: boolean): boolean {
  return playsCharacter || p.roles.some((r) => CAST_ROLES.includes(r));
}

export default function CastCrewPage() {
  const { project } = useWorkspace();
  const data = useProjectData(project.id);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState('Actor');

  const tab = (params.get('tab') as Tab | null) ?? 'team';
  const personId = params.get('person') ?? undefined;
  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  if (data === undefined) return <Loading label="Loading cast and crew" />;
  if (data === null) return null;
  const { people } = data;

  const create = async (name: string) => {
    try {
      const p = await createRecord('people', makePerson(project.id, { name, roles: newRole ? [newRole] : [] }));
      setParam('person', p.id);
    } catch (e) {
      toastError(e, 'Person not added');
    }
  };

  return (
    <PageContainer wide={tab !== 'team'}>
      <PageHeader
        eyebrow="Production team"
        title="Cast & Crew"
        description="Everyone on the production, what they do, who they play, and when they can work. Contact details are optional."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Add person
          </Button>
        }
      >
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParam('tab', t === 'team' ? undefined : t)}
          tabs={[
            { value: 'team', label: 'Team', count: people.length },
            { value: 'participation', label: 'Scene participation' },
            { value: 'availability', label: 'Availability' },
          ]}
        />
      </PageHeader>

      {tab === 'team' && <Team data={data} onOpen={(id) => setParam('person', id)} onCreate={() => setCreating(true)} />}
      {tab === 'participation' && <Participation data={data} onOpen={(id) => setParam('person', id)} />}
      {tab === 'availability' && <Availability data={data} onOpen={(id) => setParam('person', id)} />}

      <PersonSheet
        projectId={project.id}
        person={people.find((p) => p.id === personId)}
        people={people}
        characters={data.characters}
        tasks={data.tasks}
        events={data.events}
        scenes={data.scenes}
        locations={data.locations}
        open={!!personId && people.some((p) => p.id === personId)}
        onOpenChange={(o) => !o && setParam('person', undefined)}
      />

      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title="Add a person"
        description="Only a name is needed. Contact details and availability can be added any time."
        placeholder="e.g. Jordan Reyes"
        confirmLabel="Add person"
        onSubmit={create}
      >
        <Field label="Role">
          <Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="">No role yet</option>
            {[...CREW_ROLES, ...CAST_ROLES.filter((r) => r !== 'Actor')].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
      </NameDialog>
    </PageContainer>
  );
}

// ─── Team ───────────────────────────────────────────────────────────────────

function Team({ data, onOpen, onCreate }: { data: ProjectData; onOpen: (id: string) => void; onCreate: () => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'cast' | 'crew'>('all');
  const today = todayStr();
  const { people, characters, tasks } = data;
  const playedBy = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of characters) if (c.actorId) m.set(c.actorId, [...(m.get(c.actorId) ?? []), c.name]);
    return m;
  }, [characters]);

  if (!people.length) {
    return (
      <EmptyState
        icon={<UserRound className="size-6" />}
        title="No one on the team yet"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={onCreate}>
            Add the first person
          </Button>
        }
      >
        Add actors and crew to assign characters, tasks and filming days. You don’t need anyone’s contact details or an invitation to plan with them.
      </EmptyState>
    );
  }

  const filtered = people.filter((p) => {
    const cast = isCast(p, playedBy.has(p.id));
    if (filter === 'cast' && !cast) return false;
    if (filter === 'crew' && cast && !p.roles.some((r) => !CAST_ROLES.includes(r))) return false;
    return !q.trim() || `${p.name} ${p.roles.join(' ')} ${(playedBy.get(p.id) ?? []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase());
  });
  const uncast = characters.filter((c) => !c.actorId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, roles, characters" className="pl-8" aria-label="Search team" />
        </div>
        <Segmented<'all' | 'cast' | 'crew'>
          label="Filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'cast', label: 'Cast' },
            { value: 'crew', label: 'Crew' },
          ]}
        />
      </div>
      {uncast.length > 0 && (
        <Tip id="people-uncast">
          {uncast.length} character{uncast.length === 1 ? ' is' : 's are'} not cast yet ({uncast.slice(0, 4).map((c) => c.name).join(', ')}
          {uncast.length > 4 ? '…' : ''}). Open a person and choose “Characters played” to cast them.
        </Tip>
      )}
      {filtered.length === 0 ? (
        <EmptyState compact title="No matches">Try a different search or filter.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const plays = playedBy.get(p.id) ?? [];
            const open = tasks.filter((t) => t.assigneeId === p.id && t.status !== 'done').length;
            const off = p.unavailableDates.filter((d) => d >= today).sort();
            return (
              <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="panel flex gap-3 p-4 text-left transition-colors hover:border-line-strong animate-rise">
                <Avatar name={p.name} assetId={p.photoAssetId} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[15px] font-medium text-ink">{p.name}</h3>
                    {p.isYou && <Badge tone="accent">You</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.roles.length ? p.roles.map((r) => <span key={r} className="chip h-5 text-[11px]">{r}</span>) : <span className="text-[12px] text-faint">No role yet</span>}
                  </div>
                  {plays.length > 0 && <p className="mt-2 truncate text-[12.5px] text-muted">as {plays.join(', ')}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
                    {(p.email || p.phone) && (
                      <span className="inline-flex items-center gap-1" title="Private contact details on file">
                        <Lock className="size-3" />
                        {p.email && <Mail className="size-3" />}
                        {p.phone && <Phone className="size-3" />}
                      </span>
                    )}
                    <span>
                      {open} open task{open === 1 ? '' : 's'}
                    </span>
                    <span className={off.length ? 'text-warning' : ''}>{off.length ? `Off ${off.length} upcoming day${off.length === 1 ? '' : 's'} · next ${formatDate(off[0], 'd MMM')}` : 'No blocked dates'}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Scene participation ────────────────────────────────────────────────────

function Participation({ data, onOpen }: { data: ProjectData; onOpen: (id: string) => void }) {
  const { scenes, characters, people } = data;
  const numbers = useMemo(() => sceneNumbers(scenes), [scenes]);
  const personById = new Map(people.map((p) => [p.id, p]));

  const rows = useMemo(() => {
    const byActor = new Map<string, string[]>();
    const uncast: { key: string; label: string; sub: string; characterIds: string[]; personId?: string }[] = [];
    for (const c of characters) {
      if (c.actorId && personById.has(c.actorId)) byActor.set(c.actorId, [...(byActor.get(c.actorId) ?? []), c.id]);
      else uncast.push({ key: c.id, label: c.name, sub: 'Not cast', characterIds: [c.id] });
    }
    const cast = [...byActor.entries()]
      .map(([pid, cids]) => ({ key: pid, personId: pid, label: personById.get(pid)!.name, sub: cids.map((id) => characters.find((c) => c.id === id)?.name).join(', '), characterIds: cids }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [...cast, ...uncast];
  }, [characters, people]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!scenes.length || !characters.length) {
    return (
      <EmptyState compact icon={<UserRound className="size-5" />} title="Nothing to cross-reference yet">
        This view shows which cast members each scene needs. It fills in once you have scenes and characters — characters are detected from dialogue in your script.
      </EmptyState>
    );
  }

  const inScene = (characterIds: string[], sceneCharIds: string[]) => characterIds.some((id) => sceneCharIds.includes(id));

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted">Rows are cast members (and characters still to cast); columns are scenes in story order. Click a scene number to open it.</p>
      <div className="w-fit max-w-full overflow-x-auto rounded-md border border-line">
        <table className="border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[190px] border-b border-r border-line bg-panel px-3 py-2 text-left">
                <span className="eyebrow">Cast</span>
              </th>
              {scenes.map((s) => (
                <th key={s.id} className="border-b border-line bg-panel px-0 py-1.5 font-normal">
                  <Link to={`../scenes?scene=${s.id}`} title={s.heading} className="mx-auto flex h-6 w-7 items-center justify-center rounded-xs font-mono text-[10.5px] text-muted hover:bg-hover hover:text-accent">
                    {numbers.get(s.id)}
                  </Link>
                </th>
              ))}
              <th className="border-b border-l border-line bg-panel px-3 py-2 text-right">
                <span className="eyebrow">Scenes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const count = scenes.filter((s) => inScene(r.characterIds, s.characterIds)).length;
              return (
                <tr key={r.key} className="group">
                  <th className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-raised">
                    {r.personId ? (
                      <button type="button" onClick={() => onOpen(r.personId!)} className="block max-w-[200px] text-left">
                        <span className="block truncate text-[12.5px] text-ink hover:text-accent">{r.label}</span>
                        <span className="block truncate text-[11px] text-faint">{r.sub}</span>
                      </button>
                    ) : (
                      <Link to={`../characters?character=${r.key}`} className="block max-w-[200px]">
                        <span className="block truncate text-[12.5px] text-muted hover:text-accent">{r.label}</span>
                        <span className="block truncate text-[11px] text-warning">{r.sub}</span>
                      </Link>
                    )}
                  </th>
                  {scenes.map((s) => {
                    const on = inScene(r.characterIds, s.characterIds);
                    return (
                      <td key={s.id} className="border-b border-line p-0 text-center group-hover:bg-raised/60">
                        {on ? <span className={cn('mx-auto block size-2.5 rounded-full', r.personId ? 'bg-accent' : 'bg-warning/70')} aria-label="In scene" /> : <span className="sr-only">Not in scene</span>}
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-line px-3 text-right font-mono text-muted">{count}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="sticky left-0 z-10 border-r border-line bg-panel px-3 py-2 text-left">
                <span className="eyebrow">Cast needed</span>
              </th>
              {scenes.map((s) => {
                const n = rows.filter((r) => r.personId && inScene(r.characterIds, s.characterIds)).length;
                return (
                  <td key={s.id} className="bg-panel py-2 text-center font-mono text-[11px] text-muted">
                    {n || '·'}
                  </td>
                );
              })}
              <td className="border-l border-line bg-panel" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Availability ───────────────────────────────────────────────────────────

function Availability({ data, onOpen }: { data: ProjectData; onOpen: (id: string) => void }) {
  const { project } = useWorkspace();
  const today = todayStr();
  const [anchor, setAnchor] = useState(today);
  const [who, setWho] = useState<'all' | 'cast'>('all');
  const { people, characters, events, scenes, locations } = data;
  const ctx = useMemo(() => buildScheduleContext({ scenes, characters, people, locations }), [scenes, characters, people, locations]);
  const days = monthDays(anchor);
  const todayRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    // Bring today's column into view when the month doesn't fit the screen.
    todayRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [anchor]);
  const playing = new Set(characters.map((c) => c.actorId).filter(Boolean));
  const rows = people.filter((p) => who === 'all' || isCast(p, playing.has(p.id)));
  const filmingByDate = new Map<string, number>();
  const neededByDate = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type === 'filming') filmingByDate.set(e.date, (filmingByDate.get(e.date) ?? 0) + 1);
    const req = requiredPeople(e, ctx);
    if (req.length) neededByDate.set(e.date, new Set([...(neededByDate.get(e.date) ?? []), ...req]));
  }

  const toggle = async (p: Person, d: string) => {
    const off = p.unavailableDates.includes(d);
    try {
      await updateRecord<Person>('people', p.id, { unavailableDates: off ? p.unavailableDates.filter((x) => x !== d) : [...p.unavailableDates, d].sort() });
    } catch (e) {
      toastError(e, 'Availability not saved');
    }
  };

  return (
    <div className="space-y-8">
      {people.length === 0 ? (
        <EmptyState compact icon={<UserRound className="size-5" />} title="No one to schedule yet">
          Add cast and crew, then mark the days they can’t work.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="Previous month" onClick={() => setAnchor(shiftMonth(anchor, -1))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="min-w-[130px] text-center text-[14px] font-medium">{monthLabel(anchor)}</span>
            <IconButton label="Next month" onClick={() => setAnchor(shiftMonth(anchor, 1))}>
              <ChevronRight className="size-4" />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
              Today
            </Button>
            <Segmented<'all' | 'cast'> className="ml-auto" size="sm" label="Show" value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, { value: 'cast', label: 'Cast only' }]} />
          </div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="border-separate border-spacing-0 text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[136px] border-b border-r border-line bg-panel px-3 py-2 text-left">
                    <span className="eyebrow">Person</span>
                  </th>
                  {days.map((d) => (
                    <th key={d} ref={d === today ? todayRef : undefined} className={cn('w-[26px] min-w-[26px] border-b border-line bg-panel px-0 py-1 font-normal', d === today && 'bg-accent-soft')}>
                      <div className="font-mono text-[9.5px] uppercase text-faint">{weekdayShort(d).slice(0, 2)}</div>
                      <div className={cn('font-mono text-[11px]', d === today ? 'text-accent' : 'text-muted')}>{dayNumber(d)}</div>
                      <div className="mx-auto mt-0.5 h-1 w-4 rounded-full" style={{ background: filmingByDate.has(d) ? 'var(--c-accent)' : 'transparent' }} title={filmingByDate.has(d) ? 'Filming day' : undefined} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <th className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-1 text-left font-normal">
                      <button type="button" onClick={() => onOpen(p.id)} className="block max-w-[150px] truncate text-[12.5px] text-ink hover:text-accent">
                        {p.name}
                      </button>
                    </th>
                    {days.map((d) => {
                      const off = p.unavailableDates.includes(d);
                      const needed = neededByDate.get(d)?.has(p.id) ?? false;
                      return (
                        <td key={d} className="border-b border-line p-[1px]">
                          <button
                            type="button"
                            onClick={() => void toggle(p, d)}
                            aria-pressed={off}
                            aria-label={`${p.name}, ${formatDate(d)}: ${off ? 'unavailable' : 'available'}${needed ? ', needed on set' : ''}`}
                            title={off && needed ? 'Unavailable but needed on set' : needed ? 'Needed on set' : off ? 'Unavailable' : 'Available — click to mark unavailable'}
                            className={cn(
                              'flex h-7 w-full items-center justify-center rounded-xs font-mono text-[10px] transition-colors',
                              off && needed && 'bg-danger text-white',
                              off && !needed && 'bg-danger-soft text-danger',
                              !off && needed && 'bg-accent-soft text-accent ring-1 ring-inset ring-accent/40',
                              !off && !needed && 'hover:bg-hover',
                            )}
                          >
                            {off ? '✕' : needed ? '●' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th className="sticky left-0 z-10 border-r border-line bg-panel px-3 py-1.5 text-left">
                    <span className="eyebrow">Available</span>
                  </th>
                  {days.map((d) => {
                    const free = rows.filter((p) => !p.unavailableDates.includes(d)).length;
                    return (
                      <td key={d} className={cn('bg-panel py-1.5 text-center font-mono text-[10.5px]', free === rows.length ? 'text-success' : 'text-muted')}>
                        {free}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-faint">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-xs bg-danger-soft" /> Unavailable
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-xs bg-accent-soft ring-1 ring-accent/40" /> Needed on set
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-xs bg-danger" /> Conflict
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full bg-accent" /> Filming day
            </span>
            <span>Click a cell to toggle a day off.</span>
          </div>
        </div>
      )}

      <Section title="Find filming dates" description="Days in the next two months when everyone a set of scenes needs — cast and locations — is free and not booked elsewhere.">
        <div className="panel p-4">
          {scenes.length ? (
            <FindDates projectId={project.id} scenes={scenes} characters={characters} people={people} locations={locations} events={events} />
          ) : (
            <p className="flex items-center gap-2 text-[12.5px] text-faint">
              <CalendarSearch className="size-4" /> Add scenes first — write the script or create scenes in Scenes.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
