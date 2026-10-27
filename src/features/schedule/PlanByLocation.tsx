import { CalendarPlus, CalendarSearch, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Checkbox, Dialog } from '@/components/ui';
import type { ProjectData } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import { formatEighths } from '@/lib/screenplay/paginate';
import type { Scene } from '@/lib/types';
import { screenTime } from './eventUtils';
import { FindDates } from './FindDates';

interface Group {
  key: string;
  label: string;
  locationId?: string;
  profiled: boolean;
  scenes: Scene[];
}

/**
 * Scenes not yet on any filming day, grouped by where they're shot, so
 * scenes at the same place can be filmed together and travel is minimised.
 */
export function PlanByLocation({ data, onSchedule }: { data: ProjectData; onSchedule: (sceneIds: string[], locationId?: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [findFor, setFindFor] = useState<string[] | null>(null);
  const numbers = useMemo(() => sceneNumbers(data.scenes), [data.scenes]);

  const groups = useMemo<Group[]>(() => {
    const scheduled = new Set(data.events.filter((e) => e.type === 'filming').flatMap((e) => e.sceneIds));
    const locById = new Map(data.locations.map((l) => [l.id, l]));
    const map = new Map<string, Group>();
    for (const s of data.scenes) {
      if (scheduled.has(s.id) || s.status === 'filmed') continue;
      const loc = s.locationId ? locById.get(s.locationId) : undefined;
      const key = loc ? `loc:${loc.id}` : s.locationName ? `name:${s.locationName}` : 'none';
      const g = map.get(key) ?? { key, label: loc?.name ?? (s.locationName || 'No location'), locationId: loc?.id, profiled: !!loc, scenes: [] };
      g.scenes.push(s);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.scenes.length - a.scenes.length || a.label.localeCompare(b.label));
  }, [data.scenes, data.events, data.locations]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const total = groups.reduce((n, g) => n + g.scenes.length, 0);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="eyebrow text-muted">Plan by location</h2>
        <p className="mt-1 text-[12px] text-faint">
          {total ? `${total} scene${total === 1 ? '' : 's'} not on a filming day yet. Group scenes at the same place to cut travel.` : 'Every scene is on a filming day (or filmed).'}
        </p>
      </div>
      {groups.map((g) => {
        const eighths = g.scenes.reduce((n, s) => n + (s.pageEighths || 0), 0);
        const sec = g.scenes.reduce((n, s) => n + (s.estDurationSec ?? s.scriptSec ?? 0), 0);
        const picked = g.scenes.filter((s) => selected.has(s.id)).map((s) => s.id);
        const ids = picked.length ? picked : g.scenes.map((s) => s.id);
        return (
          <div key={g.key} className="panel overflow-hidden">
            <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                {g.locationId ? (
                  <Link to={`../locations?location=${g.locationId}`} className="block truncate text-[13px] font-medium text-ink hover:text-accent">
                    {g.label}
                  </Link>
                ) : (
                  <span className="block truncate text-[13px] font-medium text-ink">{g.label}</span>
                )}
                <span className="slate">
                  {g.scenes.length} sc · {formatEighths(eighths)} pg{sec ? ` · ~${screenTime(sec)}` : ''}
                  {!g.profiled && g.key !== 'none' && ' · no profile'}
                </span>
              </div>
            </div>
            <ul className="space-y-1 px-3 py-2">
              {g.scenes.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-[12px]">
                  <Checkbox checked={selected.has(s.id)} onChange={() => toggle(s.id)} label={<span className="font-mono text-[10.5px] text-faint">{numbers.get(s.id)}</span>} />
                  <Link to={`../scenes?scene=${s.id}`} className="min-w-0 flex-1 truncate text-muted hover:text-ink" title={s.heading}>
                    {s.heading}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2">
              <Button size="sm" variant="secondary" icon={<CalendarPlus className="size-3.5" />} onClick={() => onSchedule(ids, g.locationId)}>
                Schedule {picked.length ? picked.length : 'all'} as one day
              </Button>
              <Button size="sm" variant="ghost" icon={<CalendarSearch className="size-3.5" />} onClick={() => setFindFor(ids)}>
                Find dates
              </Button>
            </div>
          </div>
        );
      })}
      <Dialog open={!!findFor} onOpenChange={(o) => !o && setFindFor(null)} title="Find filming dates" description="Days when everyone these scenes need is free." size="lg">
        {findFor && (
          <FindDates
            key={findFor.join(',')}
            projectId={data.project.id}
            scenes={data.scenes}
            characters={data.characters}
            people={data.people}
            locations={data.locations}
            events={data.events}
            initialSceneIds={findFor}
          />
        )}
      </Dialog>
    </div>
  );
}
