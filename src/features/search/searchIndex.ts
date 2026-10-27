import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { formatShortDate } from '@/lib/dates';
import { eventTypeMeta, stageLabel } from '@/lib/constants';
import { sceneNumbers, shotCodes } from '@/lib/numbering';
import { displayText } from '@/lib/screenplay/paginate';
import type { Project } from '@/lib/types';

export type GroupKey =
  | 'projects'
  | 'scenes'
  | 'script'
  | 'characters'
  | 'locations'
  | 'items'
  | 'people'
  | 'shots'
  | 'tasks'
  | 'assets'
  | 'events';

export const GROUPS: { key: GroupKey; label: string; cap: number }[] = [
  { key: 'projects', label: 'Films', cap: 5 },
  { key: 'scenes', label: 'Scenes', cap: 6 },
  { key: 'script', label: 'In the script', cap: 6 },
  { key: 'characters', label: 'Characters', cap: 5 },
  { key: 'locations', label: 'Locations', cap: 5 },
  { key: 'items', label: 'Props & wardrobe', cap: 5 },
  { key: 'people', label: 'Cast & crew', cap: 5 },
  { key: 'shots', label: 'Shots', cap: 5 },
  { key: 'tasks', label: 'Tasks', cap: 5 },
  { key: 'assets', label: 'Assets', cap: 5 },
  { key: 'events', label: 'Schedule', cap: 5 },
];

export interface Entry {
  key: string;
  group: GroupKey;
  title: string;
  subtitle?: string;
  href: string;
  /** Searchable text; the first field is the primary one and weighs most. */
  fields: string[];
  /** Project title, shown when searching across films. */
  projectTitle?: string;
  /** For recency ordering of empty-query results. */
  at?: number;
}

export interface SearchIndex {
  entries: Entry[];
  projects: Project[];
  scopeTitle?: string;
}

