import { AlertTriangle, FilePlus2, Minimize2, UserPlus, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace, type AssistantFocus } from '@/app/WorkspaceLayout';
import { Button, EmptyState, IconButton, Loading, Sheet, toast, toastError, toastUndo, useConfirm } from '@/components/ui';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeCharacter } from '@/lib/data/factories';
import { titleCase } from '@/lib/data/projects';
import { createDraft, deleteDraft, renameDraft, restoreVersion, saveScript, saveVersion, setPrimaryDraft, syncScenes } from '@/lib/data/scripts';
import { updateSettings, useSettings } from '@/lib/data/settings';
import { downloadText, slug } from '@/lib/download';
import { useCharacters, useLocations, useScripts } from '@/lib/hooks';
import { exportScreenplayPdf } from '@/lib/pdf/screenplay';
import { toFdx } from '@/lib/screenplay/fdx';
import { toFountain } from '@/lib/screenplay/fountain';
import { countWords, paginate, sceneLengths } from '@/lib/screenplay/paginate';
import { cueName } from '@/lib/screenplay/sync';
import type { Project, RevisionColor, Script, TitlePage } from '@/lib/types';
import { ContextPanel } from './ContextPanel';
import { DraftSettingsDialog, ExportPdfDialog, ImportDialog, NameDialog, SaveVersionDialog, ShortcutsDialog, TitlePageDialog, type ImportChoice, type PdfOptions } from './dialogs';
import { Editor, type Highlight } from './Editor';
import { FindBar } from './FindBar';
import { headingNumbers } from './ops';
import { buildOutline, SceneNavigator } from './SceneNavigator';
import { ElementBar, statsLine, Toolbar, type Stats, type ToolbarActions } from './Toolbar';
import { useScriptEditor } from './useScriptEditor';
import { VersionHistory } from './VersionHistory';
import './script.css';

export default function ScriptPage() {
  const { project, openAssistant } = useWorkspace();
  const scripts = useScripts(project.id);
  const [params] = useSearchParams();

  if (scripts === undefined) return <Loading label="Opening script" />;
  if (!scripts.length) return <NoDrafts project={project} />;
  const wanted = params.get('draft');
  const script = scripts.find((s) => s.id === wanted) ?? scripts.find((s) => s.id === project.primaryScriptId) ?? scripts[0];
  return <ScriptWorkspace key={script.id} project={project} script={script} scripts={scripts} openAssistant={openAssistant} />;
}

function NoDrafts({ project }: { project: Project }) {
  const [busy, setBusy] = useState(false);
  return (
    <EmptyState
      icon={<FilePlus2 className="size-5" />}
      title="No drafts yet"
      actions={
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const d = await createDraft(project.id, { title: 'First Draft' });
              await setPrimaryDraft(project.id, d.id);
            } catch (e) {
              toastError(e, 'Couldn’t create a draft');
            } finally {
              setBusy(false);
            }
          }}
        >
          Start the first draft
        </Button>
      }
    >
      Every film starts on the page. Create a draft to begin writing — scene headings you write become scenes in your breakdown.
    </EmptyState>
  );
}

type DialogKind = null | 'newDraft' | 'draftSettings' | 'saveVersion' | 'titlePage' | 'exportPdf' | 'import' | 'shortcuts';

