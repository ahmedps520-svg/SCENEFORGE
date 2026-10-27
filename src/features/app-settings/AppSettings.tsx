import { AlertTriangle, ArchiveRestore, CheckCircle2, Download, Eye, EyeOff, HardDrive, Loader2, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { AutoText, Button, cn, Field, Input, Segmented, Select, Switch, toast, toastError, useAutosave, useConfirm } from '@/components/ui';
import { AI_MODELS } from '@/lib/constants';
import { formatBytes } from '@/lib/data/assets';
import { downloadBlob, exportProject } from '@/lib/data/backup';
import { updateSettings, useSettings } from '@/lib/data/settings';
import { db, requestPersistentStorage, storageEstimate } from '@/lib/db';
import { useProjects } from '@/lib/hooks';
import type { AppSettings as Settings, ThemePref } from '@/lib/types';
import { StudioBar, useRestoreBackup } from '../dashboard/StudioBar';
import { testConnection, type ConnectionResult } from './testConnection';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'editor', label: 'Script editor' },
  { id: 'assistant', label: 'AI assistant' },
  { id: 'data', label: 'Data & storage' },
  { id: 'about', label: 'About' },
];

export default function AppSettings() {
  const settings = useSettings();
  useEffect(() => {
    document.title = 'Settings — SCENEFORGE';
  }, []);
  return (
    <div className="min-h-dvh pb-24">
      <StudioBar back={{ to: '/', label: 'Studio' }} title="Settings" />
      <main className="mx-auto grid max-w-[1120px] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:px-10 lg:py-12">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-0.5" aria-label="Settings sections">
            <div className="eyebrow mb-3">Settings</div>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }} className="block rounded-sm px-2 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-ink">
                {s.label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <h1 className="display text-[40px] text-ink">Settings</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">Preferences for this browser. Project-specific details live in each project’s own Settings.</p>
          {!settings ? (
            <div className="py-16 text-center">
              <Loader2 className="mx-auto size-5 animate-spin text-muted" />
            </div>
          ) : (
            <div className="mt-8">
              <Profile settings={settings} />
              <Appearance settings={settings} />
              <Editor settings={settings} />
              <Assistant settings={settings} />
              <DataStorage />
              <About />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Block({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 grid gap-5 border-t border-line py-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="display text-[24px] text-ink">{title}</h2>
        {description && <p className="mt-1.5 text-[12.5px] leading-relaxed text-faint">{description}</p>}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

function Profile({ settings }: { settings: Settings }) {
  return (
    <Block id="profile" title="Profile" description="How you appear in comments, activity history and credits on this device.">
      <AutoText label="Your name" value={settings.userName} onSave={async (v) => {
          await updateSettings({ userName: v.trim() });
        }} placeholder="Your name" maxLength={60} hint="Saved automatically." />
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await updateSettings({ dismissedTips: [] });
            toast('Tips will show again');
          }}
          disabled={!settings.dismissedTips.length}
        >
          Show dismissed tips again{settings.dismissedTips.length ? ` (${settings.dismissedTips.length})` : ''}
        </Button>
      </div>
    </Block>
  );
}

function Appearance({ settings }: { settings: Settings }) {
  return (
    <Block id="appearance" title="Appearance" description="Dark mode is the default — easier on the eyes in a dark edit suite.">
      <Field label="Theme">
        <Segmented<ThemePref>
          label="Theme"
          value={settings.theme}
          onChange={(v) => void updateSettings({ theme: v })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'Match system' },
          ]}
        />
      </Field>
    </Block>
  );
}

function Editor({ settings }: { settings: Settings }) {
  const e = settings.editor;
  return (
    <Block id="editor" title="Script editor" description="Defaults for the screenplay editor and its PDF export.">
      <Field label="Page colour" hint="The editor page. PDFs are always black on white.">
        <Segmented
          label="Page colour"
          value={e.paper}
          onChange={(v) => void updateSettings({ editor: { ...e, paper: v } })}
          options={[
            { value: 'dark', label: 'Dark page' },
            { value: 'light', label: 'White page' },
          ]}
        />
      </Field>
      <Field label="Page size" hint="Changes page counts and runtime estimates slightly: A4 holds a few more lines.">
        <Segmented
          label="Page size"
          value={e.pageSize}
          onChange={(v) => void updateSettings({ editor: { ...e, pageSize: v } })}
          options={[
            { value: 'letter', label: 'US Letter' },
            { value: 'a4', label: 'A4' },
          ]}
        />
      </Field>
      <Switch checked={e.showSceneNumbers} onChange={(v) => void updateSettings({ editor: { ...e, showSceneNumbers: v } })} label="Show scene numbers" description="In the editor margin and in exported PDFs." />
    </Block>
  );
}

function Assistant({ settings }: { settings: Settings }) {
  const ai = settings.ai;
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const key = useAutosave(
    ai.apiKey,
    async (v: string) => {
      await updateSettings({ ai: { ...settings.ai, apiKey: v.trim() } });
    },
    400,
  );
  const looksWrong = key.value.trim() && !key.value.trim().startsWith('sk-ant-');

  const run = async () => {
    key.flush();
    setTesting(true);
    setResult(null);
    try {
      setResult(await testConnection(key.value, ai.model));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Block
      id="assistant"
      title="AI assistant"
      description={
        <>
          Optional. Uses your own Anthropic API key. Every core tool works without it, and the assistant only ever <em>suggests</em> — nothing in a project changes until you approve it.
        </>
      }
    >
      <Switch
        checked={ai.enabled}
        onChange={(v) => void updateSettings({ ai: { ...ai, enabled: v } })}
        label="Enable the assistant in projects"
        description={ai.enabled && !ai.apiKey ? 'Add an API key below to start using it.' : 'Shows the Assistant panel in each project workspace.'}
      />
      <Field
        label="Anthropic API key"
        htmlFor="ai-key"
        hint={
          <>
            Stored only in this browser and sent only to api.anthropic.com, directly from this device. Usage is billed to your Anthropic account. Create a key at{' '}
            <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>
            .
          </>
        }
        error={looksWrong ? 'Anthropic API keys start with “sk-ant-”. Check that you pasted the whole key.' : null}
      >
        <div className="flex gap-2">
          <Input
            id="ai-key"
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={key.value}
            onChange={(e) => {
              key.change(e.target.value);
              setResult(null);
            }}
            onBlur={key.flush}
            placeholder="sk-ant-…"
            className="font-mono text-[12.5px]"
          />
          <Button variant="secondary" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide key' : 'Show key'} title={show ? 'Hide key' : 'Show key'}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          {key.value && (
            <Button
              variant="danger-ghost"
              onClick={() => {
                key.change('');
                key.flush();
                setResult(null);
              }}
              aria-label="Remove key"
              title="Remove key"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </Field>
      <Field label="Model" htmlFor="ai-model" hint={AI_MODELS.find((m) => m.value === ai.model)?.hint}>
        <Select id="ai-model" value={ai.model} onChange={(e) => {
          void updateSettings({ ai: { ...ai, model: e.target.value } });
          setResult(null);
        }} className="max-w-xs">
          {AI_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} loading={testing} disabled={!key.value.trim()}>
          Test connection
        </Button>
        {result && (
          <span role="status" className={cn('flex items-start gap-1.5 text-[12.5px]', result.ok ? 'text-success' : 'text-danger')}>
            {result.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <XCircle className="mt-0.5 size-3.5 shrink-0" />}
            {result.ok ? `Connected — ${result.model} responded.` : result.message}
          </span>
        )}
      </div>
      <p className="text-[12px] text-faint">The test sends one very short message (a few tokens) to check the key and model.</p>
    </Block>
  );
}

function DataStorage() {
  const projects = useProjects();
  const confirm = useConfirm();
  const restore = useRestoreBackup();
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const refresh = async () => {
    setUsage(await storageEstimate());
    try {
      setPersisted(navigator.storage?.persisted ? await navigator.storage.persisted() : null);
    } catch {
      setPersisted(null);
    }
  };
  useEffect(() => {
    void refresh();
  }, [projects?.length]);

  const exportAll = async () => {
    if (!projects?.length) return;
    try {
      for (let i = 0; i < projects.length; i++) {
        setExporting(`${i + 1} of ${projects.length}`);
        const { blob, filename } = await exportProject(projects[i].id);
        downloadBlob(blob, filename);
        // Give the browser a moment between downloads so none are dropped.
        await new Promise((r) => setTimeout(r, 450));
      }
      toast(`Exported ${projects.length} backup${projects.length === 1 ? '' : 's'}`, { detail: 'One .sceneforge file per film. Restore any of them from the studio’s Import menu.' });
    } catch (e) {
      toastError(e, 'Export stopped');
    } finally {
      setExporting(null);
    }
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'Delete all SCENEFORGE data?',
      message: `This permanently removes ${projects?.length ?? 0} film${projects?.length === 1 ? '' : 's'}, every uploaded file and your settings from this browser. It cannot be undone. Export backups first if you might want anything back.`,
      confirmLabel: 'Delete everything',
      danger: true,
      typeToConfirm: 'DELETE',
    });
    if (!ok) return;
    try {
      await db.delete();
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('sceneforge:')) localStorage.removeItem(k);
      } catch {
        /* storage unavailable */
      }
      window.location.hash = '#/';
      window.location.reload();
    } catch (e) {
      toastError(e, 'Couldn’t delete the data');
    }
  };

  const pct = usage && usage.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;

  return (
    <Block id="data" title="Data & storage" description="Everything is stored in this browser’s private storage (IndexedDB) on this device. Clearing site data in the browser erases it, so keep backups.">
      <div className="rounded-md border border-line p-4">
        <div className="flex items-center gap-2 text-[13px] text-ink">
          <HardDrive className="size-4 text-accent" />
          {usage ? `${formatBytes(usage.usage)} used` : 'Storage usage unavailable in this browser'}
          {usage?.quota ? <span className="text-faint">of about {formatBytes(usage.quota)} available</span> : null}
        </div>
        {usage?.quota ? (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--c-ink)_9%,transparent)]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 0.6)}%` }} />
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[12.5px]">
          {persisted === true && (
            <span className="flex items-center gap-1.5 text-success">
              <ShieldCheck className="size-3.5" /> Protected — the browser won’t clear it to free space
            </span>
          )}
          {persisted === false && (
            <>
              <span className="flex items-center gap-1.5 text-warning">
                <AlertTriangle className="size-3.5" /> The browser may clear this data if the device runs low on space
              </span>
              <Button
                size="sm"
                onClick={async () => {
                  const ok = await requestPersistentStorage();
                  await refresh();
                  if (ok) toast('Storage is now protected');
                  else toast.info('The browser declined', 'Browsers usually grant this after you’ve used the app for a while, or bookmarked or installed it. Keep backups meanwhile.');
                }}
              >
                Ask to keep my data
              </Button>
            </>
          )}
          {persisted === null && <span className="text-faint">This browser doesn’t report whether storage is protected.</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button icon={<Download className="size-4" />} onClick={() => void exportAll()} loading={!!exporting} disabled={!projects?.length}>
          {exporting ? `Exporting ${exporting}…` : `Export all films${projects?.length ? ` (${projects.length})` : ''}`}
        </Button>
        <Button icon={<ArchiveRestore className="size-4" />} onClick={restore.open} loading={restore.busy}>
          Restore a backup
        </Button>
      </div>
      <p className="text-[12px] leading-relaxed text-faint">Backups (.sceneforge) include scripts, versions, breakdowns, schedules and uploaded files. Restoring always adds a new copy and never overwrites a film.</p>

      <div className="rounded-md border border-[color-mix(in_srgb,var(--c-danger)_35%,transparent)] p-4">
        <div className="text-[13px] font-medium text-danger">Danger zone</div>
        <p className="mt-1 text-[12.5px] text-muted">Remove every film, file and setting from this browser.</p>
        <Button variant="danger-ghost" size="sm" className="mt-3" icon={<Trash2 className="size-3.5" />} onClick={() => void wipe()}>
          Delete all data
        </Button>
      </div>
      {restore.element}
    </Block>
  );
}

function About() {
  const rows: { label: string; status: 'local' | 'external' | 'unavailable'; detail: string }[] = [
    { label: 'Screenplay, scenes, storyboards, shot lists, characters, locations, cast & crew, schedules, tasks', status: 'local', detail: 'Fully available. Saved automatically on this device.' },
    { label: 'Uploaded files (images, video, audio, documents)', status: 'local', detail: 'Stored in this browser’s storage, not in temporary memory.' },
    { label: 'PDF, Fountain and Final Draft export · project backups', status: 'local', detail: 'Generated on this device.' },
    { label: 'AI filmmaking assistant', status: 'external', detail: 'Needs your Anthropic API key. Requests go from this browser to api.anthropic.com.' },
    { label: 'Live collaboration and sync between devices', status: 'unavailable', detail: 'Not available in this build. Share projects with backup files; team roles and comments are kept locally.' },
    { label: 'Generated concept art', status: 'unavailable', detail: 'Not available in this build — no image-generation service is connected. Upload or sketch frames instead.' },
  ];
  const tone = { local: 'text-success', external: 'text-info', unavailable: 'text-faint' };
  const word = { local: 'On this device', external: 'External service', unavailable: 'Not available' };
  return (
    <Block id="about" title="About" description="SCENEFORGE is a personal film production studio. What runs where:">
      <ul className="divide-y divide-line rounded-md border border-line">
        {rows.map((r) => (
          <li key={r.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_130px] sm:gap-4">
            <div>
              <div className="text-[13px] text-ink">{r.label}</div>
              <div className="text-[12px] text-faint">{r.detail}</div>
            </div>
            <div className={cn('font-mono text-[10.5px] tracking-[0.12em] uppercase sm:text-right', tone[r.status])}>{word[r.status]}</div>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[11px] text-faint">SCENEFORGE · version 1.0</p>
    </Block>
  );
}
