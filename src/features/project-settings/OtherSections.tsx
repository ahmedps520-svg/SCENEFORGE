import { AlertTriangle, CheckCircle2, Download, KeyRound, Plus, Search, Trash2, Upload, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AutoText, Badge, Button, Input, Section, Select, Switch, toast, toastError, toastUndo, useAutosave, useConfirm } from '@/components/ui';
import { format } from 'date-fns';
import { exportProject, importProjectFile } from '@/lib/data/backup';
import { ENTITY_NOUN } from '@/lib/data/crud';
import { deleteProject } from '@/lib/data/deletes';
import { newEmergencyContact, updateProject } from '@/lib/data/projects';
import { downloadBlob } from '@/lib/download';
import { useActivity } from '@/lib/hooks';
import type { Activity, EmergencyContact, EntityType, Project } from '@/lib/types';

// ─── Emergency & safety ─────────────────────────────────────────────────────

export function SafetySection({ project }: { project: Project }) {
  const { value: contacts, change, flush } = useAutosave<EmergencyContact[]>(project.emergencyContacts, (v) =>
    updateProject(project.id, { emergencyContacts: v }, 'Updated emergency contacts').catch((e) => toastError(e, 'Contacts not saved')),
  );
  const setField = (id: string, k: keyof EmergencyContact, v: string) => change(contacts.map((c) => (c.id === id ? { ...c, [k]: v } : c)));

  return (
    <div className="space-y-8">
      <Section title="Emergency contacts" description="Printed on every call sheet. Kept private: removed from shared project files when you choose to remove private information.">
        <div className="space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="grid grid-cols-1 gap-2 rounded-md border border-line p-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:border-0 sm:p-0">
              <Input aria-label="Name" value={c.name} placeholder="Name" onChange={(e) => setField(c.id, 'name', e.target.value)} onBlur={flush} />
              <Input aria-label="Role" value={c.role} placeholder="Role, e.g. Set medic" onChange={(e) => setField(c.id, 'role', e.target.value)} onBlur={flush} />
              <Input aria-label="Phone" type="tel" value={c.phone} placeholder="Phone" onChange={(e) => setField(c.id, 'phone', e.target.value)} onBlur={flush} />
              <Button variant="ghost" aria-label={`Remove ${c.name || 'contact'}`} onClick={() => change(contacts.filter((x) => x.id !== c.id))} icon={<Trash2 className="size-4" />} />
            </div>
          ))}
          {!contacts.length && <p className="text-[13px] text-faint">No emergency contacts yet. Add your producer, a set medic or the location manager.</p>}
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => change([...contacts, newEmergencyContact()])}>
            Add contact
          </Button>
        </div>
      </Section>
      <Section title="Safety information">
        <AutoText
          multiline
          rows={5}
          value={project.safetyNotes}
          placeholder="Nearest hospital and its address, where the first-aid kit lives, the safety officer, any hazards on location…"
          onSave={(v) => updateProject(project.id, { safetyNotes: v }, 'Updated safety information')}
          hint="Appears on call sheets under the emergency contacts."
        />
      </Section>
    </div>
  );
}

// ─── Activity history ───────────────────────────────────────────────────────

const ACTION_TONE: Record<Activity['action'], 'neutral' | 'success' | 'danger' | 'info' | 'accent'> = {
  created: 'success',
  updated: 'neutral',
  deleted: 'danger',
  restored: 'info',
  imported: 'info',
  applied: 'accent',
};

