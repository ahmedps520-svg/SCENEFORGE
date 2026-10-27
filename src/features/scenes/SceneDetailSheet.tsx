import { AlertTriangle, ArrowUpRight, CalendarDays, Camera, FilePlus2, Images, OctagonAlert, PenLine, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Comments } from '@/components/Comments';
import { characterOptions, locationOptions } from '@/components/options';
import { ItemStatusBadge, ReadinessBadge, ShotStatusBadge } from '@/components/StatusBadges';
import {
  AssetImage,
  AutoText,
  Avatar,
  Button,
  Field,
  Input,
  MultiPicker,
  Segmented,
  Select,
  Sheet,
  SinglePicker,
  toast,
  toastError,
  useAutosave,
} from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import type { AssistantFocus } from '@/app/WorkspaceLayout';
import { SCENE_STATUSES, shotTypeAbbr } from '@/lib/constants';
import { formatDate, formatSeconds } from '@/lib/dates';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeCharacter, makeItem, makeLocation } from '@/lib/data/factories';
import { titleCase } from '@/lib/data/projects';
import { addSceneToScript, updateScene } from '@/lib/data/scenes';
import type { ProjectData } from '@/lib/hooks';
import { useScript } from '@/lib/hooks';
import { frameNumbers, shotCodes } from '@/lib/numbering';
import { formatEighths } from '@/lib/screenplay/paginate';
import { TIMES_OF_DAY } from '@/lib/screenplay/heading';
import { matchCharacter } from '@/lib/screenplay/sync';
import type { IntExt, Item, ItemKind, Scene, SceneStatus } from '@/lib/types';
import { INT_EXT_OPTIONS, parseDuration, type SceneInfo } from './sceneInfo';
import { sceneElements, ScriptPreview } from './ScriptPreview';

export function SceneDetailSheet({
  info,
  data,
  numbers,
  open,
  onOpenChange,
  openAssistant,
}: {
  info: SceneInfo | undefined;
  data: ProjectData;
  numbers: Map<string, string>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  openAssistant: (focus?: AssistantFocus) => void;
}) {
  const scene = info?.scene;
  return (
    <Sheet
      open={open && !!info}
      onOpenChange={onOpenChange}
      width="max-w-2xl"
      title={info ? `Scene ${info.number}` : 'Scene'}
      description={scene?.heading || 'Untitled scene'}
      headerExtra={
        scene && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Sparkles className="size-3.5" />}
            onClick={() => openAssistant({ type: 'scene', id: scene.id, label: `Scene ${info!.number}: ${scene.heading}` })}
          >
            <span className="hidden sm:inline">Ask assistant</span>
          </Button>
        )
      }
      footer={info && <SheetFooter info={info} onClose={() => onOpenChange(false)} />}
    >
      {info && <SceneDetailBody key={info.scene.id} info={info} data={data} numbers={numbers} />}
    </Sheet>
  );
}

function SheetFooter({ info, onClose }: { info: SceneInfo; onClose: () => void }) {
  const del = useDeleteEntity();
  const [adding, setAdding] = useState(false);
  const { scene } = info;
  return (
    <>
      {scene.inScript ? (
        <span className="text-[12px] text-faint">To remove this scene, delete its heading in the script.</span>
      ) : (
        <Button
          variant="danger-ghost"
          size="sm"
          icon={<Trash2 className="size-3.5" />}
          onClick={async () => {
            const ok = await del('scene', scene.id, {
              confirmTitle: `Delete scene ${info.number}?`,
              confirmMessage: `This also deletes its ${info.frames.length} storyboard frame${info.frames.length === 1 ? '' : 's'} and ${info.shots.length} shot${info.shots.length === 1 ? '' : 's'}. You can undo right after.`,
            });
            if (ok) onClose();
          }}
        >
          Delete scene
        </Button>
      )}
      <div className="flex gap-2">
        {!scene.inScript && (
          <Button
            size="sm"
            variant="secondary"
            loading={adding}
            icon={<FilePlus2 className="size-3.5" />}
            onClick={async () => {
              setAdding(true);
              try {
                await addSceneToScript(scene.id);
                toast('Added to the production draft');
              } catch (e) {
                toastError(e, 'Couldn’t add to script');
              } finally {
                setAdding(false);
              }
            }}
          >
            Add to script
          </Button>
        )}
        <Link to={`/p/${scene.projectId}/storyboard?scene=${scene.id}`} className="btn btn-sm btn-secondary">
          <Images className="size-3.5" /> Storyboard
        </Link>
      </div>
    </>
  );
}