/** Builds the palette's index for one project (or every project). Reactive. */
export function useSearchIndex(projectId: string | undefined, enabled: boolean): SearchIndex | undefined {
  return useLiveQuery(async () => {
    if (!enabled) return { entries: [], projects: [] };
    const projects = (await db.projects.toArray()).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    const scoped = projectId ? projects.filter((p) => p.id === projectId) : projects;
    const ids = scoped.map((p) => p.id);
    const pick = <T extends { projectId: string }>(rows: T[]) => rows.filter((r) => ids.includes(r.projectId));
    const [scripts, scenes, characters, locations, items, people, shots, tasks, assets, events] = await Promise.all([
      db.scripts.where('projectId').anyOf(ids).toArray(),
      db.scenes.where('projectId').anyOf(ids).toArray(),
      db.characters.where('projectId').anyOf(ids).toArray(),
      db.locations.where('projectId').anyOf(ids).toArray(),
      db.items.where('projectId').anyOf(ids).toArray(),
      db.people.where('projectId').anyOf(ids).toArray(),
      db.shots.where('projectId').anyOf(ids).toArray(),
      db.tasks.where('projectId').anyOf(ids).toArray(),
      db.assets.where('projectId').anyOf(ids).toArray(),
      db.events.where('projectId').anyOf(ids).toArray(),
    ]);
    const title = new Map(projects.map((p) => [p.id, p.title]));
    const multi = !projectId;
    const pt = (pid: string) => (multi ? title.get(pid) : undefined);
    const entries: Entry[] = [];

    for (const p of projects) {
      entries.push({
        key: `project:${p.id}`,
        group: 'projects',
        title: p.title,
        subtitle: [p.genres[0], stageLabel(p.stage)].filter(Boolean).join(' · '),
        href: `/p/${p.id}/overview`,
        fields: [p.title, p.logline, p.genres.join(' ')],
        at: p.lastOpenedAt,
      });
    }

    const numbersByProject = new Map<string, Map<string, string>>();
    for (const pid of ids) numbersByProject.set(pid, sceneNumbers(pick(scenes).filter((s) => s.projectId === pid)));
    const sceneById = new Map(scenes.map((s) => [s.id, s]));

    for (const s of pick(scenes)) {
      const n = numbersByProject.get(s.projectId)?.get(s.id) ?? '';
      entries.push({
        key: `scene:${s.id}`,
        group: 'scenes',
        title: `${n}. ${s.heading || 'Untitled scene'}`,
        subtitle: s.summary || s.scriptExcerpt || undefined,
        href: `/p/${s.projectId}/scenes?scene=${s.id}`,
        fields: [s.heading, s.summary, s.scriptExcerpt, s.notes, s.locationName],
        projectTitle: pt(s.projectId),
      });
    }

    // Script lines: the production draft of each film in scope.
    for (const p of scoped) {
      const draft = scripts.find((d) => d.id === p.primaryScriptId) ?? scripts.find((d) => d.projectId === p.id);
      if (!draft) continue;
      let sceneId: string | undefined;
      draft.elements.forEach((el, i) => {
        if (el.type === 'scene' && el.sceneId) sceneId = el.sceneId;
        const text = displayText(el);
        if (!text) return;
        const scene = sceneId ? sceneById.get(sceneId) : undefined;
        const n = scene ? numbersByProject.get(p.id)?.get(scene.id) : undefined;
        entries.push({
          key: `line:${draft.id}:${el.id}:${i}`,
          group: 'script',
          title: text.replace(/\s+/g, ' '),
          subtitle: scene ? `Scene ${n} · ${scene.heading}` : draft.title,
          href: `/p/${p.id}/script${sceneId ? `?scene=${sceneId}` : ''}`,
          fields: [text],
          projectTitle: pt(p.id),
        });
      });
    }

    for (const c of pick(characters)) {
      entries.push({
        key: `character:${c.id}`,
        group: 'characters',
        title: c.name || 'Unnamed character',
        subtitle: [c.age, c.personality].filter(Boolean).join(' · ') || undefined,
        href: `/p/${c.projectId}/characters?character=${c.id}`,
        fields: [c.name, c.aliases.join(' '), c.personality, c.appearance, c.background],
        projectTitle: pt(c.projectId),
      });
    }
    for (const l of pick(locations)) {
      entries.push({
        key: `location:${l.id}`,
        group: 'locations',
        title: l.name || 'Unnamed location',
        subtitle: l.description || undefined,
        href: `/p/${l.projectId}/locations?location=${l.id}`,
        fields: [l.name, l.description, l.notes],
        projectTitle: pt(l.projectId),
      });
    }
    for (const it of pick(items)) {
      entries.push({
        key: `item:${it.id}`,
        group: 'items',
        title: it.name || 'Unnamed item',
        subtitle: `${it.kind === 'wardrobe' ? 'Wardrobe' : 'Prop'}${it.description ? ` · ${it.description}` : ''}`,
        href: `/p/${it.projectId}/locations?item=${it.id}`,
        fields: [it.name, it.description],
        projectTitle: pt(it.projectId),
      });
    }
    for (const pe of pick(people)) {
      entries.push({
        key: `person:${pe.id}`,
        group: 'people',
        title: pe.name || 'Unnamed',
        subtitle: pe.roles.join(', ') || undefined,
        href: `/p/${pe.projectId}/people?person=${pe.id}`,
        fields: [pe.name, pe.roles.join(' '), pe.notes],
        projectTitle: pt(pe.projectId),
      });
    }
    const codes = shotCodes(pick(shots), new Map([...numbersByProject.values()].flatMap((m) => [...m.entries()])));
    for (const s of pick(shots)) {
      const code = codes.get(s.id) ?? s.code;
      entries.push({
        key: `shot:${s.id}`,
        group: 'shots',
        title: `${code} — ${s.description || 'Untitled shot'}`,
        subtitle: sceneById.get(s.sceneId)?.heading,
        href: `/p/${s.projectId}/shots?scene=${s.sceneId}`,
        fields: [code, s.description, s.notes, s.lens, s.equipment],
        projectTitle: pt(s.projectId),
      });
    }
    for (const t of pick(tasks)) {
      entries.push({
        key: `task:${t.id}`,
        group: 'tasks',
        title: t.title || 'Untitled task',
        subtitle: [t.status === 'done' ? 'Done' : undefined, t.due ? `Due ${formatShortDate(t.due)}` : undefined, t.description || undefined].filter(Boolean).join(' · ') || undefined,
        href: `/p/${t.projectId}/tasks?task=${t.id}`,
        fields: [t.title, t.description],
        projectTitle: pt(t.projectId),
      });
    }
    for (const a of pick(assets)) {
      entries.push({
        key: `asset:${a.id}`,
        group: 'assets',
        title: a.name,
        subtitle: [a.folder, a.description, a.tags.join(', ')].filter(Boolean).join(' · ') || undefined,
        href: `/p/${a.projectId}/assets?asset=${a.id}`,
        fields: [a.name, a.description, a.tags.join(' '), a.folder],
        projectTitle: pt(a.projectId),
      });
    }
    for (const e of pick(events)) {
      const kind = eventTypeMeta(e.type).label;
      entries.push({
        key: `event:${e.id}`,
        group: 'events',
        title: e.title || kind,
        subtitle: `${kind} · ${formatShortDate(e.date)}`,
        href: `/p/${e.projectId}/schedule?event=${e.id}`,
        fields: [e.title, kind, e.notes, e.date],
        projectTitle: pt(e.projectId),
      });
    }

    return { entries, projects, scopeTitle: projectId ? title.get(projectId) : undefined };
  }, [projectId, enabled]);
}

// ─── Ranking ────────────────────────────────────────────────────────────────

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 3 = text starts with the term, 2 = a word starts with it, 1 = contains it, 0 = no match. */
export function termScore(text: string | undefined, term: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t.startsWith(term)) return 3;
  if (!t.includes(term)) return 0;
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}`, 'u').test(t)) return 2;
  return 1;
}

/** Every term must match some field; the primary field counts double. */
export function scoreEntry(e: Entry, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    let best = 0;
    e.fields.forEach((f, i) => {
      const s = termScore(f, term) * (i === 0 ? 2 : 1);
      if (s > best) best = s;
    });
    if (!best) return 0;
    total += best;
  }
  return total;
}

export function tokenize(q: string): string[] {
  return q.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

export function rank(entries: Entry[], q: string): Map<GroupKey, Entry[]> {
  const terms = tokenize(q);
  const out = new Map<GroupKey, Entry[]>();
  if (!terms.length) return out;
  const scored: { e: Entry; s: number }[] = [];
  for (const e of entries) {
    // Script lines are long and numerous; only search them for 2+ characters.
    if (e.group === 'script' && q.trim().length < 2) continue;
    const s = scoreEntry(e, terms);
    if (s > 0) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || a.e.title.length - b.e.title.length);
  for (const { e } of scored) {
    const cap = GROUPS.find((g) => g.key === e.group)!.cap;
    const list = out.get(e.group) ?? [];
    if (list.length < cap) {
      list.push(e);
      out.set(e.group, list);
    }
  }
  return out;
}
