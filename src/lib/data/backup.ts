import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { db, PROJECT_TABLES, table, type ProjectTable } from '../db';
import { uid } from '../ids';
import type { Asset, Project } from '../types';
import { logActivity } from './crud';

/**
 * A project backup is a zip file (`.sceneforge`) containing `project.json`
 * plus every stored file under `files/<assetId>`. Importing always creates a
 * new copy with fresh ids, so it can never overwrite existing work.
 */

const FORMAT = 'sceneforge-project';
const VERSION = 1;

interface ProjectBundle {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  app: 'SCENEFORGE';
  project: Project;
  tables: Partial<Record<ProjectTable, any[]>>;
  /** asset id → mime, for files included under files/ */
  files: Record<string, string>;
}

export interface ExportOptions {
  /** Remove phone numbers, emails and contact names before sharing. */
  stripPrivate?: boolean;
  /** Leave out uploaded files (much smaller backup). */
  skipFiles?: boolean;
}

function stripPrivateInfo(bundle: ProjectBundle) {
  bundle.project = { ...bundle.project, emergencyContacts: [], safetyNotes: '' };
  bundle.tables.locations = (bundle.tables.locations ?? []).map((l) => ({ ...l, contactName: '', contactPhone: '', contactEmail: '' }));
  bundle.tables.people = (bundle.tables.people ?? []).map((p) => ({ ...p, email: '', phone: '' }));
  // Assistant conversations can quote private details; leave them out of shared copies.
  bundle.tables.threads = [];
}

async function collect(projectId: string, opts: ExportOptions): Promise<{ bundle: ProjectBundle; files: Zippable }> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('This project no longer exists.');
  const tables: ProjectBundle['tables'] = {};
  for (const name of PROJECT_TABLES) tables[name] = await table(name).where('projectId').equals(projectId).toArray();
  const bundle: ProjectBundle = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), app: 'SCENEFORGE', project, tables, files: {} };
  if (opts.stripPrivate) stripPrivateInfo(bundle);

  const files: Zippable = {};
  if (!opts.skipFiles) {
    for (const a of (tables.assets ?? []) as Asset[]) {
      const blob = (await db.blobs.get(a.id))?.data;
      if (!blob) continue;
      // Media is already compressed; storing it avoids burning CPU for no gain.
      const compressible = a.mime.startsWith('text/') || a.mime.includes('json') || a.mime.includes('xml') || a.mime === 'image/svg+xml';
      files[`files/${a.id}`] = [new Uint8Array(await blob.arrayBuffer()), { level: compressible ? 6 : 0 }];
      bundle.files[a.id] = a.mime;
    }
  } else {
    bundle.tables.assets = [];
    bundle.project = { ...bundle.project, coverAssetId: undefined };
  }
  return { bundle, files };
}

export async function exportProject(projectId: string, opts: ExportOptions = {}): Promise<{ blob: Blob; filename: string }> {
  const { bundle, files } = await collect(projectId, opts);
  const zipped = zipSync({ 'project.json': [strToU8(JSON.stringify(bundle)), { level: 6 }], ...files });
  const safe = bundle.project.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
  const date = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), filename: `${safe}-${date}.sceneforge` };
}

/** Every id that appears anywhere in the bundle, mapped to a fresh one. */
function buildIdMap(bundle: ProjectBundle): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if ((k === 'id' || k === 'sceneId') && typeof val === 'string' && !map.has(val)) map.set(val, uid());
        visit(val);
      }
    }
  };
  visit(bundle.project);
  visit(bundle.tables);
  return map;
}

function remap<T>(v: T, map: Map<string, string>): T {
  if (typeof v === 'string') return (map.get(v) ?? v) as T;
  if (Array.isArray(v)) return v.map((x) => remap(x, map)) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = remap(val, map);
    return out as T;
  }
  return v;
}

export async function importProjectFile(file: Blob): Promise<Project> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('This file is not a SCENEFORGE backup (.sceneforge).');
  }
  const json = entries['project.json'];
  if (!json) throw new Error('This backup is missing its project data.');
  let bundle: ProjectBundle;
  try {
    bundle = JSON.parse(strFromU8(json));
  } catch {
    throw new Error('The project data in this backup is damaged.');
  }
  if (bundle.format !== FORMAT || !bundle.project?.id) throw new Error('This file is not a SCENEFORGE project backup.');
  if (bundle.version > VERSION) throw new Error('This backup was made by a newer version of SCENEFORGE.');

  const map = buildIdMap(bundle);
  const project: Project = {
    ...remap(bundle.project, map),
    isSample: false,
    updatedAt: Date.now(),
    lastOpenedAt: Date.now(),
  };
  const existingTitles = new Set((await db.projects.toArray()).map((p) => p.title));
  if (existingTitles.has(project.title)) project.title = `${project.title} (imported)`;

  const tables: Partial<Record<ProjectTable, any[]>> = {};
  for (const name of PROJECT_TABLES) tables[name] = remap(bundle.tables[name] ?? [], map);

  const blobs = Object.entries(bundle.files ?? {})
    .filter(([oldId]) => entries[`files/${oldId}`])
    .map(([oldId, mime]) => ({ id: map.get(oldId) ?? oldId, data: new Blob([entries[`files/${oldId}`] as BlobPart], { type: mime }) }));
  const withFiles = new Set(blobs.map((b) => b.id));
  // Drop asset records whose file wasn't included, and references to them.
  tables.assets = (tables.assets ?? []).filter((a: Asset) => withFiles.has(a.id)).map((a: Asset) => ({ ...a, hasThumb: false }));
  if (project.coverAssetId && !withFiles.has(project.coverAssetId)) project.coverAssetId = undefined;

  const all = [db.projects, db.blobs, ...PROJECT_TABLES.map((n) => table(n))];
  await db.transaction('rw', all, async () => {
    await db.projects.add(project);
    for (const name of PROJECT_TABLES) {
      const rows = tables[name];
      if (rows?.length) await table(name).bulkAdd(rows.map((r) => ({ ...r, projectId: project.id })));
    }
    if (blobs.length) await db.blobs.bulkAdd(blobs);
  });
  await logActivity({ projectId: project.id, action: 'imported', entityType: 'project', entityId: project.id, summary: `Imported “${project.title}” from a backup` });
  return project;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
