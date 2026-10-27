import { db } from '../db';
import { formatSeconds } from '../dates';
import { POST_CHECKLIST, SCENE_STATUSES, shotTypeAbbr, angleLabel, movementLabel, stageLabel, TASK_STATUSES } from '../constants';
import { sceneNumbers } from '../numbering';
import { toFountain } from '../screenplay/fountain';
import { segmentScenes, cueName } from '../screenplay/sync';
import { formatEighths } from '../screenplay/paginate';
import type { Character, Person, Project, Scene, ScheduleEvent, Script, Shot, StoryboardFrame, Task, Location } from '../types';

/** Everything the assistant needs to know about a project, read fresh from the database. */
export interface Snapshot {
  project: Project;
  script?: Script;
  scenes: Scene[];
  numbers: Map<string, string>;
  characters: Character[];
  people: Person[];
  locations: Location[];
  shots: Shot[];
  frames: StoryboardFrame[];
  tasks: Task[];
  events: ScheduleEvent[];
}

export async function loadSnapshot(projectId: string): Promise<Snapshot> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('This project no longer exists.');
  const by = <T>(t: { where(k: string): { equals(v: string): { toArray(): Promise<T[]> } } }) => t.where('projectId').equals(projectId).toArray();
  const [scripts, scenes, characters, people, locations, shots, frames, tasks, events] = await Promise.all([
    by<Script>(db.scripts),
    by<Scene>(db.scenes),
    by<Character>(db.characters),
    by<Person>(db.people),
    by<Location>(db.locations),
    by<Shot>(db.shots),
    by<StoryboardFrame>(db.frames),
    by<Task>(db.tasks),
    by<ScheduleEvent>(db.events),
  ]);
  const script = scripts.find((s) => s.id === project.primaryScriptId) ?? scripts[0];
  scenes.sort((a, b) => a.order - b.order);
  return {
    project,
    script,
    scenes,
    numbers: sceneNumbers(scenes),
    characters: characters.sort((a, b) => a.name.localeCompare(b.name)),
    people,
    locations,
    shots: shots.sort((a, b) => a.order - b.order),
    frames,
    tasks: tasks.sort((a, b) => a.order - b.order),
    events: events.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
  };
}

export function sceneByNumber(s: Snapshot, n: number): Scene | undefined {
  return s.scenes.find((x) => s.numbers.get(x.id) === String(n));
}

export function characterByName(s: Snapshot, name: string): Character | undefined {
  const n = cueName(name);
  return s.characters.find((c) => cueName(c.name) === n || c.aliases.some((a) => cueName(a) === n));
}

const clip = (t: string, max = 240) => {
  const v = t.replace(/\s+/g, ' ').trim();
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
};

