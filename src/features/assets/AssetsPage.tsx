import { AlertCircle, Check, ChevronRight, Folder, FolderOpen, FolderPlus, HardDrive, LayoutGrid, List, Loader2, MoreHorizontal, Pencil, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { Button, cn, Dialog, EmptyState, Field, Input, Loading, Menu, MenuItem, PageContainer, PageHeader, Segmented, Select, toast, toastError, useConfirm } from '@/components/ui';
import { ACCEPT_ANY_ASSET, ASSET_CATEGORIES, assetCategoryLabel, SUPPORTED_FORMATS_TEXT } from '@/lib/constants';
import { addAsset, formatBytes, validateFile } from '@/lib/data/assets';
import { requestPersistentStorage, storageEstimate } from '@/lib/db';
import { useProjectData } from '@/lib/hooks';
import type { Asset, AssetCategory } from '@/lib/types';
import { AssetThumb } from './AssetPreview';
import { AssetSheet } from './AssetSheet';
import { allFolders, createFolder, deleteFolder, moveAsset, normalizeFolder, renameFolder, useSavedFolders } from './assetUtils';

type FolderSel = { kind: 'all' } | { kind: 'folder'; path: string };
const ASSET_DRAG = 'application/x-sceneforge-asset';
const VIEW_KEY = 'sceneforge:assets-view';

interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'saving' | 'done' | 'error';
  error?: string;
}

