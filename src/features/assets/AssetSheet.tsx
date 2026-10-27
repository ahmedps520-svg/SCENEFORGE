import { ArrowUpRight, Download, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { characterOptions, locationOptions, sceneOptions } from '@/components/options';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { AutoText, Button, Field, MultiPicker, Select, Sheet, TagInput, toastError } from '@/components/ui';
import { ASSET_CATEGORIES } from '@/lib/constants';
import { formatBytes, getAssetBlob } from '@/lib/data/assets';
import { updateRecord } from '@/lib/data/crud';
import { downloadBlob } from '@/lib/download';
import type { ProjectData } from '@/lib/hooks';
import { frameNumbers, sceneNumbers } from '@/lib/numbering';
import type { Asset, AssetCategory, AssetLinks } from '@/lib/types';
import { AssetPreview } from './AssetPreview';
import { assetUsage, moveAsset } from './assetUtils';

export function AssetSheet({ asset, data, folders, allTags, onClose }: { asset: Asset | null; data: ProjectData; folders: string[]; allTags: string[]; onClose: () => void }) {
  const del = useDeleteEntity();
  const numbers = useMemo(() => sceneNumbers(data.scenes), [data.scenes]);
  const frameNos = useMemo(() => frameNumbers(data.frames, numbers), [data.frames, numbers]);
  const usage = asset ? assetUsage(asset.id, data) : [];

  const save = (patch: Partial<Asset>) => (asset ? updateRecord<Asset>('assets', asset.id, patch).catch((e) => toastError(e, 'Change not saved')) : undefined);
  const saveLinks = (k: keyof AssetLinks, v: string[]) => asset && save({ links: { ...asset.links, [k]: v } });

  const download = async () => {
    if (!asset) return;
    const blob = await getAssetBlob(asset.id);
    if (!blob) return toastError(new Error('The file’s data is missing from this browser’s storage.'), 'Download failed');
    downloadBlob(blob, asset.name);
  };

  return (
    <Sheet
      open={!!asset}
      onOpenChange={(o) => !o && onClose()}
      title={asset?.name ?? 'File'}
      description={asset ? `${formatBytes(asset.size)} · ${asset.mime}${asset.width ? ` · ${asset.width}×${asset.height}` : ''} · added ${new Date(asset.createdAt).toLocaleDateString()}` : undefined}
      width="max-w-2xl"
      footer={
        asset && (
          <>
            <Button
              variant="danger-ghost"
              size="sm"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                const where = usage.length ? ` It is used as: ${usage.map((u) => u.label).join('; ')}. Those places will no longer show it.` : '';
                if (await del('asset', asset.id, { confirmTitle: `Delete “${asset.name}”?`, confirmMessage: `The file is removed from this device’s storage.${where} You can undo right after.` })) onClose();
              }}
            >
              Delete file
            </Button>
            <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={() => void download()}>
              Download original
            </Button>
          </>
        )
      }
    >
      {asset && (
        <div className="space-y-5">
          <AssetPreview asset={asset} />
          <AutoText key={`${asset.id}-name`} label="Name" value={asset.name} required="A file needs a name" onSave={(v) => save({ name: v.trim() })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select value={asset.category} onChange={(e) => void save({ category: e.target.value as AssetCategory })}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Folder">
              <Select value={asset.folder} onChange={(e) => void moveAsset(asset.id, e.target.value).catch((err) => toastError(err, 'Couldn’t move the file'))}>
                <option value="">Library root</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/\//g, ' / ')}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Tags" hint="Press Enter or comma to add a tag.">
            <TagInput value={asset.tags} onChange={(tags) => void save({ tags })} suggestions={allTags} />
          </Field>
          <AutoText key={`${asset.id}-desc`} label="Description" multiline rows={3} value={asset.description} placeholder="What this is and why it matters to the film" onSave={(v) => save({ description: v })} />

          <div className="space-y-3 border-t border-line pt-4">
            <div className="eyebrow">Linked to</div>
            <LinkRow label="Scenes">
              <MultiPicker value={asset.links.sceneIds} onChange={(v) => void saveLinks('sceneIds', v)} options={sceneOptions(data.scenes, numbers)} placeholder="Link scene" emptyText="No scenes yet" />
            </LinkRow>
            <LinkRow label="Characters">
              <MultiPicker value={asset.links.characterIds} onChange={(v) => void saveLinks('characterIds', v)} options={characterOptions(data.characters, data.people)} placeholder="Link character" emptyText="No characters yet" />
            </LinkRow>
            <LinkRow label="Storyboard">
              <MultiPicker
                value={asset.links.frameIds}
                onChange={(v) => void saveLinks('frameIds', v)}
                options={data.frames.map((f) => ({ value: f.id, label: `Frame ${frameNos.get(f.id)}`, hint: f.action || undefined }))}
                placeholder="Link frame"
                emptyText="No storyboard frames yet"
              />
            </LinkRow>
            <LinkRow label="Locations">
              <MultiPicker value={asset.links.locationIds} onChange={(v) => void saveLinks('locationIds', v)} options={locationOptions(data.locations)} placeholder="Link location" emptyText="No locations yet" />
            </LinkRow>
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <div className="eyebrow">Used as</div>
            {usage.length ? (
              <ul className="space-y-1">
                {usage.map((u, i) => (
                  <li key={i}>
                    <Link to={u.to} className="inline-flex items-center gap-1 text-[13px] text-ink hover:text-accent">
                      {u.label} <ArrowUpRight className="size-3.5 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-faint">Not used as a cover, portrait, frame image or photo anywhere yet.</p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function LinkRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="w-24 shrink-0 pt-0.5 text-[12px] text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
