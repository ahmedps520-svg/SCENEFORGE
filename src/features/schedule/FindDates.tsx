import { CalendarCheck2, CalendarPlus, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sceneOptions } from '@/components/options';
import { Button, cn, MultiPicker, toastError } from '@/components/ui';
import { buildScheduleContext, castForScenes, suggestDates } from '@/lib/conflicts';
import { createRecord } from '@/lib/data/crud';
import { makeEvent } from '@/lib/data/factories';
import { formatDate, todayStr } from '@/lib/dates';
import { sceneNumbers } from '@/lib/numbering';
import { formatEighths } from '@/lib/screenplay/paginate';
import type { Character, Location, Person, Scene, ScheduleEvent } from '@/lib/types';

const HORIZON_DAYS = 60;

/**
 * Pick scenes, see who and what they need, and get the dates in the next two
 * months when every required cast member and location is free.
 */
export function FindDates({
  projectId,
  scenes,
  characters,
  people,
  locations,
  events,
  initialSceneIds = [],
}: {
  projectId: string;
  scenes: Scene[];
  characters: Character[];
  people: Person[];
  locations: Location[];
  events: ScheduleEvent[];
  initialSceneIds?: string[];
}) {
  const navigate = useNavigate();
  const [sceneIds, setSceneIds] = useState<string[]>(initialSceneIds);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const numbers = useMemo(() => sceneNumbers(scenes), [scenes]);
  const ctx = useMemo(() => buildScheduleContext({ scenes, characters, people, locations }), [scenes, characters, people, locations]);
  const charById = new Map(characters.map((c) => [c.id, c]));
  const selected = scenes.filter((s) => sceneIds.includes(s.id));

  const cast = castForScenes(sceneIds, ctx);
  const uncast = [...new Set(selected.flatMap((s) => s.characterIds))].filter((cid) => !charById.get(cid)?.actorId).map((cid) => charById.get(cid)?.name).filter(Boolean);
  const locIds = [...new Set(selected.map((s) => s.locationId).filter((x): x is string => !!x))];
  const noLocation = selected.filter((s) => !s.locationId).length;
  const unavailableLoc = locIds.map((id) => ctx.locations.get(id)).filter((l) => l?.status === 'unavailable');
  const dates = sceneIds.length ? suggestDates(sceneIds, ctx, events, todayStr(), HORIZON_DAYS) : [];
  const eighths = selected.reduce((n, s) => n + (s.pageEighths || 0), 0);

  const schedule = async (date: string) => {
    setBusy(true);
    try {
      const ev = await createRecord(
        'events',
        makeEvent(projectId, {
          type: 'filming',
          date,
          sceneIds,
          locationId: locIds.length === 1 ? locIds[0] : undefined,
          durationMin: 600,
          startTime: '08:00',
          callTime: '07:00',
        }),
      );
      navigate(`/p/${projectId}/schedule?event=${ev.id}`);
    } catch (e) {
      toastError(e, 'Filming day not created');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="label">Scenes to film together</div>
        <MultiPicker
          value={sceneIds}
          onChange={(v) => {
            setSceneIds(v);
            setPicked(null);
          }}
          options={sceneOptions(scenes, numbers)}
          placeholder="Add scene"
          emptyText="No scenes yet."
        />
      </div>

      {sceneIds.length > 0 && (
        <div className="grid gap-3 rounded-md border border-line bg-surface p-3 text-[12.5px] sm:grid-cols-2">
          <div>
            <div className="eyebrow mb-1">Cast needed</div>
            {cast.length ? (
              <ul className="space-y-0.5">
                {cast.map((c) => (
                  <li key={c.personId} className="text-ink">
                    {ctx.people.get(c.personId)?.name} <span className="text-faint">as {c.characterIds.map((id) => charById.get(id)?.name).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-faint">No cast assigned to these scenes’ characters.</p>
            )}
            {uncast.length > 0 && <p className="mt-1 text-warning">Not cast yet: {uncast.join(', ')} — their availability can’t be checked.</p>}
          </div>
          <div>
            <div className="eyebrow mb-1">Locations</div>
            {locIds.length ? <p className="text-ink">{locIds.map((id) => ctx.locations.get(id)?.name).join(', ')}</p> : <p className="text-faint">No location profiles linked.</p>}
            {noLocation > 0 && <p className="mt-1 text-faint">{noLocation} scene(s) without a location profile aren’t checked.</p>}
            <p className="mt-2 font-mono text-[11.5px] text-muted">
              {formatEighths(eighths)} pages · {selected.length} scene{selected.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}

      {sceneIds.length === 0 ? (
        <p className="flex items-center gap-2 text-[12.5px] text-faint">
          <Info className="size-3.5" /> Choose scenes to see days when everyone they need is free.
        </p>
      ) : unavailableLoc.length > 0 ? (
        <p className="text-[12.5px] text-danger">{unavailableLoc.map((l) => l!.name).join(', ')} is marked unavailable, so no date works until that changes.</p>
      ) : dates.length === 0 ? (
        <p className="text-[12.5px] text-warning">No day in the next {HORIZON_DAYS} days has everyone and every location available without another booking.</p>
      ) : (
        <div>
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <CalendarCheck2 className="size-3.5 text-success" /> {dates.length} workable day{dates.length === 1 ? '' : 's'} in the next {HORIZON_DAYS}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dates.slice(0, 24).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPicked(d)}
                aria-pressed={picked === d}
                className={cn('chip h-7 cursor-pointer hover:border-accent', picked === d && 'border-accent bg-accent-soft text-accent')}
              >
                {formatDate(d, 'EEE d MMM')}
              </button>
            ))}
          </div>
          {picked && (
            <Button className="mt-3" variant="primary" icon={<CalendarPlus className="size-4" />} loading={busy} onClick={() => void schedule(picked)}>
              Schedule filming day on {formatDate(picked, 'EEE d MMM')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
