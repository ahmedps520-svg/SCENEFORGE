import { AlertTriangle, ArrowLeft, FileDown, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { Button, EmptyState, Input, Loading, Textarea, toast, toastError } from '@/components/ui';
import { buildScheduleContext, castForScenes, findConflicts } from '@/lib/conflicts';
import { newEmergencyContact, updateProject } from '@/lib/data/projects';
import { formatDate, formatTime } from '@/lib/dates';
import { slug } from '@/lib/download';
import { useProjectData, type ProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import { exportCallSheetPdf, type CallSheetData } from '@/lib/pdf/callsheet';
import { formatEighths } from '@/lib/screenplay/paginate';
import type { EmergencyContact, ScheduleEvent } from '@/lib/types';
import { endTime, eventTitle, filmingDayIndex } from './eventUtils';

/** Assemble a call sheet from saved project data. */
export function buildCallSheet(data: ProjectData, event: ScheduleEvent): CallSheetData {
  const ctx = buildScheduleContext(data);
  const numbers = sceneNumbers(data.scenes);
  const dayIndex = filmingDayIndex(data.events);
  const totalDays = dayIndex.size;
  const charById = new Map(data.characters.map((c) => [c.id, c]));
  const scenes = event.sceneIds.map((id) => ctx.scenes.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const cast = castForScenes(event.sceneIds, ctx);
  const castIds = new Set(cast.map((c) => c.personId));
  const loc = event.locationId ? ctx.locations.get(event.locationId) : scenes.map((s) => (s.locationId ? ctx.locations.get(s.locationId) : undefined)).find(Boolean);
  const eighths = scenes.reduce((n, s) => n + (s.pageEighths || 0), 0);
  const uncast = [...new Set(scenes.flatMap((s) => s.characterIds))].filter((cid) => !charById.get(cid)?.actorId).map((cid) => charById.get(cid)?.name ?? '').filter(Boolean);

  const filming = data.events.filter((e) => e.type === 'filming').sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const next = filming[filming.findIndex((e) => e.id === event.id) + 1];

  return {
    projectTitle: data.project.title,
    eventTitle: eventTitle(event, dayIndex),
    dayLabel: event.type === 'filming' && dayIndex.has(event.id) ? `Day ${dayIndex.get(event.id)} of ${totalDays}` : 'Production day',
    dateLabel: formatDate(event.date, 'EEEE d MMMM yyyy'),
    crewCall: formatTime(event.callTime),
    shootingCall: formatTime(event.startTime),
    wrap: formatTime(endTime(event)),
    location: loc ? { name: loc.name, address: loc.address, access: loc.access, restrictions: loc.restrictions } : undefined,
    scenes: scenes.map((s) => ({
      number: numbers.get(s.id) ?? '',
      heading: [s.intExt, s.locationName].filter(Boolean).join('. ') || s.heading,
      timeOfDay: s.timeOfDay,
      summary: s.summary || s.scriptExcerpt,
      pages: formatEighths(s.pageEighths || 0),
      cast: s.characterIds.map((cid) => charById.get(cid)?.name).filter(Boolean).join(', '),
    })),
    totalPages: formatEighths(eighths),
    cast: cast
      .map((c) => ({ name: ctx.people.get(c.personId)?.name ?? '', characters: c.characterIds.map((id) => charById.get(id)?.name).join(', '), call: formatTime(event.callTime) }))
      .sort((a, b) => a.characters.localeCompare(b.characters)),
    uncast,
    crew: event.personIds
      .filter((id) => !castIds.has(id))
      .map((id) => ctx.people.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ name: p.name, roles: p.roles.join(', ') })),
    equipment: event.equipment,
    notes: event.notes,
    emergency: data.project.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()).map((c) => ({ name: c.name, role: c.role, phone: c.phone })),
    safetyNotes: data.project.safetyNotes,
    nextDay: next
      ? {
          label: `${eventTitle(next, dayIndex)} · ${formatDate(next.date, 'EEE d MMM')}`,
          detail: next.sceneIds.length ? `Scenes ${next.sceneIds.map((id) => numbers.get(id)).filter(Boolean).join(', ')}` : 'No scenes assigned yet',
        }
      : undefined,
  };
}

