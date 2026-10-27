import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileSignature,
  History,
  Keyboard,
  ListTree,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Redo2,
  Save,
  Search,
  Star,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui';
import { ELEMENT_TYPES, revisionColor } from '@/lib/constants';
import { formatSeconds } from '@/lib/dates';
import type { AppSettings, ElementType, Script } from '@/lib/types';
import type { ScriptEditorApi } from './useScriptEditor';

export interface ToolbarActions {
  switchDraft: (id: string) => void;
  newDraft: () => void;
  duplicate: () => void;
  draftSettings: () => void;
  makePrimary: () => void;
  deleteDraft: () => void;
  find: () => void;
  versions: () => void;
  saveVersion: () => void;
  importFile: () => void;
  exportPdf: () => void;
  exportFountain: () => void;
  exportFdx: () => void;
  titlePage: () => void;
  shortcuts: () => void;
  setPaper: (p: 'dark' | 'light') => void;
  toggleNumbers: () => void;
  setPageSize: (s: 'letter' | 'a4') => void;
  toggleFocus: () => void;
  toggleContext: () => void;
  openOutline: () => void;
  openContext: () => void;
}

export interface Stats {
  pages: number;
  pageCount: number;
  words: number;
  runtimeSec: number;
  scenes: number;
}

export function statsLine(s: Stats) {
  return `${s.pageCount} ${s.pageCount === 1 ? 'page' : 'pages'} · ${s.words.toLocaleString()} words · ~${formatSeconds(s.runtimeSec)} · ${s.scenes} ${s.scenes === 1 ? 'scene' : 'scenes'}`;
}

function SaveIndicator({ editor }: { editor: ScriptEditorApi }) {
  const { saveState, saveError, lastSavedAt } = editor;
  if (saveState === 'error') {
    return (
      <button onClick={editor.retry} className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] text-danger hover:bg-danger-soft" title={saveError ?? 'Save failed'}>
        <AlertCircle className="size-3.5" /> Not saved · Retry
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap px-1 text-[12px] text-faint" role="status" aria-live="polite" title={`Last saved ${format(lastSavedAt, 'PPpp')}`}>
      {saveState === 'saving' ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </>
      ) : saveState === 'pending' ? (
        <>
          <span className="size-1.5 rounded-full bg-warning" /> Unsaved
        </>
      ) : (
        <>
          <Check className="size-3.5 text-success" /> Saved
        </>
      )}
    </span>
  );
}

