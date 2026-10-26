import { db } from '../db';
import { uid } from '../ids';
import { cueName } from '../screenplay/sync';
import type { AccessRole, Character, Person, Project, ProductionType, ScriptElement, TitlePage } from '../types';
import { addAsset } from './assets';
import { logActivity } from './crud';
import { makeCharacter, makePerson, makeProject, makeScript } from './factories';
import { settingsSnapshot } from './settings';
import { syncScenes } from './scripts';

export interface Collaborator {
  name: string;
  role: string;
  email?: string;
  accessRole?: AccessRole;
}

export interface NewProjectInput {
  title: string;
  logline?: string;
  synopsis?: string;
  genres?: string[];
  productionType?: ProductionType;
  runtimeTarget?: number;
  language?: string;
  audience?: string;
  visualStyle?: string;
  filmingStart?: string;
  filmingEnd?: string;
  coverFile?: File | Blob;
  coverSeed?: number;
  /** The person using this device, added to cast & crew as owner. */
  you?: { name: string; role: string };
  collaborators?: Collaborator[];
  /** Imported screenplay content. */
  elements?: ScriptElement[];
  titlePage?: Partial<TitlePage>;
  draftTitle?: string;
  /** Create character profiles for every speaking role in imported content. */
  createCharactersFromCues?: boolean;
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const title = input.title.trim();
  if (!title) throw new Error('Every film needs a title.');
  const project = makeProject({
    title,
    logline: input.logline?.trim() ?? '',
    synopsis: input.synopsis?.trim() ?? '',
    genres: input.genres ?? [],
    productionType: input.productionType ?? 'short',
    runtimeTarget: input.runtimeTarget,
    language: input.language?.trim() || 'English',
    audience: input.audience?.trim() ?? '',
    visualStyle: input.visualStyle?.trim() ?? '',
    filmingStart: input.filmingStart || undefined,
    filmingEnd: input.filmingEnd || undefined,
    ...(input.coverSeed !== undefined ? { coverSeed: input.coverSeed } : {}),
  });
  const userName = input.you?.name?.trim() || settingsSnapshot().userName.trim();
  const script = makeScript(project.id, {
    title: input.draftTitle ?? 'First Draft',
    ...(input.elements?.length ? { elements: input.elements } : {}),
    titlePage: {
      title,
      credit: 'Written by',
      author: userName,
      source: '',
      draftDate: '',
      contact: '',
      ...(input.titlePage ?? {}),
    },
  });
  project.primaryScriptId = script.id;

  const people: Person[] = [];
  if (userName || input.you) {
    people.push(
      makePerson(project.id, {
        name: userName || 'You',
        roles: input.you?.role ? [input.you.role] : ['Director'],
        accessRole: 'owner',
        isYou: true,
      }),
    );
  }
  for (const c of input.collaborators ?? []) {
    if (!c.name.trim()) continue;
    people.push(
      makePerson(project.id, {
        name: c.name.trim(),
        roles: c.role ? [c.role] : [],
        email: c.email?.trim() ?? '',
        accessRole: c.accessRole ?? 'editor',
      }),
    );
  }

  const characters: Character[] = [];
  if (input.createCharactersFromCues && input.elements) {
    const names = new Set<string>();
    for (const e of input.elements) if (e.type === 'character') names.add(cueName(e.text));
    for (const n of names) if (n) characters.push(makeCharacter(project.id, { name: titleCase(n) }));
  }

  await db.transaction('rw', db.projects, db.scripts, db.people, db.characters, async () => {
    await db.projects.add(project);
    await db.scripts.add(script);
    if (people.length) await db.people.bulkAdd(people);
    if (characters.length) await db.characters.bulkAdd(characters);
  });

  if (input.coverFile) {
    try {
      const asset = await addAsset(project.id, input.coverFile, { category: 'cover', name: `${title} — cover`, silent: true });
      await db.projects.update(project.id, { coverAssetId: asset.id });
      project.coverAssetId = asset.id;
    } catch (e) {
      // The project still exists; surface the cover problem to the caller.
      await logActivity({ projectId: project.id, action: 'created', entityType: 'project', entityId: project.id, summary: `Created “${title}”` });
      throw Object.assign(new Error(e instanceof Error ? e.message : 'The cover image could not be saved.'), { projectId: project.id });
    }
  }

  if (input.elements?.length) await syncScenes(project.id, script.elements);
  await logActivity({
    projectId: project.id,
    action: input.elements?.length ? 'imported' : 'created',
    entityType: 'project',
    entityId: project.id,
    summary: input.elements?.length ? `Imported screenplay into “${title}”` : `Created “${title}”`,
  });
  return project;
}

/** "MRS. HALE" → "Mrs. Hale" */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-'.(])(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

export async function openProject(id: string) {
  await db.projects.update(id, { lastOpenedAt: Date.now() });
}

export async function updateProject(id: string, patch: Partial<Project>, summary?: string) {
  const p = await db.projects.get(id);
  if (!p) throw new Error('This project no longer exists.');
  if ('title' in patch && !patch.title?.trim()) throw new Error('Every film needs a title.');
  await db.projects.update(id, { ...patch, updatedAt: Date.now() });
  await logActivity({
    projectId: id,
    action: 'updated',
    entityType: 'project',
    entityId: id,
    summary: summary ?? `Edited project details (${Object.keys(patch).join(', ')})`,
  });
}

export function newEmergencyContact() {
  return { id: uid(), name: '', role: '', phone: '' };
}