function ScriptWorkspace({ project, script, scripts, openAssistant }: { project: Project; script: Script; scripts: Script[]; openAssistant: (f?: AssistantFocus) => void }) {
  const settings = useSettings();
  const characters = useCharacters(project.id);
  const locations = useLocations(project.id);
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const isPrimary = project.primaryScriptId === script.id;
  const editorSettings = settings?.editor ?? { paper: 'dark' as const, showSceneNumbers: true, pageSize: 'letter' as const };

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [highlights, setHighlights] = useState<Map<string, Highlight[]> | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [contextOpen, setContextOpen] = useState(() => {
    try {
      return localStorage.getItem('sceneforge:script-context') !== '0';
    } catch {
      return true;
    }
  });
  const [mobilePanel, setMobilePanel] = useState<null | 'outline' | 'context'>(null);
  const [unknownCues, setUnknownCues] = useState<string[]>([]);
  const [dismissedCues, setDismissedCues] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const knownNames = useMemo(
    () => [...new Set((characters ?? []).flatMap((c) => [c.name, ...c.aliases]).map((n) => cueName(n)).filter(Boolean))],
    [characters],
  );
  const locationNames = useMemo(() => (locations ?? []).map((l) => l.name.toUpperCase()).filter(Boolean), [locations]);

  const editor = useScriptEditor({
    script,
    knownNames,
    locations: locationNames,
    onUnknownCues: (cues) => setUnknownCues(cues),
    onFind: () => setFindOpen(true),
    onSaveVersion: () => setDialog('saveVersion'),
  });

  // Page breaks, numbering and stats follow the text with a short lag so typing stays instant.
  const deferred = useDeferredValue(editor.elements);
  const pageSize = editorSettings.pageSize;
  const pagination = useMemo(() => paginate(deferred, { pageSize }), [deferred, pageSize]);
  const breaks = useMemo(() => {
    const m = new Map<string, number>();
    let last = 1;
    for (const el of deferred) {
      const p = pagination.elementPage.get(el.id);
      if (p && p > last) {
        m.set(el.id, p);
        last = p;
      }
    }
    return m;
  }, [deferred, pagination]);
  const numbers = useMemo(() => headingNumbers(deferred), [deferred]);
  const lengths = useMemo(() => sceneLengths(deferred, pageSize), [deferred, pageSize]);
  const outline = useMemo(() => buildOutline(deferred, numbers, lengths), [deferred, numbers, lengths]);
  const stats: Stats = useMemo(() => {
    const has = deferred.some((e) => e.text.trim());
    const pages = has ? pagination.pages.length - 1 + pagination.lastPageLines / pagination.linesPerPage : 0;
    return {
      pages,
      pageCount: has ? pagination.pages.length : 0,
      words: deferred.reduce((n, e) => n + countWords(e.text), 0),
      runtimeSec: Math.round(pages * 60),
      scenes: outline.length,
    };
  }, [deferred, pagination, outline]);

  // The scene the caret is in.
  const currentHeading = useMemo(() => {
    const els = editor.elements;
    const idx = els.findIndex((e) => e.id === editor.focusedId);
    for (let i = idx; i >= 0; i--) if (els[i].type === 'scene' && els[i].text.trim()) return els[i];
    return undefined;
  }, [editor.elements, editor.focusedId]);

  // Deep link: ?scene=<sceneId> scrolls to and focuses that heading.
  const sceneParam = params.get('scene');
  useEffect(() => {
    if (!sceneParam) return;
    const el = editor.elements.find((e) => e.type === 'scene' && e.sceneId === sceneParam);
    if (el) requestAnimationFrame(() => editor.focusElement(el.id, el.text.length, undefined, 'center'));
    else toast.info('That scene isn’t in this draft', 'It may only exist in the breakdown, or in another draft.');
    const next = new URLSearchParams(params);
    next.delete('scene');
    setParams(next, { replace: true });
  }, [sceneParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘F / ⌘S also work when the caret isn't in the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') {
        e.preventDefault();
        setFindOpen(true);
      } else if (k === 's') {
        e.preventDefault();
        setDialog('saveVersion');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const switchDraft = useCallback(
    async (id: string) => {
      await editor.flush();
      const next = new URLSearchParams(params);
      next.set('draft', id);
      next.delete('scene');
      setParams(next);
    },
    [editor, params, setParams],
  );

  const sceneNumbersById = () => {
    const m = new Map<string, string>();
    for (const el of editor.elements) if (el.type === 'scene' && el.sceneId && numbers.get(el.id)) m.set(el.sceneId, numbers.get(el.id)!);
    return m;
  };

  const run = (fn: () => Promise<unknown>, failure: string) => () => void fn().catch((e) => toastError(e, failure));

  const actions: ToolbarActions = {
    switchDraft: (id) => void switchDraft(id),
    newDraft: () => setDialog('newDraft'),
    duplicate: run(async () => {
      await editor.flush();
      const copy = await createDraft(project.id, { fromScriptId: script.id });
      toast(`Duplicated as “${copy.title}”`, { detail: 'Make big changes here — the original stays untouched.' });
      await switchDraft(copy.id);
    }, 'Couldn’t duplicate the draft'),
    draftSettings: () => setDialog('draftSettings'),
    makePrimary: run(async () => {
      const ok = await confirm({
        title: `Use “${script.title}” as the production draft?`,
        message: 'The scene breakdown, storyboards, shot lists and schedules follow the production draft. Scenes that aren’t in this draft stay in the breakdown, marked “not in script” — nothing is deleted.',
        confirmLabel: 'Use this draft',
      });
      if (!ok) return;
      await editor.flush();
      await setPrimaryDraft(project.id, script.id);
      toast('Production draft updated', { detail: 'The scene list now follows this draft.' });
    }, 'Couldn’t change the production draft'),
    deleteDraft: run(async () => {
      const ok = await confirm({
        title: `Delete “${script.title}”?`,
        message: isPrimary
          ? 'This is the production draft. Another draft will take its place and the scene list will follow it. You can undo right after.'
          : 'The draft and its version history will be deleted. You can undo right after.',
        confirmLabel: 'Delete draft',
        danger: true,
      });
      if (!ok) return;
      await editor.flush();
      const restore = await deleteDraft(script.id);
      toastUndo(`Deleted “${script.title}”`, restore);
      const next = new URLSearchParams(params);
      next.delete('draft');
      setParams(next);
    }, 'Couldn’t delete the draft'),
    find: () => setFindOpen(true),
    versions: () => {
      void editor.flush();
      setVersionsOpen(true);
    },
    saveVersion: () => setDialog('saveVersion'),
    importFile: () => setDialog('import'),
    exportPdf: () => setDialog('exportPdf'),
    exportFountain: () => {
      downloadText(toFountain(editor.elements, script.titlePage), `${slug(project.title)}-${slug(script.title)}.fountain`);
      toast('Fountain file downloaded');
    },
    exportFdx: () => {
      downloadText(toFdx(editor.elements, script.titlePage), `${slug(project.title)}-${slug(script.title)}.fdx`, 'application/xml');
      toast('Final Draft file downloaded');
    },
    titlePage: () => setDialog('titlePage'),
    shortcuts: () => setDialog('shortcuts'),
    setPaper: (p) => void updateSettings({ editor: { ...editorSettings, paper: p } }),
    toggleNumbers: () => void updateSettings({ editor: { ...editorSettings, showSceneNumbers: !editorSettings.showSceneNumbers } }),
    setPageSize: (s) => void updateSettings({ editor: { ...editorSettings, pageSize: s } }),
    toggleFocus: () => setFocusMode((f) => !f),
    toggleContext: () =>
      setContextOpen((o) => {
        try {
          localStorage.setItem('sceneforge:script-context', o ? '0' : '1');
        } catch {
          /* ignore */
        }
        return !o;
      }),
    openOutline: () => setMobilePanel('outline'),
    openContext: () => setMobilePanel('context'),
  };

  const jump = (headingId: string) => {
    const el = editor.elements.find((e) => e.id === headingId);
    editor.focusElement(headingId, el?.text.length ?? 0, undefined, 'start');
    setMobilePanel(null);
  };

  const onAsk = (sceneId: string, label: string) => {
    setMobilePanel(null);
    openAssistant({ type: 'scene', id: sceneId, label });
  };

  const onImport = async (c: ImportChoice) => {
    if (c.mode === 'replace') {
      await editor.flush();
      await saveVersion(script.id, 'Before import');
      editor.replaceAll(c.elements);
      if (c.titlePage) await updateRecord<Script>('scripts', script.id, { titlePage: { ...script.titlePage, ...c.titlePage } }, { summary: 'Imported title page' });
      toast('Screenplay imported', { detail: 'The previous text is saved in version history, and ⌘Z undoes the import.' });
    } else {
      await editor.flush();
      const draft = await createDraft(project.id, { title: c.name });
      await saveScript(draft.id, c.elements, { summary: `Imported “${c.name}”` });
      if (c.titlePage) await updateRecord<Script>('scripts', draft.id, { titlePage: { ...draft.titlePage, ...c.titlePage } }, { silent: true });
      toast(`Imported as “${c.name}”`, { detail: 'It’s a separate draft. Make it the production draft from the draft menu when ready.' });
      await switchDraft(draft.id);
    }
  };

  const onRestore = async (versionId: string) => {
    await editor.flush();
    const res = await restoreVersion(versionId);
    editor.expect(res.elements);
    editor.replaceAll(res.elements, { markDirty: false });
    toast('Version restored', { detail: 'Your previous text was kept as a version.' });
  };

  const createProfiles = async (cues: string[]) => {
    try {
      for (const cue of cues) await createRecord('characters', makeCharacter(project.id, { name: titleCase(cue) }));
      await syncScenes(project.id, editor.elements);
      setUnknownCues([]);
      toast(`Created ${cues.length} character ${cues.length === 1 ? 'profile' : 'profiles'}`, { detail: 'They’re linked to every scene where they speak.' });
    } catch (e) {
      toastError(e, 'Couldn’t create profiles');
    }
  };

  const visibleCues = isPrimary ? unknownCues.filter((c) => !dismissedCues.includes(c)) : [];
  const currentSceneId = currentHeading?.sceneId;
  const contextProps = {
    projectId: project.id,
    sceneId: currentSceneId,
    heading: currentHeading?.text,
    number: currentHeading ? numbers.get(currentHeading.id) : undefined,
    isPrimary,
    onAsk,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!focusMode ? (
        <Toolbar
          scripts={scripts}
          script={script}
          primaryId={project.primaryScriptId}
          editor={editor}
          stats={stats}
          settings={editorSettings}
          focusMode={focusMode}
          contextOpen={contextOpen}
          actions={actions}
        />
      ) : null}
      <ElementBar editor={editor} />

      {editor.conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/40 bg-warning-soft px-4 py-2.5 text-[12.5px]">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-ink">
            This draft was changed somewhere else (another tab, the scene manager or the assistant) while you had unsaved edits. Autosave is paused until you choose.
          </span>
          <Button size="sm" variant="secondary" onClick={() => void editor.resolveConflict('theirs').catch((e) => toastError(e))}>
            Load other version
          </Button>
          <Button size="sm" variant="primary" onClick={() => void editor.resolveConflict('mine').catch((e) => toastError(e))}>
            Keep my edits
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!focusMode && (
          <aside className="hidden w-60 shrink-0 border-r border-line bg-panel lg:flex">
            <SceneNavigator outline={outline} currentId={currentHeading?.id} onJump={jump} className="w-full" stats={statsLine(stats)} />
          </aside>
        )}

        <div className="relative min-w-0 flex-1">
          {findOpen && <FindBar editor={editor} onClose={() => setFindOpen(false)} onHighlights={setHighlights} />}
          {focusMode && (
            <div className="absolute right-3 top-3 z-20 hidden md:block">
              <IconButton label="Exit focus mode" onClick={() => setFocusMode(false)} className="bg-panel/80 backdrop-blur">
                <Minimize2 className="size-4" />
              </IconButton>
            </div>
          )}
          <Editor
            editor={editor}
            paper={editorSettings.paper}
            showSceneNumbers={editorSettings.showSceneNumbers}
            numbers={numbers}
            breaks={breaks}
            highlights={highlights}
            scrollRef={scrollRef}
          />
          {visibleCues.length > 0 && (
            <div className="absolute inset-x-3 bottom-3 z-20 mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line-strong bg-raised px-3.5 py-2.5 shadow-pop animate-rise sm:bottom-4">
              <UserPlus className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 text-[12.5px] text-muted">
                {visibleCues.length === 1 ? '1 speaking character doesn’t' : `${visibleCues.length} speaking characters don’t`} have a profile yet:{' '}
                <span className="font-mono text-[11.5px] text-ink">{visibleCues.slice(0, 4).join(', ')}{visibleCues.length > 4 ? '…' : ''}</span>
              </span>
              <Button size="sm" variant="primary" onClick={() => void createProfiles(visibleCues)}>
                Create profiles
              </Button>
              <IconButton label="Not now" size="sm" onClick={() => setDismissedCues((d) => [...d, ...visibleCues])}>
                <X className="size-3.5" />
              </IconButton>
            </div>
          )}
        </div>

        {!focusMode && contextOpen && (
          <aside className="hidden w-80 shrink-0 border-l border-line bg-panel lg:block">
            <ContextPanel {...contextProps} onClose={actions.toggleContext} />
          </aside>
        )}
      </div>

      <Sheet open={mobilePanel === 'outline'} onOpenChange={(o) => !o && setMobilePanel(null)} title="Scenes" description={statsLine(stats)}>
        <SceneNavigator outline={outline} currentId={currentHeading?.id} onJump={jump} className="-mx-5 -mt-4" />
      </Sheet>
      <Sheet open={mobilePanel === 'context'} onOpenChange={(o) => !o && setMobilePanel(null)} title={currentHeading?.text || 'Current scene'}>
        <div className="-mx-5 -my-5">
          <ContextPanel {...contextProps} />
        </div>
      </Sheet>

      <VersionHistory
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        script={script}
        current={editor.elements}
        paper={editorSettings.paper}
        onRestore={onRestore}
        onSaveVersion={() => setDialog('saveVersion')}
      />

      <NameDialog
        open={dialog === 'newDraft'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="New blank draft"
        description="Starts from an empty page. To build on the current text, use “Duplicate this draft” instead."
        confirmLabel="Create draft"
        onSubmit={async (name) => {
          await editor.flush();
          const d = await createDraft(project.id, { title: name });
          await switchDraft(d.id);
        }}
      />
      <DraftSettingsDialog
        open={dialog === 'draftSettings'}
        onOpenChange={(o) => !o && setDialog(null)}
        name={script.title}
        color={script.revisionColor}
        onSubmit={async (name, color: RevisionColor) => {
          if (name !== script.title) await renameDraft(script.id, name);
          if (color !== script.revisionColor) await updateRecord<Script>('scripts', script.id, { revisionColor: color }, { summary: `Marked “${name}” as a ${color} revision` });
          toast('Draft updated');
        }}
      />
      <SaveVersionDialog
        open={dialog === 'saveVersion'}
        onOpenChange={(o) => !o && setDialog(null)}
        color={script.revisionColor}
        onSubmit={async (label, color) => {
          await editor.flush();
          await saveVersion(script.id, label, color);
          toast(`Saved version “${label}”`, { detail: 'Find it in version history.' });
        }}
      />
      <TitlePageDialog
        open={dialog === 'titlePage'}
        onOpenChange={(o) => !o && setDialog(null)}
        value={script.titlePage}
        onSubmit={async (tp: TitlePage) => {
          await updateRecord<Script>('scripts', script.id, { titlePage: tp }, { summary: `Edited the title page of “${script.title}”` });
          toast('Title page saved');
        }}
      />
      <ExportPdfDialog
        open={dialog === 'exportPdf'}
        onOpenChange={(o) => !o && setDialog(null)}
        defaults={{ includeTitlePage: true, showSceneNumbers: editorSettings.showSceneNumbers, pageSize: editorSettings.pageSize } satisfies PdfOptions}
        onExport={async (o) => {
          try {
            exportScreenplayPdf({ script: { ...script, elements: editor.elements }, project, pageSize: o.pageSize, sceneNumbers: sceneNumbersById(), showSceneNumbers: o.showSceneNumbers, includeTitlePage: o.includeTitlePage });
            toast('PDF downloaded');
          } catch (e) {
            toastError(e, 'PDF export failed');
          }
        }}
      />
      <ImportDialog open={dialog === 'import'} onOpenChange={(o) => !o && setDialog(null)} onImport={onImport} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onOpenChange={(o) => !o && setDialog(null)} />
    </div>
  );
}
