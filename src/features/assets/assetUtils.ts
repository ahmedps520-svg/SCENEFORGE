import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { updateRecord } from '@/lib/data/crud';
import type { ProjectData } from '@/lib/hooks';
import type { Asset } from '@/lib/types';

/**
 * Folders are slash-separated paths on each asset. Empty folders (created
 * before anything is moved in) are remembered per project in settings.
 */

const key = (projectId: string) => `folders:${projectId}`;

export function normalizeFolder(path: string): string {
  return path
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/');
}

export function useSavedFolders(projectId: string): string[] | undefined {
  return useLiveQuery(async () => ((await db.settings.get(key(projectId)))?.value as string[] | undefined) ?? [], [projectId]);
}

async function saved(projectId: string): Promise<string[]> {
  return ((await db.settings.get(key(projectId)))?.value as string[] | undefined) ?? [];
}

export async function createFolder(projectId: string, path: string) {
  const p = normalizeFolder(path);
  if (!p) throw new Error('Give the folder a name.');
  if (p.split('/').some((seg) => seg.length > 60)) throw new Error('Folder names can be up to 60 characters.');
  const list = await saved(projectId);
  if (!list.includes(p)) await db.settings.put({ key: key(projectId), value: [...list, p].sort() });
  return p;
}

/** Every folder path, including parents of nested folders. */
export function allFolders(assets: Asset[], savedFolders: string[]): string[] {
  const set = new Set<string>();
  const add = (p: string) => {
    const parts = normalizeFolder(p).split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
  };
  assets.forEach((a) => a.folder && add(a.folder));
  savedFolders.forEach(add);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function moveAsset(assetId: string, folder: string) {
  await updateRecord<Asset>('assets', assetId, { folder: normalizeFolder(folder) }, { summary: folder ? `Moved file to “${folder}”` : 'Moved file to the library root' });
}

/** Rename a folder (and everything beneath it). */
export async function renameFolder(projectId: string, from: string, to: string, assets: Asset[]) {
  const target = normalizeFolder(to);
  if (!target) throw new Error('Give the folder a name.');
  const remap = (p: string) => (p === from ? target : p.startsWith(from + '/') ? target + p.slice(from.length) : p);
  for (const a of assets) {
    if (a.folder === from || a.folder.startsWith(from + '/')) await updateRecord<Asset>('assets', a.id, { folder: remap(a.folder) }, { silent: true });
  }
  const list = await saved(projectId);
  await db.settings.put({ key: key(projectId), value: [...new Set(list.map(remap))].sort() });
  return target;
}

/** Remove a folder; its files move up to the parent folder. */
export async function deleteFolder(projectId: string, path: string, assets: Asset[]) {
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const remap = (p: string) => (p === path ? parent : p.startsWith(path + '/') ? normalizeFolder(parent + p.slice(path.length)) : p);
  for (const a of assets) {
    if (a.folder === path || a.folder.startsWith(path + '/')) await updateRecord<Asset>('assets', a.id, { folder: remap(a.folder) }, { silent: true });
  }
  const list = await saved(projectId);
  await db.settings.put({ key: key(projectId), value: list.filter((p) => p !== path).map(remap).filter(Boolean) });
}

export interface Usage {
  label: string;
  to: string;
}

/** Where an asset is used as an image across the project. */
export function assetUsage(assetId: string, d: ProjectData): Usage[] {
  const base = `/p/${d.project.id}`;
  const out: Usage[] = [];
  if (d.project.coverAssetId === assetId) out.push({ label: 'Project cover', to: `${base}/settings` });
  for (const c of d.characters) if (c.portraitAssetId === assetId) out.push({ label: `Portrait of ${c.name}`, to: `${base}/characters?character=${c.id}` });
  for (const f of d.frames) if (f.imageAssetId === assetId) out.push({ label: 'Storyboard frame image', to: `${base}/storyboard?scene=${f.sceneId}` });
  for (const l of d.locations) if (l.photoAssetIds.includes(assetId)) out.push({ label: `Photo of ${l.name}`, to: `${base}/locations?location=${l.id}` });
  for (const it of d.items) if (it.photoAssetId === assetId) out.push({ label: `Photo of ${it.kind === 'wardrobe' ? 'costume' : 'prop'} “${it.name}”`, to: `${base}/locations?item=${it.id}` });
  for (const p of d.people) if (p.photoAssetId === assetId) out.push({ label: `Photo of ${p.name}`, to: `${base}/people?person=${p.id}` });
  for (const t of d.tasks) if (t.assetId === assetId) out.push({ label: `Attached to task “${t.title}”`, to: `${base}/tasks?task=${t.id}` });
  return out;
}

export function kindOf(mime: string, name = ''): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || /\.(fountain|fdx|md|txt|csv)$/i.test(name)) return 'text';
  return 'other';
}
