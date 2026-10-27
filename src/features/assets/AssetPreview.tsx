import { File, FileText, Film, Image as ImageIcon, Music } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AssetImage, cn, Spinner } from '@/components/ui';
import { getAssetBlob, useAssetUrl } from '@/lib/data/assets';
import type { Asset } from '@/lib/types';
import { kindOf } from './assetUtils';

export function AssetIcon({ asset, className }: { asset: Pick<Asset, 'mime' | 'name'>; className?: string }) {
  const k = kindOf(asset.mime, asset.name);
  const Icon = k === 'image' ? ImageIcon : k === 'video' ? Film : k === 'audio' ? Music : k === 'pdf' || k === 'text' ? FileText : File;
  return <Icon className={cn('size-6 text-faint', className)} />;
}

/** Small preview for grids: thumbnail for images, an icon for everything else. */
export function AssetThumb({ asset, className }: { asset: Asset; className?: string }) {
  const k = kindOf(asset.mime, asset.name);
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-surface', className)}>
      {k === 'image' ? (
        <AssetImage assetId={asset.id} alt={asset.name} className="absolute inset-0 size-full" fallback={<AssetIcon asset={asset} />} />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <AssetIcon asset={asset} className="size-7" />
          <span className="slate text-[9.5px]">{asset.name.split('.').pop()?.slice(0, 6) || k}</span>
        </div>
      )}
    </div>
  );
}

const TEXT_LIMIT = 200_000;

function TextPreview({ assetId }: { assetId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    let alive = true;
    void getAssetBlob(assetId).then(async (b) => {
      if (!b || !alive) return;
      const slice = b.size > TEXT_LIMIT ? b.slice(0, TEXT_LIMIT) : b;
      const t = await slice.text();
      if (!alive) return;
      setTruncated(b.size > TEXT_LIMIT);
      setText(t);
    });
    return () => {
      alive = false;
    };
  }, [assetId]);
  if (text === null) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
  return (
    <div>
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-surface p-3 font-mono text-[12px] leading-relaxed text-ink">{text}</pre>
      {truncated && <p className="mt-1 text-[11.5px] text-faint">Showing the first 200 KB. Download the file to see all of it.</p>}
    </div>
  );
}

/** Full preview inside the asset sheet. */
export function AssetPreview({ asset }: { asset: Asset }) {
  const k = kindOf(asset.mime, asset.name);
  const url = useAssetUrl(k === 'text' || k === 'image' ? undefined : asset.id, 'full');
  if (k === 'image') {
    return (
      <div className="overflow-hidden rounded-md border border-line bg-black/40">
        <AssetImage assetId={asset.id} alt={asset.name} variant="full" fit="contain" className="max-h-[50vh] w-full" />
      </div>
    );
  }
  if (k === 'text') return <TextPreview assetId={asset.id} />;
  if (url === undefined) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
  if (url === null) return <p className="text-[12.5px] text-danger">This file’s data is missing from storage.</p>;
  if (k === 'video') return <video src={url} controls playsInline className="max-h-[50vh] w-full rounded-md border border-line bg-black" />;
  if (k === 'audio') return <audio src={url} controls className="w-full" />;
  if (k === 'pdf') return <iframe src={url} title={asset.name} className="h-[60vh] w-full rounded-md border border-line bg-white" />;
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-line-strong py-10 text-center">
      <AssetIcon asset={asset} className="size-8" />
      <p className="text-[12.5px] text-muted">No preview for this file type. Download it to open it in another app.</p>
    </div>
  );
}