export default function AssetsPage() {
  const { project } = useWorkspace();
  const data = useProjectData(project.id);
  const savedFolders = useSavedFolders(project.id);
  const [params, setParams] = useSearchParams();
  const confirm = useConfirm();
  const [sel, setSel] = useState<FolderSel>({ kind: 'all' });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'all' | AssetCategory>('all');
  const [tag, setTag] = useState('all');
  const [view, setViewState] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [dragFiles, setDragFiles] = useState(false);
  const [folderDialog, setFolderDialog] = useState<null | { mode: 'create' } | { mode: 'rename'; path: string }>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const setView = (v: 'grid' | 'list') => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const assets = data?.assets ?? [];
  const folders = useMemo(() => allFolders(assets, savedFolders ?? []), [assets, savedFolders]);
  const allTags = useMemo(() => [...new Set(assets.flatMap((a) => a.tags))].sort((a, b) => a.localeCompare(b)), [assets]);
  const currentFolder = sel.kind === 'folder' ? sel.path : '';

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return assets.filter((a) => {
      if (sel.kind === 'folder' && a.folder !== sel.path) return false;
      if (category !== 'all' && a.category !== category) return false;
      if (tag !== 'all' && !a.tags.includes(tag)) return false;
      if (s && !`${a.name} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [assets, sel, category, tag, q]);

  const openId = params.get('asset');
  const openAsset = openId ? assets.find((a) => a.id === openId) ?? null : null;
  const open = (id: string) =>
    setParams((p) => {
      p.set('asset', id);
      return p;
    });
  const close = () =>
    setParams((p) => {
      p.delete('asset');
      return p;
    });

  const upload = async (files: File[]) => {
    if (!files.length) return;
    const items: UploadItem[] = files.map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, name: f.name, size: f.size, status: 'queued' }));
    setQueue((q0) => [...q0.filter((x) => x.status === 'saving' || x.status === 'queued'), ...items]);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const item = items[i];
      const err = validateFile(f);
      if (err) {
        setQueue((q0) => q0.map((x) => (x.id === item.id ? { ...x, status: 'error', error: err } : x)));
        continue;
      }
      setQueue((q0) => q0.map((x) => (x.id === item.id ? { ...x, status: 'saving' } : x)));
      try {
        await addAsset(project.id, f, { folder: currentFolder, category: category !== 'all' ? category : undefined });
        ok++;
        setQueue((q0) => q0.map((x) => (x.id === item.id ? { ...x, status: 'done' } : x)));
      } catch (e) {
        setQueue((q0) => q0.map((x) => (x.id === item.id ? { ...x, status: 'error', error: e instanceof Error ? e.message : String(e) } : x)));
      }
    }
    if (ok) {
      toast(`${ok} file${ok === 1 ? '' : 's'} saved${currentFolder ? ` to “${currentFolder}”` : ''}`);
      void requestPersistentStorage();
    }
  };

  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  if (!data || !savedFolders) return <Loading label="Loading assets" />;

  const counts = new Map<string, number>();
  for (const a of assets) counts.set(a.folder, (counts.get(a.folder) ?? 0) + 1);
  const filtered = q.trim() || category !== 'all' || tag !== 'all';

  return (
    <PageContainer
      wide
      className="relative"
    >
      <div
        onDragEnter={(e) => {
          if (!isFileDrag(e)) return;
          dragDepth.current++;
          setDragFiles(true);
        }}
        onDragOver={(e) => {
          if (isFileDrag(e)) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!isFileDrag(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragFiles(false);
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragFiles(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <PageHeader
          eyebrow={`${assets.length} file${assets.length === 1 ? '' : 's'} · ${formatBytes(assets.reduce((n, a) => n + a.size, 0))}`}
          title="Assets"
          description="Reference photos, concept art, location images, music references, sound effects, documents and clips — organised in folders, tagged, and linked to the scenes, characters, frames and locations they belong to."
          actions={
            <>
              <Button icon={<FolderPlus className="size-4" />} onClick={() => setFolderDialog({ mode: 'create' })}>
                New folder
              </Button>
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>
                Upload files
              </Button>
            </>
          }
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT_ANY_ASSET}
          className="hidden"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />

        <StoragePanel />
        <UploadQueue items={queue} onClear={() => setQueue((q0) => q0.filter((x) => x.status === 'saving' || x.status === 'queued'))} />

        <div className="mt-5 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <FolderNav
            folders={folders}
            counts={counts}
            total={assets.length}
            sel={sel}
            setSel={setSel}
            onDropAsset={(assetId, path) => void moveAsset(assetId, path).then(() => toast(path ? `Moved to “${path}”` : 'Moved to the library root')).catch((e) => toastError(e, 'Couldn’t move the file'))}
            onRename={(path) => setFolderDialog({ mode: 'rename', path })}
            onDelete={async (path) => {
              const inside = assets.filter((a) => a.folder === path || a.folder.startsWith(path + '/')).length;
              const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
              const ok = await confirm({
                title: `Delete folder “${path.split('/').pop()}”?`,
                message: inside ? `${inside} file${inside === 1 ? '' : 's'} inside will move to ${parent ? `“${parent}”` : 'the library root'}. No files are deleted.` : 'The folder is empty.',
                confirmLabel: 'Delete folder',
                danger: true,
              });
              if (!ok) return;
              try {
                await deleteFolder(project.id, path, assets);
                if (sel.kind === 'folder' && (sel.path === path || sel.path.startsWith(path + '/'))) setSel({ kind: 'all' });
                toast('Folder deleted');
              } catch (e) {
                toastError(e, 'Couldn’t delete the folder');
              }
            }}
          />

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, descriptions, tags" className="h-8 pl-8 text-[12.5px]" aria-label="Search assets" />
              </div>
              <Select value={category} onChange={(e) => setCategory(e.target.value as 'all' | AssetCategory)} className="h-8 w-auto text-[12.5px]" aria-label="Filter by category">
                <option value="all">All categories</option>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Select value={tag} onChange={(e) => setTag(e.target.value)} className="h-8 w-auto text-[12.5px]" aria-label="Filter by tag" disabled={!allTags.length}>
                <option value="all">{allTags.length ? 'All tags' : 'No tags yet'}</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </Select>
              {filtered && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X className="size-3.5" />}
                  onClick={() => {
                    setQ('');
                    setCategory('all');
                    setTag('all');
                  }}
                >
                  Clear
                </Button>
              )}
              <Segmented
                className="ml-auto"
                label="Layout"
                value={view}
                onChange={setView}
                options={[
                  { value: 'grid', label: '', icon: <LayoutGrid className="size-3.5" />, title: 'Grid' },
                  { value: 'list', label: '', icon: <List className="size-3.5" />, title: 'List' },
                ]}
              />
            </div>

            {assets.length === 0 ? (
              <button onClick={() => fileInput.current?.click()} className="block w-full rounded-md border border-dashed border-line-strong text-center transition-colors hover:border-accent hover:bg-accent-soft/40">
                <EmptyState icon={<Upload className="size-6" />} title="Build your production library">
                  Drop files anywhere on this page or click to choose them. Keep reference photos, concept art, mood music, sound effects, location scouting shots and documents together with the film.
                  <span className="mt-3 block text-[11.5px] text-faint">{SUPPORTED_FORMATS_TEXT}</span>
                </EmptyState>
              </button>
            ) : visible.length === 0 ? (
              <EmptyState compact title={filtered ? 'No files match' : 'This folder is empty'}>
                {filtered ? 'Try a different search or filter.' : 'Upload files while this folder is selected, or drag files from the grid onto it.'}
              </EmptyState>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {visible.map((a) => (
                  <AssetCard key={a.id} asset={a} onOpen={() => open(a.id)} />
                ))}
              </div>
            ) : (
              <AssetTable assets={visible} onOpen={open} />
            )}
          </div>
        </div>

        {dragFiles && (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/55 animate-fade-in">
            <div className="rounded-md border border-dashed border-accent bg-panel px-10 py-8 text-center shadow-pop">
              <Upload className="mx-auto size-7 text-accent" />
              <p className="display mt-2 text-[26px] text-ink">Drop to add {currentFolder ? `to “${currentFolder}”` : 'to the library'}</p>
              <p className="mt-1 text-[12px] text-faint">{SUPPORTED_FORMATS_TEXT}</p>
            </div>
          </div>
        )}
      </div>

      <AssetSheet asset={openAsset} data={data} folders={folders} allTags={allTags} onClose={close} />
      <FolderDialog
        state={folderDialog}
        current={currentFolder}
        onClose={() => setFolderDialog(null)}
        onSubmit={async (name, insideCurrent) => {
          if (!folderDialog) return;
          if (folderDialog.mode === 'create') {
            const path = await createFolder(project.id, insideCurrent && currentFolder ? `${currentFolder}/${name}` : name);
            setSel({ kind: 'folder', path });
            toast(`Folder “${path}” created`);
          } else {
            const parent = folderDialog.path.includes('/') ? folderDialog.path.slice(0, folderDialog.path.lastIndexOf('/')) : '';
            const target = normalizeFolder(parent ? `${parent}/${name}` : name);
            if (target !== folderDialog.path && folders.includes(target)) throw new Error(`A folder called “${name}” already exists here.`);
            const path = await renameFolder(project.id, folderDialog.path, target, assets);
            if (sel.kind === 'folder' && sel.path === folderDialog.path) setSel({ kind: 'folder', path });
            toast('Folder renamed');
          }
        }}
      />
    </PageContainer>
  );
}

function StoragePanel() {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const refresh = async () => {
    setEst(await storageEstimate());
    try {
      setPersisted(navigator.storage?.persisted ? await navigator.storage.persisted() : null);
    } catch {
      setPersisted(null);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const pct = est && est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface/60 px-4 py-3 text-[12.5px] lg:flex-row lg:items-center lg:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <HardDrive className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-ink">Files are stored in this browser, on this device.</p>
          <p className="text-faint">They are not uploaded anywhere. Export a backup from project Settings to keep a copy elsewhere. {SUPPORTED_FORMATS_TEXT}.</p>
        </div>
      </div>
      {est && est.quota > 0 && (
        <div className="w-full shrink-0 lg:w-56">
          <div className="mb-1 flex justify-between font-mono text-[11px] text-muted">
            <span>{formatBytes(est.usage)} used</span>
            <span>{formatBytes(est.quota)} available</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--c-ink)_9%,transparent)]">
            <div className={cn('h-full rounded-full', pct > 85 ? 'bg-danger' : 'bg-accent')} style={{ width: `${Math.max(pct, 0.5)}%` }} />
          </div>
        </div>
      )}
      {persisted !== null && (
        <div className="shrink-0">
          {persisted ? (
            <span className="inline-flex items-center gap-1.5 text-success" title="The browser won’t clear this data to free up space.">
              <ShieldCheck className="size-4" /> Protected storage
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<ShieldCheck className="size-3.5" />}
              title="Ask the browser not to clear SCENEFORGE data when the device is low on space"
              onClick={async () => {
                const ok = await requestPersistentStorage();
                await refresh();
                if (ok) toast('Storage is now protected');
                else toast.info('The browser declined for now', 'Browsers grant this to sites you use often or have installed. Your files are still saved.');
              }}
            >
              Protect storage
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function UploadQueue({ items, onClear }: { items: UploadItem[]; onClear: () => void }) {
  if (!items.length) return null;
  const busy = items.some((i) => i.status === 'saving' || i.status === 'queued');
  const done = items.filter((i) => i.status === 'done').length;
  return (
    <div className="mt-3 rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="text-[12.5px] text-ink">{busy ? `Saving ${done + 1} of ${items.length}…` : `${done} of ${items.length} saved`}</span>
        {!busy && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Dismiss
          </Button>
        )}
      </div>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 px-4 py-2 text-[12.5px]">
            <span className="mt-0.5 shrink-0">
              {i.status === 'done' ? <Check className="size-3.5 text-success" /> : i.status === 'error' ? <AlertCircle className="size-3.5 text-danger" /> : i.status === 'saving' ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <span className="block size-3.5 rounded-full border border-line-strong" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink">{i.name}</span>
              {i.error && <span className="block text-danger">{i.error}</span>}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-faint">{formatBytes(i.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FolderNav({
  folders,
  counts,
  total,
  sel,
  setSel,
  onDropAsset,
  onRename,
  onDelete,
}: {
  folders: string[];
  counts: Map<string, number>;
  total: number;
  sel: FolderSel;
  setSel: (s: FolderSel) => void;
  onDropAsset: (assetId: string, path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const dropProps = (path: string) => ({
    onDragOver: (e: DragEvent) => {
      if (Array.from(e.dataTransfer.types).includes(ASSET_DRAG)) {
        e.preventDefault();
        setOver(path);
      }
    },
    onDragLeave: () => setOver((o) => (o === path ? null : o)),
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(ASSET_DRAG);
      setOver(null);
      if (id) {
        e.preventDefault();
        e.stopPropagation();
        onDropAsset(id, path);
      }
    },
  });
  const isSel = (path: string | null) => (path === null ? sel.kind === 'all' : sel.kind === 'folder' && sel.path === path);
  const itemCls = (active: boolean, path: string) =>
    cn('group flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[13px] transition-colors', active ? 'bg-hover text-ink' : 'text-muted hover:bg-hover/60 hover:text-ink', over === path && 'bg-accent-soft text-ink ring-1 ring-accent');

  return (
    <>
      <div className="md:hidden">
        <Select
          value={sel.kind === 'all' ? '__all' : sel.path}
          onChange={(e) => setSel(e.target.value === '__all' ? { kind: 'all' } : { kind: 'folder', path: e.target.value })}
          aria-label="Folder"
        >
          <option value="__all">All files ({total})</option>
          <option value="">Library root ({counts.get('') ?? 0})</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f.replace(/\//g, ' / ')} ({counts.get(f) ?? 0})
            </option>
          ))}
        </Select>
      </div>
      <nav className="hidden space-y-0.5 md:block" aria-label="Folders">
        <button className={itemCls(isSel(null), '__all')} onClick={() => setSel({ kind: 'all' })}>
          <FolderOpen className="size-4 shrink-0 text-faint" />
          <span className="flex-1 truncate">All files</span>
          <span className="font-mono text-[11px] text-faint">{total}</span>
        </button>
        <button className={itemCls(isSel(''), '')} onClick={() => setSel({ kind: 'folder', path: '' })} {...dropProps('')}>
          <Folder className="size-4 shrink-0 text-faint" />
          <span className="flex-1 truncate">Library root</span>
          <span className="font-mono text-[11px] text-faint">{counts.get('') ?? 0}</span>
        </button>
        {folders.length > 0 && <div className="eyebrow px-2 pb-1 pt-3">Folders</div>}
        {folders.map((f) => {
          const depth = f.split('/').length - 1;
          return (
            <div key={f} className={itemCls(isSel(f), f)} style={{ paddingLeft: 8 + depth * 14 }} {...dropProps(f)}>
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSel({ kind: 'folder', path: f })}>
                {depth > 0 ? <ChevronRight className="size-3 shrink-0 text-faint" /> : null}
                <Folder className={cn('size-4 shrink-0', isSel(f) ? 'text-accent' : 'text-faint')} />
                <span className="truncate">{f.split('/').pop()}</span>
              </button>
              <span className="font-mono text-[11px] text-faint group-hover:hidden">{counts.get(f) ?? 0}</span>
              <Menu
                trigger={
                  <button className="hidden size-6 items-center justify-center rounded-xs text-faint hover:bg-raised hover:text-ink group-hover:flex focus-visible:flex" aria-label={`Folder actions for ${f}`}>
                    <MoreHorizontal className="size-3.5" />
                  </button>
                }
              >
                <MenuItem icon={<Pencil className="size-3.5" />} onSelect={() => onRename(f)}>
                  Rename
                </MenuItem>
                <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={() => onDelete(f)}>
                  Delete folder
                </MenuItem>
              </Menu>
            </div>
          );
        })}
        {total > 0 && <p className="px-2 pt-3 text-[11.5px] leading-snug text-faint">Drag a file onto a folder to move it.</p>}
      </nav>
    </>
  );
}

function AssetCard({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  const linkCount = asset.links.sceneIds.length + asset.links.characterIds.length + asset.links.frameIds.length + asset.links.locationIds.length;
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG, asset.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onOpen}
      className="group overflow-hidden rounded-md border border-line bg-surface text-left transition-[border-color,transform] hover:-translate-y-px hover:border-line-strong"
    >
      <AssetThumb asset={asset} className="aspect-[4/3] w-full border-b border-line" />
      <div className="space-y-0.5 px-2.5 py-2">
        <p className="truncate text-[12.5px] text-ink" title={asset.name}>
          {asset.name}
        </p>
        <p className="truncate font-mono text-[10.5px] text-faint">
          {formatBytes(asset.size)} · {assetCategoryLabel(asset.category)}
          {linkCount ? ` · ${linkCount} link${linkCount === 1 ? '' : 's'}` : ''}
        </p>
        {asset.tags.length > 0 && <p className="truncate text-[11px] text-muted">{asset.tags.map((t) => `#${t}`).join(' ')}</p>}
      </div>
    </button>
  );
}

function AssetTable({ assets, onOpen }: { assets: Asset[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-[13px]">
        <thead className="border-b border-line bg-surface">
          <tr className="text-left">
            <th className="px-3 py-2 font-normal">
              <span className="eyebrow">Name</span>
            </th>
            <th className="hidden px-3 py-2 font-normal md:table-cell">
              <span className="eyebrow">Category</span>
            </th>
            <th className="hidden px-3 py-2 font-normal lg:table-cell">
              <span className="eyebrow">Folder</span>
            </th>
            <th className="px-3 py-2 text-right font-normal">
              <span className="eyebrow">Size</span>
            </th>
            <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">
              <span className="eyebrow">Added</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr
              key={a.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(ASSET_DRAG, a.id)}
              onClick={() => onOpen(a.id)}
              className="cursor-pointer border-b border-line last:border-b-0 hover:bg-hover/50"
            >
              <td className="px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <AssetThumb asset={a} className="size-9 shrink-0 rounded-xs border border-line [&_svg]:size-4 [&_.slate]:hidden" />
                  <div className="min-w-0">
                    <p className="truncate text-ink">{a.name}</p>
                    {a.tags.length > 0 && <p className="truncate text-[11px] text-faint">{a.tags.map((t) => `#${t}`).join(' ')}</p>}
                  </div>
                </div>
              </td>
              <td className="hidden px-3 py-2 text-muted md:table-cell">{assetCategoryLabel(a.category)}</td>
              <td className="hidden max-w-[200px] truncate px-3 py-2 text-muted lg:table-cell">{a.folder || '—'}</td>
              <td className="px-3 py-2 text-right font-mono text-[11.5px] text-muted">{formatBytes(a.size)}</td>
              <td className="hidden px-3 py-2 text-right font-mono text-[11.5px] text-faint sm:table-cell">{new Date(a.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FolderDialog({
  state,
  current,
  onClose,
  onSubmit,
}: {
  state: null | { mode: 'create' } | { mode: 'rename'; path: string };
  current: string;
  onClose: () => void;
  onSubmit: (name: string, insideCurrent: boolean) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [inside, setInside] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(state?.mode === 'rename' ? state.path.split('/').pop() ?? '' : '');
    setInside(true);
    setError(null);
  }, [state]);

  const submit = async () => {
    const n = name.trim();
    if (!n) return setError('Give the folder a name.');
    if (n.includes('/')) return setError('Folder names can’t contain “/”.');
    setBusy(true);
    try {
      await onSubmit(n, inside);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={state?.mode === 'rename' ? 'Rename folder' : 'New folder'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {state?.mode === 'rename' ? 'Rename' : 'Create folder'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Folder name" error={error}>
          <Input autoFocus value={name} invalid={!!error} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="e.g. Location scouting" maxLength={60} />
        </Field>
        {state?.mode === 'create' && current && (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={inside} onChange={(e) => setInside(e.target.checked)} className="size-4 accent-[var(--c-accent)]" />
            Create inside “{current}”
          </label>
        )}
      </form>
    </Dialog>
  );
}
