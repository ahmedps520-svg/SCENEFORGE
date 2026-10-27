import { CalendarX2, ExternalLink, Link2, Lock, MapPin, Trash2, Unlink, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Comments } from '@/components/Comments';
import { sceneOptions } from '@/components/options';
import { AssetImage, AutoText, Button, ImageUpload, Section, Segmented, Sheet, SinglePicker, toastError } from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { LOCATION_STATUSES } from '@/lib/constants';
import { updateRecord } from '@/lib/data/crud';
import { updateScene } from '@/lib/data/scenes';
import { formatShortDate, todayStr } from '@/lib/dates';
import { sceneNumbers } from '@/lib/numbering';
import type { Location, LocationStatus, Scene, ScheduleEvent } from '@/lib/types';
import { UnavailableDatesEditor } from '../schedule/DatesEditor';

/** True when a scene heading names this location ("HALE HOUSE - KITCHEN" ↔ "Hale House"). */
export function headingMatchesLocation(scene: Scene, location: Location): boolean {
  const n = scene.locationName.trim().toUpperCase();
  const ln = location.name.trim().toUpperCase();
  if (!n || ln.length < 2) return false;
  return n === ln || n.startsWith(ln + ' ') || n.startsWith(ln + ',') || n.startsWith(ln + '-');
}

