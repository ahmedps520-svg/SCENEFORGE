import { ArrowUpRight, Camera, Clapperboard, Drama, Images, Sparkles, X } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ShotStatusBadge } from '@/components/StatusBadges';
import { AssetImage, AutoText, Button, IconButton, Loading, Select, toastError } from '@/components/ui';
import { SCENE_STATUSES, shotTypeAbbr } from '@/lib/constants';
import { updateScene } from '@/lib/data/scenes';
import { useCharacters, useFrames, useScene, useScenes, useShots } from '@/lib/hooks';
import { sceneNumbers, shotCodes } from '@/lib/numbering';
import type { SceneStatus } from '@/lib/types';

export const ContextPanel = memo(function ContextPanel({
  projectId,
  sceneId,
  heading,
  number,
  isPrimary,
  onClose,
  onAsk,
}: {
  projectId: string;
  sceneId?: string;
  heading?: string;
  number?: string;
  isPrimary: boolean;
  onClose?: () => void;
  onAsk: (sceneId: string, label: string) => void;
}) {
  const scene = useScene(sceneId);
  const scenes = useScenes(projectId);
  const frames = useFrames(projectId);
  const shots = useShots(projectId);
  const characters = useCharacters(projectId);
  const base = `/p/${projectId}`;

  const header = (
    <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <div className="eyebrow">{number ? `Scene ${number}` : 'Scene'}</div>
        <div className="mt-0.5 truncate font-mono text-[12px] font-semibold uppercase text-ink" title={heading}>
          {heading || 'No scene selected'}
        </div>
      </div>
      {onClose && (
        <IconButton label="Hide scene panel" size="sm" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      )}
    </div>
  );

  if (!sceneId) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <p className="px-4 py-5 text-[12.5px] leading-relaxed text-faint">Place the cursor inside a scene to see its storyboard, shots, cast and production notes here.</p>
      </div>
    );
  }
  if (scene === undefined) return <div className="flex h-full flex-col">{header}<Loading label="Loading scene" /></div>;
  if (scene === null) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <p className="px-4 py-5 text-[12.5px] leading-relaxed text-faint">
          {isPrimary
            ? 'This scene is being added to the breakdown — it will appear here as soon as the draft saves.'
            : 'This heading isn’t in the production draft, so it has no breakdown yet. Scenes follow the production draft.'}
        </p>
      </div>
    );
  }

  const numbers = sceneNumbers(scenes ?? []);
  const sceneFrames = (frames ?? []).filter((f) => f.sceneId === scene.id);
  const sceneShots = (shots ?? []).filter((s) => s.sceneId === scene.id);
  const codes = shotCodes(shots ?? [], numbers);
  const present = (characters ?? []).filter((c) => scene.characterIds.includes(c.id));
  const save = (patch: Parameters<typeof updateScene>[1]) => updateScene(scene.id, patch).catch((e) => toastError(e, 'Scene not saved'));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-2">
          <Select aria-label="Scene status" value={scene.status} onChange={(e) => void save({ status: e.target.value as SceneStatus })} className="h-8 text-[12.5px]">
            {SCENE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <AutoText label="Summary" value={scene.summary} onSave={(v) => save({ summary: v })} multiline rows={3} placeholder="What happens in this scene?" />

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 eyebrow">
              <Images className="size-3.5" /> Storyboard · {sceneFrames.length}
            </span>
            <Link to={`${base}/storyboard?scene=${scene.id}`} className="text-[11.5px] text-accent hover:underline">
              Open
            </Link>
          </div>
          {sceneFrames.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {sceneFrames.slice(0, 6).map((f) => (
                <Link key={f.id} to={`${base}/storyboard?scene=${scene.id}`} className="relative aspect-video overflow-hidden rounded-xs border border-line bg-surface" title={f.action || shotTypeAbbr(f.shotType)}>
                  <AssetImage assetId={f.imageAssetId} alt={f.action || 'Storyboard frame'} className="size-full" fallback={<span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-faint">{shotTypeAbbr(f.shotType)}</span>} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-faint">No frames yet.</p>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 eyebrow">
              <Camera className="size-3.5" /> Shots · {sceneShots.length}
            </span>
            <Link to={`${base}/shots?scene=${scene.id}`} className="text-[11.5px] text-accent hover:underline">
              Open
            </Link>
          </div>
          {sceneShots.length ? (
            <ul className="space-y-1.5">
              {sceneShots.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-9 shrink-0 font-mono text-[11px] text-accent">{codes.get(s.id)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{s.description || shotTypeAbbr(s.shotType)}</span>
                  <ShotStatusBadge status={s.status} />
                </li>
              ))}
              {sceneShots.length > 6 && <li className="text-[11.5px] text-faint">+{sceneShots.length - 6} more</li>}
            </ul>
          ) : (
            <p className="text-[12px] text-faint">No shots planned.</p>
          )}
        </section>

        <section>
          <span className="mb-2 flex items-center gap-1.5 eyebrow">
            <Drama className="size-3.5" /> Characters · {present.length}
          </span>
          {present.length ? (
            <div className="flex flex-wrap gap-1.5">
              {present.map((c) => (
                <Link key={c.id} to={`${base}/characters?character=${c.id}`} className="chip hover:border-accent">
                  {c.name}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-faint">Characters with dialogue here are linked automatically once they have a profile.</p>
          )}
        </section>

        <AutoText label="Production notes" value={scene.notes} onSave={(v) => save({ notes: v })} multiline rows={4} placeholder="Blocking, mood, practical concerns…" />

        <div className="flex flex-col gap-2 pb-2">
          <Link to={`${base}/scenes?scene=${scene.id}`} className="btn btn-secondary btn-sm justify-between">
            <span className="flex items-center gap-1.5">
              <Clapperboard className="size-3.5" /> Open in Scenes
            </span>
            <ArrowUpRight className="size-3.5" />
          </Link>
          <Button size="sm" variant="ghost" icon={<Sparkles className="size-3.5" />} onClick={() => onAsk(scene.id, `Scene ${numbers.get(scene.id) ?? ''} · ${scene.heading}`)}>
            Ask the assistant about this scene
          </Button>
        </div>
      </div>
    </div>
  );
});