function sceneLine(s: Snapshot, scene: Scene): string {
  const n = s.numbers.get(scene.id);
  const chars = scene.characterIds.map((id) => s.characters.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
  const loc = scene.locationId ? s.locations.find((l) => l.id === scene.locationId)?.name : undefined;
  const status = SCENE_STATUSES.find((x) => x.value === scene.status)?.label ?? scene.status;
  const shots = s.shots.filter((x) => x.sceneId === scene.id).length;
  const frames = s.frames.filter((x) => x.sceneId === scene.id).length;
  const len = scene.estDurationSec ?? scene.scriptSec;
  const parts = [
    `Scene ${n}: ${scene.heading || 'Untitled'}`,
    scene.inScript ? `${formatEighths(scene.pageEighths)} pg` : 'not in script',
    len ? `~${formatSeconds(len)}` : '',
    `status: ${status}`,
    chars ? `characters: ${chars}` : 'characters: none listed',
    loc ? `location profile: ${loc}` : '',
    `${shots} shots, ${frames} storyboard frames`,
  ].filter(Boolean);
  let line = `- ${parts.join(' | ')}`;
  if (scene.summary) line += `\n  Summary: ${clip(scene.summary)}`;
  else if (scene.scriptExcerpt) line += `\n  Opens: ${clip(scene.scriptExcerpt, 160)}`;
  const req = [scene.propsNotes && `props: ${clip(scene.propsNotes, 120)}`, scene.wardrobeNotes && `wardrobe: ${clip(scene.wardrobeNotes, 120)}`, scene.sfxNotes && `effects: ${clip(scene.sfxNotes, 120)}`, scene.notes && `notes: ${clip(scene.notes, 160)}`].filter(Boolean);
  if (req.length) line += `\n  ${req.join(' | ')}`;
  return line;
}

/** Compact overview of the project for the system prompt. */
export function projectContext(s: Snapshot): string {
  const p = s.project;
  const lines: string[] = [];
  lines.push(`# Project: ${p.title}`);
  if (p.logline) lines.push(`Logline: ${p.logline}`);
  if (p.synopsis) lines.push(`Synopsis: ${clip(p.synopsis, 1500)}`);
  lines.push(
    [
      p.genres.length ? `Genre: ${p.genres.join(', ')}` : '',
      `Type: ${p.productionType}`,
      p.runtimeTarget ? `Target runtime: ${p.runtimeTarget} min` : '',
      `Stage: ${stageLabel(p.stage)}`,
      p.language ? `Language: ${p.language}` : '',
      p.audience ? `Audience: ${p.audience}` : '',
      p.visualStyle ? `Visual style: ${p.visualStyle}` : '',
      p.filmingStart ? `Filming: ${p.filmingStart}${p.filmingEnd ? ` to ${p.filmingEnd}` : ''}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  );
  if (s.script) {
    lines.push(`Production draft: "${s.script.title}", ${s.script.pageCount} pages, ${s.script.wordCount} words (1 page ≈ 1 minute).`);
  }
  lines.push(`Today: ${new Date().toISOString().slice(0, 10)}`);

  lines.push('', `## Scenes (${s.scenes.length}, in story order)`);
  if (!s.scenes.length) lines.push('No scenes yet.');
  for (const sc of s.scenes) lines.push(sceneLine(s, sc));

  lines.push('', `## Characters (${s.characters.length})`);
  if (!s.characters.length) lines.push('No character profiles yet.');
  for (const c of s.characters) {
    const actor = c.actorId ? s.people.find((x) => x.id === c.actorId)?.name : undefined;
    const sceneNos = s.scenes.filter((sc) => sc.characterIds.includes(c.id)).map((sc) => s.numbers.get(sc.id));
    const bits = [c.age && `age ${c.age}`, actor ? `played by ${actor}` : 'not cast', sceneNos.length ? `in scenes ${sceneNos.join(', ')}` : 'in no scenes yet'].filter(Boolean);
    let line = `- ${c.name} (${bits.join('; ')})`;
    const desc = [c.personality && `personality: ${clip(c.personality, 120)}`, c.goals && `wants: ${clip(c.goals, 120)}`, c.arc && `arc: ${clip(c.arc, 140)}`].filter(Boolean);
    if (desc.length) line += `\n  ${desc.join(' | ')}`;
    lines.push(line);
  }

  if (s.locations.length) {
    lines.push('', `## Location profiles (${s.locations.length})`);
    for (const l of s.locations) lines.push(`- ${l.name} (${l.status})${l.restrictions ? ` — restrictions: ${clip(l.restrictions, 100)}` : ''}`);
  }

  const crew = s.people.filter((x) => x.roles.length);
  if (crew.length) {
    lines.push('', `## Cast & crew (${s.people.length})`);
    lines.push(crew.map((x) => `${x.name} (${x.roles.join(', ')})`).join('; '));
  }

  const open = s.tasks.filter((t) => t.status !== 'done').length;
  const filming = s.events.filter((e) => e.type === 'filming');
  const done = s.shots.filter((x) => x.status === 'completed').length;
  const post = POST_CHECKLIST.filter((c) => p.postChecklist[c.key]).map((c) => c.label);
  lines.push('', '## Production status');
  lines.push(`Shots: ${s.shots.length} planned, ${done} completed. Storyboard frames: ${s.frames.length}. Tasks: ${open} open of ${s.tasks.length}. Schedule events: ${s.events.length} (${filming.length} filming days).`);
  if (post.length) lines.push(`Post-production done: ${post.join(', ')}.`);
  return lines.join('\n');
}

/** A scene's screenplay text in Fountain, from the production draft. */
export function sceneScript(s: Snapshot, scene: Scene): string {
  if (!s.script) return '(No draft yet.)';
  const seg = segmentScenes(s.script.elements).find((x) => x.sceneId === scene.id);
  if (!seg) return `(Scene ${s.numbers.get(scene.id)} is in the breakdown but not in the production draft.)`;
  const heading = s.script.elements.find((e) => e.id === seg.headingId)!;
  return toFountain([heading, ...seg.body]).trim();
}

export function characterProfile(s: Snapshot, c: Character): string {
  const actor = c.actorId ? s.people.find((x) => x.id === c.actorId)?.name : undefined;
  const scenes = s.scenes.filter((sc) => sc.characterIds.includes(c.id));
  const fields: [string, string][] = [
    ['Age', c.age],
    ['Appearance', c.appearance],
    ['Personality', c.personality],
    ['Background', c.background],
    ['Motivations', c.motivations],
    ['Goals', c.goals],
    ['Fears', c.fears],
    ['Arc', c.arc],
    ['Costume notes', c.costumeNotes],
    ['Casting notes', c.castingNotes],
    ['Dialogue samples', c.dialogueSamples],
  ];
  const lines = [`# ${c.name}`, actor ? `Played by: ${actor}` : 'Not cast yet'];
  if (c.aliases.length) lines.push(`Also written as: ${c.aliases.join(', ')}`);
  for (const [k, v] of fields) if (v?.trim()) lines.push(`${k}: ${v.trim()}`);
  if (c.consistency.length) lines.push(`Consistency rules: ${c.consistency.map((r) => `[${r.category}] ${r.text}`).join('; ')}`);
  lines.push(`Appears in: ${scenes.length ? scenes.map((sc) => `Scene ${s.numbers.get(sc.id)} (${sc.heading})`).join('; ') : 'no scenes yet'}`);
  return lines.join('\n');
}

/** Extra context for the user's current selection, added to their message. */
export function focusContext(s: Snapshot, focus: { type: 'scene' | 'character'; id: string }): string | null {
  if (focus.type === 'scene') {
    const scene = s.scenes.find((x) => x.id === focus.id);
    if (!scene) return null;
    return `The user has selected Scene ${s.numbers.get(scene.id)} (${scene.heading}). Its breakdown:\n${sceneLine(s, scene)}\n\nScript:\n<scene_script>\n${sceneScript(s, scene)}\n</scene_script>`;
  }
  const c = s.characters.find((x) => x.id === focus.id);
  if (!c) return null;
  return `The user has selected the character ${c.name}.\n<character_profile>\n${characterProfile(s, c)}\n</character_profile>`;
}

// ─── Read-only tool executors ───────────────────────────────────────────────

export function runReadTool(s: Snapshot, name: string, input: Record<string, unknown>): { content: string; isError?: boolean } {
  switch (name) {
    case 'read_scene_script': {
      const scene = sceneByNumber(s, Number(input.scene_number));
      if (!scene) return { content: `There is no scene ${input.scene_number}. Scenes run 1–${s.scenes.length}.`, isError: true };
      return { content: sceneScript(s, scene) };
    }
    case 'read_character': {
      const c = characterByName(s, String(input.name));
      if (!c) return { content: `No character named "${input.name}". Known characters: ${s.characters.map((x) => x.name).join(', ') || 'none'}.`, isError: true };
      return { content: characterProfile(s, c) };
    }
    case 'list_shots': {
      let shots = s.shots;
      if (input.scene_number !== undefined) {
        const scene = sceneByNumber(s, Number(input.scene_number));
        if (!scene) return { content: `There is no scene ${input.scene_number}.`, isError: true };
        shots = shots.filter((x) => x.sceneId === scene.id);
      }
      if (!shots.length) return { content: 'No shots planned yet.' };
      return {
        content: shots
          .map((x) => {
            const n = s.numbers.get(x.sceneId);
            return `Scene ${n}: [${shotTypeAbbr(x.shotType)}, ${angleLabel(x.angle)}, ${movementLabel(x.movement)}] ${x.description || '(no description)'} — ${x.status}${x.lens ? `, lens ${x.lens}` : ''}`;
          })
          .join('\n'),
      };
    }
    case 'read_schedule': {
      if (!s.events.length) return { content: 'Nothing is scheduled yet.' };
      return {
        content: s.events
          .map((e) => {
            const scenes = e.sceneIds.map((id) => s.numbers.get(id)).filter(Boolean);
            const loc = e.locationId ? s.locations.find((l) => l.id === e.locationId)?.name : undefined;
            return `${e.date} ${e.startTime} (${e.durationMin} min) ${e.type}: ${e.title || '(untitled)'}${scenes.length ? ` — scenes ${scenes.join(', ')}` : ''}${loc ? ` at ${loc}` : ''}`;
          })
          .join('\n'),
      };
    }
    case 'read_tasks': {
      if (!s.tasks.length) return { content: 'There are no tasks yet.' };
      return {
        content: s.tasks
          .map((t) => {
            const who = t.assigneeId ? s.people.find((x) => x.id === t.assigneeId)?.name : undefined;
            const st = TASK_STATUSES.find((x) => x.value === t.status)?.label ?? t.status;
            return `- [${st}] ${t.title} (${t.priority}${t.due ? `, due ${t.due}` : ''}${who ? `, ${who}` : ''})`;
          })
          .join('\n'),
      };
    }
    case 'search_script': {
      if (!s.script) return { content: 'There is no draft yet.' };
      const q = String(input.query).toLowerCase();
      const hits: string[] = [];
      let current: string | undefined;
      for (const e of s.script.elements) {
        if (e.type === 'scene' && e.sceneId) current = s.numbers.get(e.sceneId);
        if (e.text.toLowerCase().includes(q)) hits.push(`Scene ${current ?? '–'} (${e.type}): ${clip(e.text, 200)}`);
        if (hits.length >= 40) break;
      }
      return { content: hits.length ? hits.join('\n') : `No matches for "${input.query}".` };
    }
  }
  return { content: `Unknown tool ${name}.`, isError: true };
}
