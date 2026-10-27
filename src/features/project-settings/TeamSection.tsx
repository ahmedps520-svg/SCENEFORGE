import { ArrowUpRight, Info, Plus, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Badge, Button, Dialog, Field, Input, Section, Select, Switch, toast, toastError } from '@/components/ui';
import { ACCESS_ROLES, CREW_ROLES } from '@/lib/constants';
import { exportProject } from '@/lib/data/backup';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makePerson } from '@/lib/data/factories';
import { downloadBlob } from '@/lib/download';
import type { AccessRole, Person, Project } from '@/lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TeamSection({ project, people }: { project: Project; people: Person[] }) {
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const members = people.filter((p) => p.accessRole);
  const others = people.filter((p) => !p.accessRole);
  const owners = members.filter((p) => p.accessRole === 'owner');

  const setRole = async (p: Person, role: AccessRole | '') => {
    if (p.accessRole === 'owner' && role !== 'owner' && owners.length <= 1) {
      toastError(new Error('Make someone else the owner first.'), 'A project needs an owner');
      return;
    }
    try {
      await updateRecord<Person>('people', p.id, { accessRole: role || undefined }, { summary: role ? `Set ${p.name}’s access to ${role}` : `Removed ${p.name}’s project access` });
    } catch (e) {
      toastError(e, 'Couldn’t change access');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex gap-3 rounded-md border border-line bg-surface px-4 py-3.5 text-[13px] leading-relaxed">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <div className="space-y-1.5 text-muted">
          <p className="text-ink">This project lives on this device (single-user mode).</p>
          <p>
            Roles record who is meant to own, edit, comment on or view the project, and they’re used for assignments and credits. Sending invitations and syncing changes live between devices needs a SCENEFORGE sync service, which isn’t configured in this build — so nobody gets access automatically.
          </p>
          <p>To collaborate today, share the project file: your collaborator imports it into their own SCENEFORGE, and you exchange updated files as work progresses.</p>
          <div className="pt-1">
            <Button size="sm" variant="secondary" icon={<Share2 className="size-3.5" />} onClick={() => setSharing(true)}>
              Share project file
            </Button>
          </div>
        </div>
      </div>

      <Section
        title={`Team access · ${members.length}`}
        actions={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
            Add team member
          </Button>
        }
      >
        {members.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-faint">No one has a project role yet. Add yourself and your collaborators to keep ownership clear.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {members.map((p) => (
              <MemberRow key={p.id} person={p} projectId={project.id} onRole={(r) => void setRole(p, r)} />
            ))}
          </ul>
        )}
        {others.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[12px] text-faint">Cast &amp; crew without a project role — give them one to record their access:</p>
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
              {others.map((p) => (
                <MemberRow key={p.id} person={p} projectId={project.id} onRole={(r) => void setRole(p, r)} />
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="What each role means">
        <dl className="grid gap-3 sm:grid-cols-2">
          {ACCESS_ROLES.map((r) => (
            <div key={r.value} className="rounded-md border border-line px-3 py-2.5">
              <dt className="text-[13px] text-ink">{r.label}</dt>
              <dd className="text-[12.5px] text-muted">{r.hint}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <AddMemberDialog open={adding} onOpenChange={setAdding} projectId={project.id} />
      <ShareDialog open={sharing} onOpenChange={setSharing} project={project} />
    </div>
  );
}

function MemberRow({ person, projectId, onRole }: { person: Person; projectId: string; onRole: (r: AccessRole | '') => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <Avatar name={person.name} assetId={person.photoAssetId} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/p/${projectId}/people?person=${person.id}`} className="truncate text-[13.5px] text-ink hover:text-accent">
            {person.name || 'Unnamed'}
          </Link>
          {person.isYou && <Badge tone="accent">You · this device</Badge>}
        </div>
        <p className="truncate text-[12px] text-faint">{[person.roles.join(', '), person.email].filter(Boolean).join(' · ') || 'No role or email yet'}</p>
      </div>
      <Select value={person.accessRole ?? ''} onChange={(e) => onRole(e.target.value as AccessRole | '')} className="h-8 w-auto text-[12.5px]" aria-label={`Project access for ${person.name}`}>
        <option value="">No project role</option>
        {ACCESS_ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Link to={`/p/${projectId}/people?person=${person.id}`} className="btn-icon" aria-label={`Open ${person.name}’s profile`} title="Open profile">
        <ArrowUpRight className="size-4" />
      </Link>
    </li>
  );
}

function AddMemberDialog({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<AccessRole>('editor');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setRole('');
      setEmail('');
      setAccess('editor');
      setErrors({});
    }
  }, [open]);

  const submit = async () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Enter a name.';
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = 'That doesn’t look like an email address.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await createRecord('people', makePerson(projectId, { name: name.trim(), roles: role.trim() ? [role.trim()] : [], email: email.trim(), accessRole: access }));
      toast(`${name.trim()} added to the team`);
      onOpenChange(false);
    } catch (err) {
      toastError(err, 'Couldn’t add team member');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add team member"
      description="Records them on the project with a role. They won’t receive an invitation — this build has no sync service."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Add to team
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Name" error={errors.name} className="sm:col-span-2">
          <Input autoFocus value={name} invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Production role" optional>
          <Input value={role} onChange={(e) => setRole(e.target.value)} list="crew-roles" placeholder="e.g. Producer" />
          <datalist id="crew-roles">
            {CREW_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Project access">
          <Select value={access} onChange={(e) => setAccess(e.target.value as AccessRole)}>
            {ACCESS_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email" optional error={errors.email} hint="Kept private; removed from shared project files." className="sm:col-span-2">
          <Input type="email" value={email} invalid={!!errors.email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

export function ShareDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: Project }) {
  const [stripPrivate, setStripPrivate] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await exportProject(project.id, { stripPrivate, skipFiles: !includeFiles });
      downloadBlob(blob, filename);
      toast('Project file ready', { detail: `${filename} · ${(blob.size / 1024 / 1024).toFixed(1)} MB` });
      onOpenChange(false);
    } catch (e) {
      toastError(e, 'Couldn’t create the project file');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share project file"
      description="Creates a .sceneforge file you can send. The recipient imports it as their own copy; it never overwrites their work."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void go()}>
            Create file
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Switch checked={stripPrivate} onChange={setStripPrivate} label="Remove private information" description="Phone numbers, emails, location contacts, emergency contacts, safety notes and assistant conversations." />
        <Switch checked={includeFiles} onChange={setIncludeFiles} label="Include uploaded files" description="Images, audio, video and documents. Turn off for a much smaller file." />
      </div>
    </Dialog>
  );
}
