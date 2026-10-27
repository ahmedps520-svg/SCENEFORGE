import { ChevronDown, ChevronLeft, FileUp, Plus, Search, Settings, ArchiveRestore } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { openCommandPalette } from '@/app/commands';
import { ThemeToggle } from '@/app/ThemeToggle';
import { Button, cn, IconButton, Menu, MenuItem, toast, toastError } from '@/components/ui';
import { importProjectFile } from '@/lib/data/backup';

/** The studio's slate mark: a small clapperboard drawn in the accent colour. */
export function SlateMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-5', className)} aria-hidden>
      <path d="M3.5 9.5h17v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="var(--c-accent)" strokeWidth="1.4" />
      <path d="m3.2 6.4 15.9-2.9.55 3-15.9 2.9z" fill="var(--c-accent)" />
      <path d="m7 5.7 1.9 2.4M11.2 4.9l1.9 2.4M15.4 4.2l1.9 2.4" stroke="var(--c-bg)" strokeWidth="1.3" />
      <circle cx="12" cy="15" r="1.6" fill="var(--c-live)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <SlateMark />
      <span className="font-mono text-[11.5px] font-semibold tracking-[0.32em] text-ink">SCENEFORGE</span>
    </span>
  );
}

/** Hidden file input that restores a .sceneforge backup and opens it. */
export function useRestoreBackup() {
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const element = (
    <input
      ref={input}
      type="file"
      accept=".sceneforge,application/zip"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try {
          const project = await importProjectFile(file);
          toast(`Restored “${project.title}”`, { detail: 'Imported as a new project — nothing existing was overwritten.' });
          navigate(`/p/${project.id}/overview`);
        } catch (err) {
          toastError(err, 'Backup not restored');
        } finally {
          setBusy(false);
        }
      }}
    />
  );
  return { open: () => input.current?.click(), element, busy };
}

/** Top bar for studio-level screens (dashboard, settings, creation flows). */
export function StudioBar({ back, title }: { back?: { to: string; label: string }; title?: string }) {
  const navigate = useNavigate();
  const restore = useRestoreBackup();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-1 px-3 sm:gap-2 sm:px-6 lg:px-10">
        {back ? (
          <Link to={back.to} className="group mr-2 flex min-w-0 items-center gap-2 text-[13px] text-muted hover:text-ink">
            <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="truncate">{back.label}</span>
          </Link>
        ) : (
          <Link to="/" className="mr-2 shrink-0 sm:mr-3" aria-label="SCENEFORGE studio">
            <Wordmark />
          </Link>
        )}
        {title && <span className="hidden truncate text-[13px] text-ink sm:inline">{title}</span>}
        <div className="flex-1" />
        {!back && (
          <>
            <button
              onClick={() => openCommandPalette()}
              className="hidden h-8 items-center gap-2 rounded-sm border border-line-strong bg-surface pl-2.5 pr-1.5 text-[12.5px] text-faint transition-colors hover:text-ink md:flex"
            >
              <Search className="size-3.5" />
              <span className="w-40 text-left">Search your films…</span>
              <span className="kbd">⌘K</span>
            </button>
            <IconButton label="Search" onClick={() => openCommandPalette()} className="md:hidden">
              <Search className="size-4" />
            </IconButton>
            <Menu
              trigger={
                <Button variant="ghost" size="sm" icon={<FileUp className="size-3.5 sm:hidden" />} iconRight={<ChevronDown className="hidden size-3.5 sm:block" />} loading={restore.busy} aria-label="Import">
                  <span className="hidden sm:inline">Import</span>
                </Button>
              }
            >
              <MenuItem icon={<FileUp className="size-3.5" />} onSelect={() => navigate('/import')}>
                Import a screenplay
              </MenuItem>
              <MenuItem icon={<ArchiveRestore className="size-3.5" />} onSelect={restore.open}>
                Restore a backup (.sceneforge)
              </MenuItem>
            </Menu>
            <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => navigate('/new')} aria-label="New film">
              <span className="hidden sm:inline">New film</span>
            </Button>
          </>
        )}
        <Link to="/settings" className="btn-icon" aria-label="Settings" title="Settings">
          <Settings className="size-4" />
        </Link>
        <ThemeToggle />
      </div>
      {!back && restore.element}
    </header>
  );
}