export function ActivitySection({ project }: { project: Project }) {
  const [limit, setLimit] = useState(200);
  const activity = useActivity(project.id, limit);
  const [type, setType] = useState<'all' | EntityType>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (activity ?? []).filter((a) => (type === 'all' || a.entityType === type) && (!s || `${a.summary} ${a.actor}`.toLowerCase().includes(s)));
  }, [activity, type, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of rows) {
      const k = format(a.at, 'yyyy-MM-dd');
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <Section title="Activity history" description="A record of every change made to this project on this device — the project’s change log.">
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search history" className="h-8 pl-8 text-[12.5px]" aria-label="Search history" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value as 'all' | EntityType)} className="h-8 w-auto text-[12.5px]" aria-label="Filter by type">
          <option value="all">Everything</option>
          {(Object.keys(ENTITY_NOUN) as EntityType[]).map((t) => (
            <option key={t} value={t}>
              {ENTITY_NOUN[t].replace(/^./, (c) => c.toUpperCase())}s
            </option>
          ))}
        </Select>
      </div>
      {!activity ? (
        <p className="text-[13px] text-faint">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-[13px] text-faint">{activity.length ? 'Nothing matches.' : 'No activity yet.'}</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div className="eyebrow mb-2">{format(new Date(day + 'T00:00'), 'EEEE d MMMM yyyy')}</div>
              <ol className="relative space-y-0 border-l border-line pl-4">
                {items.map((a) => (
                  <li key={a.id} className="relative py-1.5">
                    <span className="absolute -left-[21px] top-3 size-2 rounded-full border border-line-strong bg-panel" />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
                      <span className="font-mono text-[11px] text-faint">{format(a.at, 'HH:mm')}</span>
                      <Badge tone={ACTION_TONE[a.action]}>{a.action}</Badge>
                      <span className="min-w-0 text-ink">{a.summary}</span>
                      <span className="text-[12px] text-faint">· {a.actor}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {activity.length >= limit && (
            <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 300)}>
              Show older activity
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Backup & export ────────────────────────────────────────────────────────

export function BackupSection({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [includeFiles, setIncludeFiles] = useState(true);
  const [stripPrivate, setStripPrivate] = useState(false);
  const [busy, setBusy] = useState<null | 'export' | 'import'>(null);
  const input = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy('export');
    try {
      const { blob, filename } = await exportProject(project.id, { skipFiles: !includeFiles, stripPrivate });
      downloadBlob(blob, filename);
      toast('Backup downloaded', { detail: `${filename} · ${(blob.size / 1024 / 1024).toFixed(1)} MB` });
    } catch (e) {
      toastError(e, 'Backup failed');
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file?: File) => {
    if (!file) return;
    setBusy('import');
    try {
      const p = await importProjectFile(file);
      toast(`Imported “${p.title}”`, { detail: 'Opened as a separate project.' });
      navigate(`/p/${p.id}/overview`);
    } catch (e) {
      toastError(e, 'Import failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <Section title="Export a backup" description="Everything in this project — scripts and versions, scenes, storyboards, shots, characters, locations, schedule, tasks, comments, history and files — in one .sceneforge file.">
        <div className="space-y-4 rounded-md border border-line bg-surface p-4">
          <Switch checked={includeFiles} onChange={setIncludeFiles} label="Include uploaded files" description="Recommended for backups. Turn off for a small file with data only." />
          <Switch checked={stripPrivate} onChange={setStripPrivate} label="Remove private information" description="Use when sending the file to someone else." />
          <Button variant="primary" icon={<Download className="size-4" />} loading={busy === 'export'} onClick={() => void doExport()}>
            Export backup
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-faint">Your work is saved automatically in this browser. Backups protect it if the browser’s data is cleared, and let you move it to another device.</p>
      </Section>
      <Section title="Import a backup" description="Adds the project in a .sceneforge file as a new, separate project. Existing projects are never overwritten.">
        <Button icon={<Upload className="size-4" />} loading={busy === 'import'} onClick={() => input.current?.click()}>
          Choose backup file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".sceneforge,application/zip"
          className="hidden"
          onChange={(e) => {
            void doImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Section>
    </div>
  );
}

// ─── Feature status ─────────────────────────────────────────────────────────

const BUILT_IN = [
  'Screenplay editor with drafts, versions, Fountain/FDX import & export and PDF',
  'Scene breakdown, storyboards, shot lists and on-set mode',
  'Characters, locations, props & wardrobe, cast & crew',
  'Schedule with conflict detection and call sheets',
  'Tasks, asset library, comments and activity history',
  'Presentation mode, progress tracking, backups',
];

export function FeatureStatus({ aiConfigured }: { aiConfigured: boolean }) {
  return (
    <Section title="What’s available" description="So you always know what works on its own, what needs a service of yours, and what isn’t in this build.">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-md border border-line p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] text-ink">
            <CheckCircle2 className="size-4 text-success" /> Built in · works offline
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-muted">
            {BUILT_IN.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-faint">All data is stored in this browser on this device.</p>
        </div>
        <div className="rounded-md border border-line p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] text-ink">
            <KeyRound className="size-4 text-accent" /> Needs your own service
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-muted">
            <li>
              AI filmmaking assistant — uses your Anthropic API key, billed to your account.{' '}
              <Badge tone={aiConfigured ? 'success' : 'neutral'}>{aiConfigured ? 'Set up' : 'Not set up'}</Badge>
            </li>
          </ul>
          <p className="mt-3 text-[11.5px] text-faint">Open the Assistant from the sidebar to set it up. Everything else works without it.</p>
        </div>
        <div className="rounded-md border border-line p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] text-ink">
            <XCircle className="size-4 text-faint" /> Not available in this build
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-muted">
            <li>Live collaboration, invitations and multi-device sync (needs a sync service)</li>
            <li>AI image generation for storyboards and concept art</li>
          </ul>
          <p className="mt-3 text-[11.5px] text-faint">Share project files to collaborate; upload or draw storyboard images.</p>
        </div>
      </div>
    </Section>
  );
}

// ─── Danger zone ────────────────────────────────────────────────────────────

export function DangerZone({ project }: { project: Project }) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Danger zone">
      <div className="flex flex-col gap-3 rounded-md border border-[color-mix(in_srgb,var(--c-danger)_35%,transparent)] p-4 sm:flex-row sm:items-center">
        <AlertTriangle className="size-5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-ink">Delete this project</p>
          <p className="text-[12.5px] text-muted">Removes the film and everything in it — scripts, breakdowns, files and history — from this device. Export a backup first if you might want it back later.</p>
        </div>
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            const ok = await confirm({
              title: `Delete “${project.title}”?`,
              message: 'Everything in this project will be removed from this device. You’ll have a few seconds to undo.',
              confirmLabel: 'Delete project',
              danger: true,
              typeToConfirm: project.title,
            });
            if (!ok) return;
            setBusy(true);
            try {
              const { summary, restore } = await deleteProject(project.id);
              navigate('/');
              toastUndo(summary, restore);
            } catch (e) {
              setBusy(false);
              toastError(e, 'Couldn’t delete the project');
            }
          }}
        >
          Delete project
        </Button>
      </div>
    </Section>
  );
}