function SceneDetailBody({ info, data, numbers }: { info: SceneInfo; data: ProjectData; numbers: Map<string, string> }) {
  const { scene } = info;
  const pid = scene.projectId;
  const script = useScript(data.project.primaryScriptId);
  const elements = script ? sceneElements(script.elements, scene.id) : [];
  const fNumbers = frameNumbers(info.frames, numbers);
  const sCodes = shotCodes(info.shots, numbers);
  const blocks = info.blockers.filter((b) => b.level === 'block');
  const warns = info.blockers.filter((b) => b.level === 'warn');
  const unknownCues = (scene.scriptCues ?? []).filter((cue) => !matchCharacter(cue, data.characters));

  const save = (patch: Partial<Scene>) => updateScene(scene.id, patch).catch((e) => toastError(e, 'Change not saved'));

  return (
    <div className="space-y-7">
      {/* Status */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<SceneStatus>
          label="Scene status"
          value={scene.status}
          onChange={(status) => void save({ status })}
          options={SCENE_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          size="sm"
          className="max-w-full overflow-x-auto no-scrollbar"
        />
        <ReadinessBadge readiness={info.readiness} />
      </div>

      {(blocks.length > 0 || warns.length > 0) && (
        <div className="space-y-1.5 rounded-md border border-line bg-surface p-3">
          {blocks.map((b, i) => (
            <div key={`b${i}`} className="flex items-start gap-2 text-[12.5px] text-danger">
              <OctagonAlert className="mt-0.5 size-3.5 shrink-0" />
              {b.text}
            </div>
          ))}
          {warns.map((b, i) => (
            <div key={`w${i}`} className="flex items-start gap-2 text-[12.5px] text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {b.text}
            </div>
          ))}
        </div>
      )}

      {/* Heading */}
      <section className="space-y-3">
        <h3 className="eyebrow">Scene heading</h3>
        <HeadingEditor scene={scene} suggestions={[...new Set([...data.locations.map((l) => l.name.toUpperCase()), ...data.scenes.map((s) => s.locationName).filter(Boolean)])].sort()} />
        {scene.inScript ? (
          <p className="text-[12px] text-faint">Edits here also update the heading in the production draft.</p>
        ) : (
          <p className="text-[12px] text-warning">This scene isn’t in the production draft yet. Add it to the script from the footer below.</p>
        )}
      </section>

      <AutoText label="Summary" value={scene.summary} onSave={(summary) => save({ summary })} multiline rows={3} placeholder="What happens in this scene?" />

      {/* Breakdown */}
      <section className="space-y-4">
        <h3 className="eyebrow">Breakdown</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location profile" hint={scene.locationName ? `Heading says “${scene.locationName}”` : undefined}>
            <SinglePicker
              value={scene.locationId}
              onChange={(locationId) => void save({ locationId })}
              options={locationOptions(data.locations)}
              placeholder="Link a location"
              noneLabel="No location profile"
              onCreate={async (name) => (await createRecord('locations', makeLocation(pid, { name }))).id}
              createLabel={(t) => `Create location “${t}”`}
            />
          </Field>
          <DurationField scene={scene} />
        </div>

        <Field label="Characters present">
          <MultiPicker
            value={scene.characterIds}
            onChange={(characterIds) => void updateRecord<Scene>('scenes', scene.id, { characterIds })}
            options={characterOptions(data.characters, data.people)}
            placeholder="Add character"
            onCreate={async (name) => (await createRecord('characters', makeCharacter(pid, { name }))).id}
            createLabel={(t) => `Create character “${t}”`}
          />
        </Field>
        {unknownCues.length > 0 && (
          <div className="rounded-md border border-dashed border-line-strong px-3 py-2.5">
            <p className="text-[12px] text-muted">Speaking in the script but without a character profile:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unknownCues.map((cue) => (
                <button
                  key={cue}
                  className="chip hover:border-accent hover:text-accent"
                  onClick={async () => {
                    try {
                      const c = await createRecord('characters', makeCharacter(pid, { name: titleCase(cue) }));
                      await updateRecord<Scene>('scenes', scene.id, { characterIds: [...scene.characterIds, c.id] });
                      toast(`Created ${c.name}`);
                    } catch (e) {
                      toastError(e, 'Character not created');
                    }
                  }}
                >
                  <Plus className="size-3" /> {cue}
                </button>
              ))}
            </div>
          </div>
        )}
        {info.characters.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {info.characters.map((c) => {
              const actor = c.actorId ? data.people.find((p) => p.id === c.actorId) : undefined;
              return (
                <Link key={c.id} to={`/p/${pid}/characters?character=${c.id}`} className="flex items-center gap-2 rounded-sm pr-2 hover:bg-hover">
                  <Avatar name={c.name} assetId={c.portraitAssetId} size={26} />
                  <span className="text-[12.5px]">
                    <span className="text-ink">{c.name}</span>
                    <span className="block text-[11px] text-faint">{actor ? actor.name : 'Not cast'}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Props & wardrobe */}
      <section className="space-y-4">
        <h3 className="eyebrow">Props & wardrobe</h3>
        <ItemLinker kind="prop" scene={scene} data={data} linked={info.items.filter((i) => i.kind === 'prop')} />
        <ItemLinker kind="wardrobe" scene={scene} data={data} linked={info.items.filter((i) => i.kind === 'wardrobe')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <AutoText label="Prop notes" value={scene.propsNotes} onSave={(propsNotes) => save({ propsNotes })} multiline rows={2} placeholder="Anything not in the inventory yet" />
          <AutoText label="Wardrobe notes" value={scene.wardrobeNotes} onSave={(wardrobeNotes) => save({ wardrobeNotes })} multiline rows={2} placeholder="Changes, continuity, damage…" />
        </div>
        <AutoText label="Special effects" value={scene.sfxNotes} onSave={(sfxNotes) => save({ sfxNotes })} multiline rows={2} placeholder="Practical effects, VFX plates, stunts, rain, smoke…" />
      </section>

      <AutoText label="Director’s notes" value={scene.notes} onSave={(notes) => save({ notes })} multiline rows={4} placeholder="Tone, performance, blocking, what this scene must achieve." />

      {/* Linked production material */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">Storyboard · {info.frames.length}</h3>
          <Link to={`/p/${pid}/storyboard?scene=${scene.id}`} className="link text-[12px]">
            {info.frames.length ? 'Open storyboard' : 'Add frames'} <ArrowUpRight className="inline size-3" />
          </Link>
        </div>
        {info.frames.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {info.frames.slice(0, 8).map((f) => (
              <Link key={f.id} to={`/p/${pid}/storyboard?scene=${scene.id}`} className="group relative aspect-video overflow-hidden rounded-sm border border-line bg-surface">
                <AssetImage assetId={f.imageAssetId} alt="" className="absolute inset-0 size-full" fallback={<span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-faint">{shotTypeAbbr(f.shotType)}</span>} />
                <span className="absolute left-1 top-1 rounded-xs bg-black/60 px-1 font-mono text-[10px] text-white">{fNumbers.get(f.id)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-faint">No frames yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">Shots · {info.shots.length}</h3>
          <Link to={`/p/${pid}/shots?scene=${scene.id}`} className="link text-[12px]">
            {info.shots.length ? 'Open shot list' : 'Plan shots'} <ArrowUpRight className="inline size-3" />
          </Link>
        </div>
        {info.shots.length > 0 ? (
          <ul className="divide-y divide-line rounded-md border border-line">
            {info.shots.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                <Camera className="size-3.5 shrink-0 text-faint" />
                <span className="w-10 shrink-0 font-mono text-ink">{sCodes.get(s.id)}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{s.description || shotTypeAbbr(s.shotType)}</span>
                <ShotStatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-faint">No shots planned.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="eyebrow">Filming</h3>
        {info.dates.length ? (
          <ul className="space-y-1">
            {data.events
              .filter((e) => e.type === 'filming' && e.sceneIds.includes(scene.id))
              .map((e) => (
                <li key={e.id}>
                  <Link to={`/p/${pid}/schedule?event=${e.id}`} className="flex items-center gap-2 text-[12.5px] text-ink hover:text-accent">
                    <CalendarDays className="size-3.5 text-faint" />
                    {formatDate(e.date)} {e.title && <span className="text-muted">· {e.title}</span>}
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-faint">
            Not scheduled yet.{' '}
            <Link to={`/p/${pid}/schedule`} className="link">
              Open the schedule
            </Link>
          </p>
        )}
      </section>

      {/* Script */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">
            Script {scene.inScript && scene.pageEighths > 0 && <span className="text-faint">· {formatEighths(scene.pageEighths)} pg</span>}
          </h3>
          {scene.inScript && (
            <Link to={`/p/${pid}/script?scene=${scene.id}`} className="link text-[12px]">
              <PenLine className="inline size-3" /> Edit in script
            </Link>
          )}
        </div>
        {scene.inScript ? (
          script === undefined ? (
            <div className="h-24 animate-pulse rounded-md bg-surface" />
          ) : elements.length ? (
            <ScriptPreview elements={elements} sceneNumber={numbers.get(scene.id)} className="max-h-[420px] overflow-y-auto" />
          ) : (
            <p className="text-[12.5px] text-faint">This scene’s heading wasn’t found in the production draft.</p>
          )
        ) : (
          <p className="text-[12.5px] text-faint">Not in the production draft.</p>
        )}
      </section>

      <Comments projectId={pid} entityType="scene" entityId={scene.id} />
    </div>
  );
}

function HeadingEditor({ scene, suggestions }: { scene: Scene; suggestions: string[] }) {
  const locList = useId();
  const timeList = useId();
  const loc = useAutosave(scene.locationName, (locationName: string) => updateScene(scene.id, { locationName }).catch((e) => toastError(e, 'Heading not saved')), 700);
  const time = useAutosave(scene.timeOfDay, (timeOfDay: string) => updateScene(scene.id, { timeOfDay }).catch((e) => toastError(e, 'Heading not saved')), 700);
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 sm:grid-cols-[100px_1fr_140px]">
      <Select
        aria-label="Interior or exterior"
        value={scene.intExt}
        onChange={(e) => void updateScene(scene.id, { intExt: e.target.value as IntExt }).catch((err) => toastError(err, 'Heading not saved'))}
      >
        {INT_EXT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Input aria-label="Location" value={loc.value} onChange={(e) => loc.change(e.target.value)} onBlur={loc.flush} className="uppercase" placeholder="LOCATION" list={locList} />
      <datalist id={locList}>
        {suggestions.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <Input aria-label="Time of day" value={time.value} onChange={(e) => time.change(e.target.value)} onBlur={time.flush} className="col-span-2 uppercase sm:col-span-1" placeholder="DAY" list={timeList} />
      <datalist id={timeList}>
        {TIMES_OF_DAY.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

function DurationField({ scene }: { scene: Scene }) {
  const initial = scene.estDurationSec !== undefined ? formatSeconds(scene.estDurationSec) : '';
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(initial), [initial]);
  const commit = async () => {
    const v = parseDuration(text);
    if (v !== null && Number.isNaN(v)) {
      setError('Use m:ss (1:30) or whole minutes (2)');
      return;
    }
    setError(null);
    if ((v ?? undefined) === scene.estDurationSec) return;
    try {
      await updateRecord<Scene>('scenes', scene.id, { estDurationSec: v ?? undefined });
    } catch (e) {
      toastError(e, 'Duration not saved');
    }
  };
  const estimate = scene.scriptSec ? `${formatSeconds(scene.scriptSec)} estimated from the script` : 'No script estimate yet';
  return (
    <Field label="Duration" hint={error ? undefined : scene.estDurationSec !== undefined ? `Override · ${estimate}` : estimate} error={error}>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === 'Enter' && void commit()}
        placeholder={scene.scriptSec ? formatSeconds(scene.scriptSec) : 'm:ss'}
        invalid={!!error}
        inputMode="numeric"
        className="font-mono"
      />
    </Field>
  );
}

function ItemLinker({ kind, scene, data, linked }: { kind: ItemKind; scene: Scene; data: ProjectData; linked: Item[] }) {
  const pool = data.items.filter((i) => i.kind === kind);
  const noun = kind === 'prop' ? 'prop' : 'costume';
  const update = async (ids: string[]) => {
    try {
      for (const item of pool) {
        const has = item.sceneIds.includes(scene.id);
        const want = ids.includes(item.id);
        if (has && !want) await updateRecord<Item>('items', item.id, { sceneIds: item.sceneIds.filter((s) => s !== scene.id) });
        if (!has && want) await updateRecord<Item>('items', item.id, { sceneIds: [...item.sceneIds, scene.id] });
      }
    } catch (e) {
      toastError(e, 'Change not saved');
    }
  };
  return (
    <Field label={kind === 'prop' ? 'Required props' : 'Wardrobe'}>
      <MultiPicker
        value={linked.map((i) => i.id)}
        onChange={(ids) => void update(ids)}
        options={pool.map((i) => ({ value: i.id, label: i.name || 'Unnamed', hint: i.description || undefined }))}
        placeholder={`Add ${noun}`}
        onCreate={async (name) => (await createRecord('items', makeItem(scene.projectId, kind, { name, sceneIds: [scene.id] }))).id}
        createLabel={(t) => `Add “${t}” to the ${kind === 'prop' ? 'prop' : 'wardrobe'} inventory`}
      />
      {linked.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-md border border-line">
          {linked.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
              <Link to={`/p/${scene.projectId}/locations?item=${i.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent">
                {i.name || 'Unnamed'}
                {i.quantity > 1 && <span className="ml-1.5 font-mono text-faint">×{i.quantity}</span>}
              </Link>
              <ItemStatusBadge status={i.status} />
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