const PRINT_CSS = `
@media print {
  @page { margin: 12mm; }
  html, body, #root, #root .h-dvh, #root main, #root .overflow-hidden, #root .overflow-y-auto { height: auto !important; max-height: none !important; overflow: visible !important; }
  body * { visibility: hidden; }
  .callsheet-doc, .callsheet-doc * { visibility: visible; }
  .callsheet-doc { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; margin: 0 !important; }
  .no-print { display: none !important; }
}
`;

export default function CallSheetPage() {
  const { eventId } = useParams();
  const { project } = useWorkspace();
  const data = useProjectData(project.id);
  const [editing, setEditing] = useState(false);

  const event = data?.events.find((e) => e.id === eventId);
  const sheet = useMemo(() => (data && event ? buildCallSheet(data, event) : null), [data, event]);
  const conflicts = useMemo(() => (data && event ? findConflicts(data.events, buildScheduleContext(data)).get(event.id) ?? [] : []), [data, event]);

  if (data === undefined) return <Loading label="Preparing call sheet" />;
  if (!data || !event || !sheet) {
    return (
      <EmptyState title="Call sheet not found" actions={<Link to="../schedule" className="btn btn-primary">Back to schedule</Link>}>
        This schedule event no longer exists.
      </EmptyState>
    );
  }

  const missingEmergency = !sheet.emergency.length;

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:py-8">
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <Link to={`../schedule?event=${event.id}`} className="btn btn-ghost">
          <ArrowLeft className="size-4" /> Back to schedule
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Print
          </Button>
          <Button
            variant="primary"
            icon={<FileDown className="size-4" />}
            onClick={() => {
              try {
                exportCallSheetPdf(sheet, `${slug(project.title)}-call-sheet-${event.date}`);
              } catch (e) {
                toastError(e, 'PDF not created');
              }
            }}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {event.type !== 'filming' && (
        <p className="no-print mb-4 rounded-md border border-line bg-surface px-3 py-2 text-[12.5px] text-muted">Call sheets are usually for filming days. This one is for a {event.type} event.</p>
      )}
      {conflicts.length > 0 && (
        <div className="no-print mb-4 rounded-md border border-danger/35 bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger" role="alert">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> Resolve before sending (not printed):
          </div>
          <ul className="list-inside list-disc space-y-0.5">
            {conflicts.map((c, i) => (
              <li key={i}>{c.text}</li>
            ))}
          </ul>
        </div>
      )}
      {missingEmergency && !editing && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warning/35 bg-warning-soft px-3.5 py-2.5 text-[12.5px] text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">Add emergency contacts and safety information — every call sheet should say who to call.</span>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Add now
          </Button>
        </div>
      )}

      <article className="callsheet-doc overflow-hidden rounded-md border border-[#d9d4c9] bg-white text-[#1a1814] shadow-pop">
        <header className="border-b border-[#d9d4c9] px-6 py-6 sm:px-8">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9c6a17]">Call sheet · {sheet.dayLabel}</div>
          <h1 className="mt-2 font-display text-[38px] leading-none">{sheet.projectTitle}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 text-[13px] text-[#6b665d]">
            <span>{sheet.eventTitle}</span>
            <span>{sheet.dateLabel}</span>
          </div>
        </header>

        <div className="grid grid-cols-3 divide-x divide-[#d9d4c9] border-b border-[#d9d4c9]">
          {[
            ['Crew call', sheet.crewCall],
            ['Shooting call', sheet.shootingCall],
            ['Est. wrap', sheet.wrap],
          ].map(([l, v], i) => (
            <div key={l} className={i === 0 ? 'bg-[#faf5ea] px-4 py-4 sm:px-6' : 'px-4 py-4 sm:px-6'}>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#a39d92]">{l}</div>
              <div className="mt-1 font-mono text-[20px] font-semibold sm:text-[26px]">{v}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-0 border-b border-[#d9d4c9] md:grid-cols-2 md:divide-x md:divide-[#d9d4c9]">
          <section className="px-6 py-5 sm:px-8">
            <SheetLabel>Location</SheetLabel>
            {sheet.location ? (
              <div className="space-y-2 text-[13px]">
                <div className="text-[16px] font-semibold">{sheet.location.name}</div>
                {sheet.location.address && <div className="text-[#6b665d]">{sheet.location.address}</div>}
                {sheet.location.access && (
                  <p>
                    <span className="font-medium">Access: </span>
                    {sheet.location.access}
                  </p>
                )}
                {sheet.location.restrictions && (
                  <p>
                    <span className="font-medium">Restrictions: </span>
                    {sheet.location.restrictions}
                  </p>
                )}
                <p className="no-print text-[11.5px] text-[#a39d92]">Location contact details stay private and aren’t printed.</p>
              </div>
            ) : (
              <p className="text-[13px] text-[#a39d92]">No location set for this day.</p>
            )}
          </section>
          <section className="border-t border-[#d9d4c9] px-6 py-5 sm:px-8 md:border-t-0">
            <div className="flex items-center justify-between">
              <SheetLabel>Emergency & safety</SheetLabel>
              {!editing && (
                <button type="button" onClick={() => setEditing(true)} className="no-print -mt-2 inline-flex items-center gap-1 text-[12px] text-[#9c6a17] hover:underline">
                  <Pencil className="size-3" /> Edit
                </button>
              )}
            </div>
            {editing ? (
              <EmergencyEditor
                contacts={data.project.emergencyContacts}
                safetyNotes={data.project.safetyNotes}
                onDone={() => setEditing(false)}
                projectId={project.id}
              />
            ) : (
              <div className="space-y-2 text-[13px]">
                {sheet.emergency.length ? (
                  sheet.emergency.map((c, i) => (
                    <div key={i}>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-[#6b665d]">{[c.role, c.phone].filter(Boolean).join(' · ')}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-[#a39d92]">No emergency contacts supplied.</p>
                )}
                {sheet.safetyNotes && <p className="whitespace-pre-wrap pt-1">{sheet.safetyNotes}</p>}
              </div>
            )}
          </section>
        </div>

        <section className="border-b border-[#d9d4c9] px-6 py-5 sm:px-8">
          <SheetLabel>
            Scenes · {sheet.scenes.length} · {sheet.totalPages} pages
          </SheetLabel>
          {sheet.scenes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#d9d4c9] font-mono text-[9.5px] uppercase tracking-[0.15em] text-[#a39d92]">
                    <th className="py-1.5 pr-3 font-medium">Sc</th>
                    <th className="py-1.5 pr-3 font-medium">Set</th>
                    <th className="py-1.5 pr-3 font-medium">Description</th>
                    <th className="py-1.5 pr-3 font-medium">D/N</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Pages</th>
                    <th className="py-1.5 font-medium">Cast</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.scenes.map((s) => (
                    <tr key={s.number + s.heading} className="border-b border-[#ece7dd] align-top">
                      <td className="py-2 pr-3 font-mono font-semibold">{s.number}</td>
                      <td className="py-2 pr-3 font-medium">{s.heading}</td>
                      <td className="py-2 pr-3 text-[#4a463f]">{s.summary || '—'}</td>
                      <td className="py-2 pr-3 font-mono text-[11px]">{s.timeOfDay || '—'}</td>
                      <td className="py-2 pr-3 text-right font-mono">{s.pages}</td>
                      <td className="py-2 text-[#4a463f]">{s.cast || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px] text-[#a39d92]">No scenes scheduled for this day. Add scenes to the event in the schedule.</p>
          )}
        </section>

        <div className="grid border-b border-[#d9d4c9] md:grid-cols-2 md:divide-x md:divide-[#d9d4c9]">
          <section className="px-6 py-5 sm:px-8">
            <SheetLabel>Cast</SheetLabel>
            {sheet.cast.length ? (
              <table className="w-full text-[12.5px]">
                <tbody>
                  {sheet.cast.map((c) => (
                    <tr key={c.name + c.characters} className="border-b border-[#ece7dd]">
                      <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                      <td className="py-1.5 pr-3 text-[#4a463f]">{c.characters}</td>
                      <td className="py-1.5 text-right font-mono">{c.call}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-[#a39d92]">No cast assigned to these scenes’ characters.</p>
            )}
            {sheet.uncast.length > 0 && <p className="mt-2 text-[12px] text-[#9a6216]">Not yet cast: {sheet.uncast.join(', ')}</p>}
          </section>
          <section className="border-t border-[#d9d4c9] px-6 py-5 sm:px-8 md:border-t-0">
            <SheetLabel>Crew</SheetLabel>
            {sheet.crew.length ? (
              <table className="w-full text-[12.5px]">
                <tbody>
                  {sheet.crew.map((c) => (
                    <tr key={c.name} className="border-b border-[#ece7dd]">
                      <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                      <td className="py-1.5 text-[#4a463f]">{c.roles || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-[#a39d92]">
                No crew listed. <span className="no-print">Add crew to the event under “Crew & others”.</span>
              </p>
            )}
          </section>
        </div>

        {(sheet.equipment.trim() || sheet.notes.trim()) && (
          <div className="grid border-b border-[#d9d4c9] md:grid-cols-2 md:divide-x md:divide-[#d9d4c9]">
            <section className="px-6 py-5 sm:px-8">
              <SheetLabel>Equipment</SheetLabel>
              <p className="whitespace-pre-wrap text-[13px]">{sheet.equipment.trim() || '—'}</p>
            </section>
            <section className="border-t border-[#d9d4c9] px-6 py-5 sm:px-8 md:border-t-0">
              <SheetLabel>Notes</SheetLabel>
              <p className="whitespace-pre-wrap text-[13px]">{sheet.notes.trim() || '—'}</p>
            </section>
          </div>
        )}

        {sheet.nextDay && (
          <section className="px-6 py-4 sm:px-8">
            <SheetLabel>Advance schedule</SheetLabel>
            <p className="text-[13px] text-[#4a463f]">
              {sheet.nextDay.label} — {sheet.nextDay.detail}
            </p>
          </section>
        )}
        <footer className="flex justify-between px-6 py-3 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#a39d92] sm:px-8">
          <span>SCENEFORGE</span>
          <span>{sheet.dateLabel}</span>
        </footer>
      </article>
    </div>
  );
}

function SheetLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.22em] text-[#9c6a17]">{children}</h2>;
}

function EmergencyEditor({ contacts, safetyNotes, onDone, projectId }: { contacts: EmergencyContact[]; safetyNotes: string; onDone: () => void; projectId: string }) {
  const [list, setList] = useState<EmergencyContact[]>(contacts.length ? contacts : [newEmergencyContact()]);
  const [notes, setNotes] = useState(safetyNotes);
  const [busy, setBusy] = useState(false);
  const set = (id: string, patch: Partial<EmergencyContact>) => setList((l) => l.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const incomplete = list.some((c) => (c.name.trim() || c.role.trim()) && !c.phone.trim());

  const save = async () => {
    setBusy(true);
    try {
      await updateProject(projectId, { emergencyContacts: list.filter((c) => c.name.trim() || c.phone.trim()), safetyNotes: notes.trim() }, 'Updated emergency contacts and safety notes');
      toast('Emergency information saved');
      onDone();
    } catch (e) {
      toastError(e, 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print space-y-3 text-[#1a1814] [&_.input]:border-[#d0cabe] [&_.input]:bg-white [&_.input]:text-[#1a1814]">
      {list.map((c) => (
        <div key={c.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input value={c.name} onChange={(e) => set(c.id, { name: e.target.value })} placeholder="Name (e.g. City Hospital)" aria-label="Contact name" className="col-span-3 sm:col-span-1" />
          <Input value={c.role} onChange={(e) => set(c.id, { role: e.target.value })} placeholder="Role (e.g. Safety officer)" aria-label="Contact role" className="col-span-2 sm:col-span-1" />
          <button type="button" onClick={() => setList((l) => l.filter((x) => x.id !== c.id))} aria-label="Remove contact" className="row-span-2 flex size-9 items-center justify-center self-start rounded-sm text-[#a39d92] hover:bg-[#f2efe8] hover:text-[#a8322a]">
            <Trash2 className="size-3.5" />
          </button>
          <Input type="tel" value={c.phone} onChange={(e) => set(c.id, { phone: e.target.value })} placeholder="Phone" aria-label="Contact phone" className="col-span-2" />
        </div>
      ))}
      <button type="button" onClick={() => setList((l) => [...l, newEmergencyContact()])} className="inline-flex items-center gap-1.5 text-[12.5px] text-[#9c6a17] hover:underline">
        <Plus className="size-3.5" /> Add contact
      </button>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Nearest hospital, first-aid kit location, safety officer, fire exits…" aria-label="Safety notes" />
      {incomplete && <p className="text-[12px] text-[#9a6216]">A contact without a phone number won’t help much in an emergency.</p>}
      <p className="text-[11.5px] text-[#a39d92]">Supplied by you and printed on every call sheet for this project.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="btn btn-sm text-[#6b665d] hover:bg-[#f2efe8]">
          Cancel
        </button>
        <Button size="sm" variant="primary" onClick={() => void save()} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