function DraftMenu({ scripts, script, primaryId, actions, compact }: { scripts: Script[]; script: Script; primaryId?: string; actions: ToolbarActions; compact?: boolean }) {
  const isPrimary = script.id === primaryId;
  const rc = revisionColor(script.revisionColor);
  return (
    <Menu
      align="start"
      trigger={
        <button className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-hover" aria-label={`Draft: ${script.title}`}>
          <span className="size-2.5 shrink-0 rounded-full border border-line-strong" style={{ background: rc.swatch }} title={`${rc.label} revision`} />
          <span className={cn('truncate text-[13px] font-medium text-ink', compact ? 'max-w-[110px]' : 'max-w-[220px]')}>{script.title}</span>
          {isPrimary && !compact && <span className="shrink-0 rounded-xs border border-accent/40 px-1 font-mono text-[9.5px] uppercase tracking-wider text-accent">Production</span>}
          <ChevronDown className="size-3.5 shrink-0 text-faint" />
        </button>
      }
    >
      <MenuLabel>Drafts</MenuLabel>
      {scripts.map((s) => (
        <MenuItem key={s.id} checked={s.id === script.id} onSelect={() => s.id !== script.id && actions.switchDraft(s.id)} shortcut={s.id === primaryId ? 'PROD' : `${s.pageCount}pp`}>
          {s.title}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<FilePlus2 className="size-3.5" />} onSelect={actions.newDraft}>
        New blank draft…
      </MenuItem>
      <MenuItem icon={<Copy className="size-3.5" />} onSelect={actions.duplicate}>
        Duplicate this draft
      </MenuItem>
      <MenuItem icon={<Pencil className="size-3.5" />} onSelect={actions.draftSettings}>
        Name & revision colour…
      </MenuItem>
      <MenuItem icon={<Star className="size-3.5" />} onSelect={actions.makePrimary} disabled={isPrimary}>
        {isPrimary ? 'This is the production draft' : 'Use as production draft'}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Trash2 className="size-3.5" />} danger onSelect={actions.deleteDraft} disabled={scripts.length <= 1}>
        Delete draft
      </MenuItem>
    </Menu>
  );
}

function ExportMenu({ actions, trigger }: { actions: ToolbarActions; trigger: React.ReactNode }) {
  return (
    <Menu trigger={trigger}>
      <MenuLabel>Export</MenuLabel>
      <MenuItem onSelect={actions.exportPdf}>PDF (screenplay format)…</MenuItem>
      <MenuItem onSelect={actions.exportFountain}>Fountain (.fountain)</MenuItem>
      <MenuItem onSelect={actions.exportFdx}>Final Draft (.fdx)</MenuItem>
    </Menu>
  );
}

function ViewMenu({ settings, focusMode, actions }: { settings: AppSettings['editor']; focusMode: boolean; actions: ToolbarActions }) {
  return (
    <Menu
      trigger={
        <span>
          <IconButton label="View options">
            <Eye className="size-4" />
          </IconButton>
        </span>
      }
    >
      <MenuLabel>Page</MenuLabel>
      <MenuItem checked={settings.paper === 'dark'} onSelect={() => actions.setPaper('dark')}>
        Dark paper
      </MenuItem>
      <MenuItem checked={settings.paper === 'light'} onSelect={() => actions.setPaper('light')}>
        White paper
      </MenuItem>
      <MenuItem checked={settings.showSceneNumbers} onSelect={actions.toggleNumbers}>
        Scene numbers
      </MenuItem>
      <MenuSeparator />
      <MenuLabel>Page size (page breaks & PDF)</MenuLabel>
      <MenuItem checked={settings.pageSize === 'letter'} onSelect={() => actions.setPageSize('letter')}>
        US Letter
      </MenuItem>
      <MenuItem checked={settings.pageSize === 'a4'} onSelect={() => actions.setPageSize('a4')}>
        A4
      </MenuItem>
      <MenuSeparator />
      <MenuItem checked={focusMode} onSelect={actions.toggleFocus}>
        Focus mode
      </MenuItem>
      <MenuItem icon={<Keyboard className="size-3.5" />} onSelect={actions.shortcuts}>
        Keyboard shortcuts
      </MenuItem>
    </Menu>
  );
}

export function Toolbar({
  scripts,
  script,
  primaryId,
  editor,
  stats,
  settings,
  focusMode,
  contextOpen,
  actions,
}: {
  scripts: Script[];
  script: Script;
  primaryId?: string;
  editor: ScriptEditorApi;
  stats: Stats;
  settings: AppSettings['editor'];
  focusMode: boolean;
  contextOpen: boolean;
  actions: ToolbarActions;
}) {
  const type = editor.focusedEl?.type;
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 sm:px-3">
      <div className="hidden md:block">
        <DraftMenu scripts={scripts} script={script} primaryId={primaryId} actions={actions} />
      </div>
      <div className="md:hidden min-w-0">
        <DraftMenu scripts={scripts} script={script} primaryId={primaryId} actions={actions} compact />
      </div>

      {/* Desktop controls */}
      <div className="hidden items-center gap-0.5 md:flex">
        <span className="mx-1.5 h-5 w-px bg-line" />
        <select
          aria-label="Element type"
          value={type ?? ''}
          disabled={!type}
          onChange={(e) => editor.setFocusedType(e.target.value as ElementType)}
          className="input h-7 w-[150px] py-0 pl-2 text-[12.5px]"
        >
          {!type && <option value="">Element</option>}
          {ELEMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label} · Alt {t.key}
            </option>
          ))}
        </select>
        <IconButton label="Undo (⌘Z)" onClick={editor.undo} disabled={!editor.canUndo}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" onClick={editor.redo} disabled={!editor.canRedo}>
          <Redo2 className="size-4" />
        </IconButton>
        <span className="mx-1.5 h-5 w-px bg-line" />
        <IconButton label="Find & replace (⌘F)" onClick={actions.find}>
          <Search className="size-4" />
        </IconButton>
        <IconButton label="Version history" onClick={actions.versions}>
          <History className="size-4" />
        </IconButton>
        <IconButton label="Save a version (⌘S)" onClick={actions.saveVersion}>
          <Save className="size-4" />
        </IconButton>
        <IconButton label="Import screenplay" onClick={actions.importFile}>
          <Upload className="size-4" />
        </IconButton>
        <ExportMenu
          actions={actions}
          trigger={
            <span>
              <IconButton label="Export">
                <Download className="size-4" />
              </IconButton>
            </span>
          }
        />
        <IconButton label="Title page" onClick={actions.titlePage}>
          <FileSignature className="size-4" />
        </IconButton>
        <ViewMenu settings={settings} focusMode={focusMode} actions={actions} />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <span className="hidden whitespace-nowrap font-mono text-[11px] text-faint 2xl:inline">{statsLine(stats)}</span>
        <span className="hidden whitespace-nowrap font-mono text-[11px] text-faint xl:inline 2xl:hidden">
          {stats.pageCount}pp · ~{formatSeconds(stats.runtimeSec)}
        </span>
        <SaveIndicator editor={editor} />
        <div className="hidden items-center md:flex">
          <IconButton label={focusMode ? 'Exit focus mode' : 'Focus mode'} onClick={actions.toggleFocus} active={focusMode}>
            {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </IconButton>
          {!focusMode && (
            <IconButton label={contextOpen ? 'Hide scene panel' : 'Show scene panel'} onClick={actions.toggleContext} active={contextOpen} className="hidden lg:inline-flex">
              <PanelRight className="size-4" />
            </IconButton>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center md:hidden">
          <IconButton label="Undo" onClick={editor.undo} disabled={!editor.canUndo}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton label="Redo" onClick={editor.redo} disabled={!editor.canRedo}>
            <Redo2 className="size-4" />
          </IconButton>
          <Menu
            trigger={
              <span>
                <IconButton label="More script actions">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </span>
            }
          >
            <MenuItem icon={<ListTree className="size-3.5" />} onSelect={actions.openOutline}>
              Scenes in this draft
            </MenuItem>
            <MenuItem icon={<PanelRight className="size-3.5" />} onSelect={actions.openContext}>
              Current scene details
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Search className="size-3.5" />} onSelect={actions.find}>
              Find & replace
            </MenuItem>
            <MenuItem icon={<History className="size-3.5" />} onSelect={actions.versions}>
              Version history
            </MenuItem>
            <MenuItem icon={<Save className="size-3.5" />} onSelect={actions.saveVersion}>
              Save a version
            </MenuItem>
            <MenuItem icon={<Upload className="size-3.5" />} onSelect={actions.importFile}>
              Import screenplay
            </MenuItem>
            <MenuItem icon={<Download className="size-3.5" />} onSelect={actions.exportPdf}>
              Export PDF
            </MenuItem>
            <MenuItem onSelect={actions.exportFountain}>Export Fountain</MenuItem>
            <MenuItem onSelect={actions.exportFdx}>Export Final Draft</MenuItem>
            <MenuItem icon={<FileSignature className="size-3.5" />} onSelect={actions.titlePage}>
              Title page
            </MenuItem>
            <MenuSeparator />
            <MenuItem checked={settings.paper === 'light'} onSelect={() => actions.setPaper(settings.paper === 'light' ? 'dark' : 'light')}>
              White paper
            </MenuItem>
            <MenuItem checked={settings.showSceneNumbers} onSelect={actions.toggleNumbers}>
              Scene numbers
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>{statsLine(stats)}</MenuLabel>
          </Menu>
        </div>
      </div>
    </div>
  );
}

/** Element type chips for touch devices, where Tab and Alt shortcuts aren't available. */
export function ElementBar({ editor }: { editor: ScriptEditorApi }) {
  const type = editor.focusedEl?.type;
  if (!editor.hasFocus || !type) return null;
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-panel px-2 py-1.5 no-scrollbar md:hidden" role="toolbar" aria-label="Element type">
      {ELEMENT_TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => editor.setFocusedType(t.value)}
          className={cn('h-7 shrink-0 rounded-xs border px-2.5 text-[11.5px]', type === t.value ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-muted')}
        >
          {t.label.replace(' Heading', '')}
        </button>
      ))}
    </div>
  );
}