export function LocationSheet({
  projectId,
  location,
  scenes,
  events,
  open,
  onOpenChange,
}: {
  projectId: string;
  location: Location | undefined;
  scenes: Scene[];
  events: ScheduleEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteEntity();
  const numbers = useMemo(() => sceneNumbers(scenes), [scenes]);

  if (!location) return null;
  const l = location;
  const save = (patch: Partial<Location>) => updateRecord<Location>('locations', l.id, patch).catch((e) => toastError(e, 'Not saved'));

  const linked = scenes.filter((s) => s.locationId === l.id);
  const suggested = scenes.filter((s) => s.locationId !== l.id && headingMatchesLocation(s, l));
  const unlinked = scenes.filter((s) => s.locationId !== l.id);
  const linkedIds = new Set(linked.map((s) => s.id));
  const filmingDates = [
    ...new Set(
      events
        .filter((e) => e.type === 'filming' && (e.locationId === l.id || e.sceneIds.some((id) => linkedIds.has(id))))
        .map((e) => e.date),
    ),
  ].sort();
  const clashes = filmingDates.filter((d) => l.unavailableDates.includes(d) && d >= todayStr());

  const link = async (sceneId: string | undefined) => {
    if (!sceneId) return;
    try {
      await updateScene(sceneId, { locationId: l.id });
    } catch (e) {
      toastError(e, 'Scene not linked');
    }
  };
  const unlink = async (sceneId: string) => {
    try {
      await updateScene(sceneId, { locationId: undefined });
    } catch (e) {
      toastError(e, 'Scene not unlinked');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={l.name || 'Untitled location'}
      description={`${linked.length} scene${linked.length === 1 ? '' : 's'} · ${LOCATION_STATUSES.find((s) => s.value === l.status)?.label}`}
      footer={
        <>
          <Button
            variant="danger-ghost"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              const ok = await remove('location', l.id, {
                confirmTitle: `Delete “${l.name}”?`,
                confirmMessage: `${linked.length ? `${linked.length} scene${linked.length === 1 ? '' : 's'} will be unlinked (their headings stay as written). ` : ''}Photos stay in the asset library. You can undo this right after.`,
              });
              if (ok) onOpenChange(false);
            }}
          >
            Delete location
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div key={l.id} className="space-y-8">
        <Section title="Photos" description="Reference shots of the space. Removing a photo here keeps it in the asset library.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {l.photoAssetIds.map((id) => (
              <div key={id} className="group relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-raised">
                <AssetImage assetId={id} alt={`${l.name} photo`} className="absolute inset-0 size-full" />
                <button
                  type="button"
                  onClick={() => void save({ photoAssetIds: l.photoAssetIds.filter((x) => x !== id) })}
                  aria-label="Remove photo from this location"
                  className="absolute right-1.5 top-1.5 rounded-xs bg-black/65 p-1 text-white opacity-100 transition-opacity hover:bg-black/85 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <ImageUpload
              projectId={projectId}
              value={undefined}
              onChange={(id) => id && void save({ photoAssetIds: [...l.photoAssetIds, id] })}
              category="location"
              links={{ locationIds: [l.id] }}
              label="Add photo"
              hint="Up to 25 MB"
              aspect="aspect-[4/3]"
            />
          </div>
        </Section>

        <Section title="Details">
          <div className="space-y-4">
            <AutoText label="Name" value={l.name} onSave={(name) => save({ name: name.trim() })} required="A location needs a name." />
            <AutoText
              label={
                <span className="inline-flex items-center gap-1.5">
                  Address or general area <Lock className="size-3 text-faint" aria-label="Private" />
                </span>
              }
              value={l.address}
              onSave={(address) => save({ address })}
              placeholder="e.g. 14 Harbour Rd, or “the old pier off Route 9”"
              hint="Hidden in presentations."
            />
            <AutoText label="Description" value={l.description} onSave={(description) => save({ description })} multiline placeholder="What the space looks like and why it works for the story" />
            <AutoText label="Access instructions" value={l.access} onSave={(access) => save({ access })} multiline rows={2} placeholder="Parking, entrances, load-in, keys, power" />
          </div>
        </Section>

        <Section title="Availability">
          <div className="space-y-4">
            <Segmented<LocationStatus>
              label="Location status"
              value={l.status}
              onChange={(status) => void save({ status })}
              options={LOCATION_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            />
            {clashes.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                <CalendarX2 className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Filming is scheduled here on {clashes.map(formatShortDate).join(', ')} — marked unavailable. <Link to="../schedule" className="underline">Open schedule</Link>
                </span>
              </div>
            )}
            <AutoText label="Availability notes" value={l.availabilityNotes} onSave={(availabilityNotes) => save({ availabilityNotes })} multiline rows={2} placeholder="e.g. Weekends only after 6pm; closed Mondays" />
            <div>
              <div className="label">Unavailable dates</div>
              <UnavailableDatesEditor value={l.unavailableDates} onChange={(unavailableDates) => void save({ unavailableDates })} highlight={filmingDates} highlightLabel="Filming here" />
            </div>
          </div>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" /> Private contact
            </span>
          }
          description="Kept on this device only. Excluded from presentations, call sheets, and from backups exported with “strip private info”."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AutoText label="Contact name" value={l.contactName} onSave={(contactName) => save({ contactName })} className="sm:col-span-2" optional />
            <AutoText label="Phone" type="tel" value={l.contactPhone} onSave={(contactPhone) => save({ contactPhone })} optional />
            <AutoText label="Email" type="email" value={l.contactEmail} onSave={(contactEmail) => save({ contactEmail })} optional />
          </div>
        </Section>

        <Section title="Rules & notes">
          <div className="space-y-4">
            <AutoText label="Restrictions" value={l.restrictions} onSave={(restrictions) => save({ restrictions })} multiline rows={2} placeholder="Noise limits, no open flames, permit needed, crew size…" />
            <AutoText label="Location notes" value={l.notes} onSave={(notes) => save({ notes })} multiline rows={3} />
          </div>
        </Section>

        <Section title={`Scenes here · ${linked.length}`}>
          {linked.length === 0 && <p className="mb-3 text-[12.5px] text-faint">No scenes linked yet. Scenes are linked automatically when a heading names this location exactly; you can also link them here.</p>}
          <ul className="divide-y divide-line rounded-md border border-line">
            {linked.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-7 shrink-0 font-mono text-[11px] text-faint">{numbers.get(s.id)}</span>
                <Link to={`../scenes?scene=${s.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:text-accent">
                  {s.heading || 'Untitled scene'}
                </Link>
                <button type="button" onClick={() => void unlink(s.id)} className="btn-icon size-7" title="Unlink scene" aria-label={`Unlink ${s.heading}`}>
                  <Unlink className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {suggested.length > 0 && (
            <div className="mt-3 rounded-md border border-dashed border-line-strong p-3">
              <div className="eyebrow mb-2">Headings that mention {l.name}</div>
              <ul className="space-y-1.5">
                {suggested.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-7 shrink-0 font-mono text-[11px] text-faint">{numbers.get(s.id)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{s.heading}</span>
                    <Button size="sm" variant="ghost" icon={<Link2 className="size-3.5" />} onClick={() => void link(s.id)}>
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unlinked.length > 0 && (
            <div className="mt-3">
              <SinglePicker value={undefined} onChange={(id) => void link(id)} options={sceneOptions(unlinked, numbers)} placeholder="Link another scene…" allowNone={false} />
            </div>
          )}
          {l.address && (
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(l.address)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
            >
              <MapPin className="size-3.5" /> Look up address on OpenStreetMap <ExternalLink className="size-3" />
            </a>
          )}
        </Section>

        <Comments projectId={projectId} entityType="location" entityId={l.id} />
      </div>
    </Sheet>
  );
}
