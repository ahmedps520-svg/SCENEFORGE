import { useEffect, useState } from 'react';
import { FILE_LIMITS } from '../constants';
import { db } from '../db';
import { uid } from '../ids';
import type { Asset, AssetCategory, AssetLinks } from '../types';
import { createRecord } from './crud';

export const EMPTY_LINKS: AssetLinks = { sceneIds: [], characterIds: [], frameIds: [], locationIds: [] };

function ext(name: string): string {
  const m = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

const EXT_MIME: Record<string, string> = {
  '.fountain': 'text/plain',
  '.fdx': 'application/xml',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pages': 'application/octet-stream',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

export function mimeOf(file: { type: string; name?: string }): string {
  return file.type || EXT_MIME[ext(file.name ?? '')] || 'application/octet-stream';
}

export function isImageMime(mime: string) {
  return mime.startsWith('image/');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Check type and size before storing. Returns an error message, or null when acceptable. */
export function validateFile(file: File | Blob, opts: { imageOnly?: boolean } = {}): string | null {
  const name = (file as File).name ?? 'file';
  const mime = mimeOf({ type: file.type, name });
  const isImage = FILE_LIMITS.imageTypes.includes(mime);
  if (opts.imageOnly && !isImage) return `“${name}” isn't a supported image. Use JPG, PNG, WebP, GIF, SVG or AVIF.`;
  const known =
    isImage ||
    FILE_LIMITS.videoTypes.includes(mime) ||
    FILE_LIMITS.audioTypes.includes(mime) ||
    FILE_LIMITS.documentTypes.includes(mime) ||
    FILE_LIMITS.extraExtensions.includes(ext(name));
  if (!known) return `“${name}” is a file type SCENEFORGE can't store (${mime}).`;
  const limit = isImage ? FILE_LIMITS.maxImageBytes : FILE_LIMITS.maxBytes;
  if (file.size > limit) return `“${name}” is ${formatBytes(file.size)}. The limit for this type is ${formatBytes(limit)}.`;
  if (file.size === 0) return `“${name}” is empty.`;
  return null;
}

export function guessCategory(mime: string, fallback: AssetCategory = 'reference'): AssetCategory {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'music';
  if (mime.startsWith('image/')) return fallback;
  if (mime === 'text/markdown' || mime === 'text/plain') return 'notes';
  return 'document';
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Revoke after decode; the decoded bitmap stays usable for drawing.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

async function makeThumb(img: HTMLImageElement, max = 640): Promise<Blob | null> {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', 0.86));
}

export interface AddAssetOptions {
  name?: string;
  category?: AssetCategory;
  folder?: string;
  tags?: string[];
  description?: string;
  links?: Partial<AssetLinks>;
  silent?: boolean;
}

/** Store a file in the project's library (IndexedDB) and return its metadata record. */
export async function addAsset(projectId: string, file: File | Blob, opts: AddAssetOptions = {}): Promise<Asset> {
  const error = validateFile(file);
  if (error) throw new Error(error);
  const name = opts.name ?? (file as File).name ?? 'Untitled';
  const mime = mimeOf({ type: file.type, name });
  const id = uid();
  let width: number | undefined;
  let height: number | undefined;
  let thumb: Blob | null = null;
  if (isImageMime(mime)) {
    try {
      const img = await loadImage(file);
      width = img.naturalWidth;
      height = img.naturalHeight;
      if (mime !== 'image/svg+xml' && mime !== 'image/gif') thumb = await makeThumb(img);
    } catch {
      throw new Error(`“${name}” couldn't be read as an image. The file may be damaged.`);
    }
  }
  const t = Date.now();
  const asset: Asset = {
    id,
    projectId,
    name,
    mime,
    size: file.size,
    category: opts.category ?? guessCategory(mime),
    folder: opts.folder ?? '',
    tags: opts.tags ?? [],
    description: opts.description ?? '',
    links: { ...EMPTY_LINKS, ...(opts.links ?? {}) },
    width,
    height,
    hasThumb: !!thumb,
    createdAt: t,
    updatedAt: t,
  };
  try {
    await db.transaction('rw', db.blobs, db.thumbs, async () => {
      await db.blobs.put({ id, data: file });
      if (thumb) await db.thumbs.put({ id, data: thumb });
    });
  } catch (e) {
    if (e instanceof Error && /quota/i.test(e.name + e.message)) {
      throw new Error('Your browser is out of storage space for SCENEFORGE. Delete unused assets or export a backup and free space.');
    }
    throw e;
  }
  await createRecord('assets', asset, { silent: opts.silent, summary: `Uploaded “${name}”` });
  return asset;
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  return (await db.blobs.get(id))?.data;
}

// ─── Object URLs ────────────────────────────────────────────────────────────

const urlCache = new Map<string, { url: string; refs: number }>();

async function acquire(key: string, load: () => Promise<Blob | undefined>): Promise<string | null> {
  const hit = urlCache.get(key);
  if (hit) {
    hit.refs++;
    return hit.url;
  }
  const blob = await load();
  if (!blob) return null;
  const again = urlCache.get(key);
  if (again) {
    again.refs++;
    return again.url;
  }
  const url = URL.createObjectURL(blob);
  urlCache.set(key, { url, refs: 1 });
  return url;
}

function release(key: string) {
  const hit = urlCache.get(key);
  if (!hit) return;
  hit.refs--;
  if (hit.refs <= 0) {
    // Delay so a quick remount reuses the URL instead of flickering.
    setTimeout(() => {
      const h = urlCache.get(key);
      if (h && h.refs <= 0) {
        URL.revokeObjectURL(h.url);
        urlCache.delete(key);
      }
    }, 4000);
  }
}

/**
 * Object URL for a stored asset. `thumb` prefers the small preview for grids.
 * Returns undefined while loading and null when the asset has no data.
 */
export function useAssetUrl(assetId: string | undefined, variant: 'thumb' | 'full' = 'full'): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let active = true;
    let key: string | null = null;
    (async () => {
      let k = `full:${assetId}`;
      let loader = () => getAssetBlob(assetId);
      if (variant === 'thumb') {
        const t = await db.thumbs.get(assetId);
        if (t) {
          k = `thumb:${assetId}`;
          loader = async () => t.data;
        }
      }
      const u = await acquire(k, loader);
      if (!active) {
        if (u) release(k);
        return;
      }
      key = u ? k : null;
      setUrl(u);
    })();
    return () => {
      active = false;
      if (key) release(key);
    };
  }, [assetId, variant]);
  return url;
}

/** Load an image asset as a JPEG data URL (for PDF export). */
export async function assetAsDataUrl(assetId: string, maxPx = 1600): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const blob = await getAssetBlob(assetId);
  if (!blob || !isImageMime(blob.type || 'image/png')) return null;
  try {
    const img = await loadImage(blob);
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const scale = Math.min(1, maxPx / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}
