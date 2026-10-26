import { ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ACCEPT_IMAGES } from '@/lib/constants';
import { addAsset, useAssetUrl, validateFile } from '@/lib/data/assets';
import type { AssetCategory, AssetLinks } from '@/lib/types';
import { cn } from './cn';
import { toastError } from './Toast';

/** Renders a stored image asset. Falls back to `fallback` when missing. */
export function AssetImage({
  assetId,
  alt,
  className,
  variant = 'thumb',
  fallback,
  fit = 'cover',
}: {
  assetId?: string;
  alt: string;
  className?: string;
  variant?: 'thumb' | 'full';
  fallback?: ReactNode;
  fit?: 'cover' | 'contain';
}) {
  const url = useAssetUrl(assetId, variant);
  if (!assetId || url === null) return <>{fallback ?? null}</>;
  if (url === undefined) return <div className={cn('animate-pulse bg-[color-mix(in_srgb,var(--c-ink)_6%,transparent)]', className)} />;
  return <img src={url} alt={alt} draggable={false} className={cn(fit === 'cover' ? 'object-cover' : 'object-contain', className)} />;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, assetId, size = 32, className, tone }: { name: string; assetId?: string; size?: number; className?: string; tone?: string }) {
  const fallback = (
    <span
      className={cn('inline-flex items-center justify-center rounded-full border border-line-strong bg-raised font-medium text-muted select-none', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36), color: tone }}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
  if (!assetId) return fallback;
  return (
    <span className={cn('inline-block overflow-hidden rounded-full border border-line-strong shrink-0', className)} style={{ width: size, height: size }}>
      <AssetImage assetId={assetId} alt={name} className="size-full" fallback={fallback} />
    </span>
  );
}

/**
 * Upload an image into the project library and hand back its asset id.
 * Shows the stored image with replace/remove controls once set.
 */
export function ImageUpload({
  projectId,
  value,
  onChange,
  category,
  links,
  label = 'Add image',
  className,
  aspect = 'aspect-[16/9]',
  hint = 'JPG, PNG, WebP, GIF, SVG or AVIF · up to 25 MB',
  children,
}: {
  projectId: string;
  value?: string;
  onChange: (assetId: string | undefined) => void;
  category: AssetCategory;
  links?: Partial<AssetLinks>;
  label?: string;
  className?: string;
  aspect?: string;
  hint?: string;
  /** Extra controls shown under an empty drop zone (e.g. "Draw a sketch"). */
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const take = async (file: File | undefined) => {
    if (!file) return;
    const err = validateFile(file, { imageOnly: true });
    if (err) {
      toastError(new Error(err), 'Image not added');
      return;
    }
    setBusy(true);
    try {
      const a = await addAsset(projectId, file, { category, links });
      onChange(a.id);
    } catch (e) {
      toastError(e, 'Image not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={cn(
          'group relative overflow-hidden rounded-md border bg-surface',
          aspect,
          value ? 'border-line' : 'border-dashed border-line-strong',
          drag && 'border-accent bg-accent-soft',
        )}
      >
        {value ? (
          <>
            <AssetImage assetId={value} alt="" variant="full" className="absolute inset-0 size-full" />
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <button type="button" onClick={() => input.current?.click()} className="btn btn-sm bg-black/60 text-white border-white/20 hover:bg-black/80">
                <Upload className="size-3.5" /> Replace
              </button>
              <button type="button" onClick={() => onChange(undefined)} className="btn btn-sm bg-black/60 text-white border-white/20 hover:bg-black/80" aria-label="Remove image">
                <X className="size-3.5" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-muted hover:text-ink"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="text-[13px]">{busy ? 'Saving…' : label}</span>
            <span className="text-[11px] text-faint">{hint}</span>
          </button>
        )}
      </div>
      {!value && children}
      <input ref={input} type="file" accept={ACCEPT_IMAGES} className="hidden" onChange={(e) => void take(e.target.files?.[0] ?? undefined).finally(() => (e.target.value = ''))} />
    </div>
  );
}
