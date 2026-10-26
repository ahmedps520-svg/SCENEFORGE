import { ChevronLeft, ChevronRight, Expand, Minimize, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PRESENT_KINDS } from '@/app/WorkspaceLayout';
import { ProjectCover } from '@/components/CoverArt';
import { AssetImage, cn, Menu, MenuItem } from '@/components/ui';
import { PRODUCTION_TYPES, angleLabel, movementLabel, shotTypeAbbr, shotTypeLabel, stageLabel } from '@/lib/constants';
import { formatDate, formatSeconds } from '@/lib/dates';
import { useProjectData, type ProjectData } from '@/lib/hooks';
import { frameNumbers, sceneNumbers, shotCodes } from '@/lib/numbering';
import { formatEighths, PAGE_SIZES, paginate, scriptStats, type PageLine } from '@/lib/screenplay/paginate';
import type { Character, Scene } from '@/lib/types';

/**
 * Cinematic presentation mode. Always dark, full screen where supported,
 * keyboard (← → Space Home End F Esc) and swipe navigation, controls that
 * fade away while presenting. Private contact details are never shown.
 */

interface Slide {
  key: string;
  node: ReactNode;
}

const BACK: Record<string, string> = {
  pitch: 'overview',
  storyboard: 'storyboard',
  screenplay: 'script',
  characters: 'characters',
  scenes: 'scenes',
  shots: 'shots',
};

export default function PresentPage() {
  const { projectId, kind = 'pitch' } = useParams();
  const [params] = useSearchParams();
  const sceneFilter = params.get('scene') ?? undefined;
  const data = useProjectData(projectId);
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchX = useRef<number | null>(null);

  const slides = useMemo(() => (data ? buildSlides(kind, data, sceneFilter) : []), [kind, data, sceneFilter]);
  const count = slides.length;

  useEffect(() => setIndex(0), [kind, sceneFilter]);
  useEffect(() => {
    if (index > 0 && index >= count) setIndex(Math.max(0, count - 1));
  }, [count, index]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    navigate(`/p/${projectId}/${BACK[kind] ?? 'overview'}${sceneFilter && kind === 'storyboard' ? `?scene=${sceneFilter}` : ''}`);
  }, [navigate, projectId, kind, sceneFilter]);

  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(count - 1, i + delta))), [count]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2600);
  }, []);

  useEffect(() => {
    wake();
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
        case 'Enter':
          e.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault();
          go(-1);
          break;
        case 'Home':
          setIndex(0);
          break;
        case 'End':
          setIndex(count - 1);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          if (!document.fullscreenElement) exit();
          break;
        default:
          return;
      }
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, count, exit, toggleFullscreen, wake]);

  const title = PRESENT_KINDS.find((p) => p.kind === kind)?.label ?? 'Presentation';

  return (
    <div
      data-theme="dark"
      className={cn('fixed inset-0 select-none overflow-hidden bg-black text-ink', idle && 'cursor-none')}
      onMouseMove={wake}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
        wake();
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {data === undefined ? (
        <Centered>
          <span className="eyebrow">Loading</span>
        </Centered>
      ) : data === null ? (
        <Centered>
          <h1 className="display text-4xl">This project doesn’t exist</h1>
          <Link to="/" className="btn btn-secondary mt-6">
            Back to the studio
          </Link>
        </Centered>
      ) : count === 0 ? (
        <Centered>
          <div className="eyebrow mb-3">{title}</div>
          <h1 className="display text-[44px]">Nothing to present yet</h1>
          <p className="mt-2 max-w-md text-center text-[14px] text-muted">{emptyHint(kind)}</p>
          <button className="btn btn-secondary mt-6" onClick={exit}>
            Back to the workspace
          </button>
        </Centered>
      ) : (
        <>
          {/* Click zones: left third goes back, the rest advances. */}
          <button aria-label="Previous slide" className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-[inherit] focus:outline-none" onClick={() => go(-1)} tabIndex={-1} />
          <button aria-label="Next slide" className="absolute inset-y-0 right-0 z-10 w-2/3 cursor-[inherit] focus:outline-none" onClick={() => go(1)} tabIndex={-1} />
          <div key={slides[index]?.key} className="absolute inset-0" style={{ animation: 'fade-in 0.55s var(--ease-film) both' }}>
            {slides[index]?.node}
          </div>
          <div className="absolute inset-x-0 bottom-0 z-20 h-[2px] bg-white/10">
            <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${((index + 1) / count) * 100}%` }} />
          </div>
        </>
      )}

      {/* Controls */}
      <div className={cn('absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-500', idle ? 'pointer-events-none opacity-0' : 'opacity-100')}>
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={exit} className="btn-icon text-white/80 hover:bg-white/10 hover:text-white" aria-label="Exit presentation" title="Exit (Esc)">
            <X className="size-5" />
          </button>
          <div className="min-w-0">
            <div className="eyebrow text-white/50">{data?.project.title ?? ''}</div>
            <Menu
              align="start"
              trigger={<button className="truncate text-[13px] text-white/85 hover:text-white">{title} ▾</button>}
            >
              {PRESENT_KINDS.map((p) => (
                <MenuItem key={p.kind} checked={p.kind === kind} onSelect={() => navigate(`/p/${projectId}/present/${p.kind}`)}>
                  {p.label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {count > 0 && <span className="mr-2 font-mono text-[12px] text-white/60">{index + 1} / {count}</span>}
          <button onClick={() => go(-1)} disabled={index === 0} className="btn-icon text-white/80 hover:bg-white/10 hover:text-white" aria-label="Previous slide">
            <ChevronLeft className="size-5" />
          </button>
          <button onClick={() => go(1)} disabled={index >= count - 1} className="btn-icon text-white/80 hover:bg-white/10 hover:text-white" aria-label="Next slide">
            <ChevronRight className="size-5" />
          </button>
          {document.fullscreenEnabled && (
            <button onClick={toggleFullscreen} className="btn-icon text-white/80 hover:bg-white/10 hover:text-white" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title="Full screen (F)">
              {fullscreen ? <Minimize className="size-4" /> : <Expand className="size-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">{children}</div>;
}

function emptyHint(kind: string): string {
  switch (kind) {
    case 'storyboard':
      return 'Add storyboard frames to a scene and they’ll play here in sequence.';
    case 'screenplay':
      return 'Write a few scenes in the script editor first.';
    case 'characters':
      return 'Create characters in the Character Studio to present their profiles.';
    case 'scenes':
      return 'Scenes appear as you write headings in the script or add them in Scenes.';
    case 'shots':
      return 'Plan shots in the Shot List to present them here.';
    default:
      return 'Add a logline, characters or storyboard frames to build a pitch.';
  }
}

// ─── Slide builders ─────────────────────────────────────────────────────────

function buildSlides(kind: string, data: ProjectData, sceneFilter?: string): Slide[] {
  const numbers = sceneNumbers(data.scenes);
  switch (kind) {
    case 'storyboard':
      return storyboardSlides(data, numbers, sceneFilter);
    case 'screenplay':
      return screenplaySlides(data, numbers);
    case 'characters':
      return data.characters.map((c) => ({ key: c.id, node: <CharacterSlide character={c} data={data} /> }));
    case 'scenes':
      return data.scenes.map((s) => ({ key: s.id, node: <SceneSlide scene={s} data={data} number={numbers.get(s.id) ?? ''} /> }));
    case 'shots':
      return shotSlides(data, numbers);
    default:
      return pitchSlides(data, numbers);
  }
}

function pitchSlides(data: ProjectData, numbers: Map<string, string>): Slide[] {
  const p = data.project;
  const slides: Slide[] = [{ key: 'title', node: <TitleSlide data={data} /> }];
  if (p.logline) slides.push({ key: 'logline', node: <QuoteSlide eyebrow="Logline" text={p.logline} /> });
  if (p.synopsis) slides.push({ key: 'synopsis', node: <TextSlide eyebrow="Synopsis" title="The story" body={p.synopsis} /> });
  const leads = data.characters.filter((c) => data.scenes.some((s) => s.characterIds.includes(c.id))).slice(0, 6);
  const cast = leads.length ? leads : data.characters.slice(0, 6);
  if (cast.length) slides.push({ key: 'characters', node: <CharactersGridSlide characters={cast} data={data} /> });
  const keyFrames = data.scenes
    .map((s) => data.frames.find((f) => f.sceneId === s.id && f.imageAssetId))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .slice(0, 6);
  if (p.visualStyle || keyFrames.length) slides.push({ key: 'look', node: <LookSlide style={p.visualStyle} frames={keyFrames} data={data} numbers={numbers} /> });
  slides.push({ key: 'plan', node: <ProductionSlide data={data} /> });
  slides.push({ key: 'end', node: <EndSlide data={data} /> });
  return slides;
}

function storyboardSlides(data: ProjectData, numbers: Map<string, string>, sceneFilter?: string): Slide[] {
  const fnums = frameNumbers(data.frames, numbers);
  const slides: Slide[] = [];
  for (const scene of data.scenes) {
    if (sceneFilter && scene.id !== sceneFilter) continue;
    const frames = data.frames.filter((f) => f.sceneId === scene.id);
    if (!frames.length) continue;
    slides.push({ key: `card:${scene.id}`, node: <SceneCardSlide scene={scene} number={numbers.get(scene.id) ?? ''} frames={frames.length} /> });
    for (const f of frames) {
      slides.push({
        key: f.id,
        node: (
          <div className="absolute inset-0 flex flex-col">
            <div className="relative min-h-0 flex-1 px-[4vw] pt-[7vh]">
              <div className="relative mx-auto h-full max-w-[calc((100vh-30vh)*16/9)]">
                {f.imageAssetId ? (
                  <AssetImage assetId={f.imageAssetId} alt={f.action || 'Storyboard frame'} variant="full" fit="contain" className="absolute inset-0 size-full" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center rounded-sm border border-white/15">
                    <span className="eyebrow">No image for this frame</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mx-auto grid w-full max-w-6xl grid-cols-[auto_1fr] gap-x-8 gap-y-1 px-[4vw] pb-[6vh] pt-5">
              <div className="display text-[48px] leading-none text-accent">{fnums.get(f.id)}</div>
              <div className="min-w-0">
                <div className="slate text-white/55">
                  {shotTypeLabel(f.shotType)} · {angleLabel(f.angle)} · {movementLabel(f.movement)}
                  {f.durationSec ? ` · ${f.durationSec}s` : ''}
                  {f.transition && f.transition !== 'Cut' ? ` · ${f.transition}` : ''}
                </div>
                {f.action && <p className="mt-1.5 text-[clamp(16px,1.6vw,24px)] leading-snug text-white/90">{f.action}</p>}
                {f.audio && <p className="mt-1 text-[clamp(13px,1.1vw,17px)] italic text-white/55">{f.audio}</p>}
              </div>
            </div>
          </div>
        ),
      });
    }
  }
  return slides;
}

function screenplaySlides(data: ProjectData, numbers: Map<string, string>): Slide[] {
  const script = data.scripts.find((s) => s.id === data.project.primaryScriptId) ?? data.scripts[0];
  if (!script || !script.elements.some((e) => e.text.trim())) return [];
  const { pages } = paginate(script.elements, { sceneNumbers: numbers });
  return pages.map((lines, i) => ({ key: `page:${i}`, node: <ScreenplayPage lines={lines} page={i + 1} /> }));
}

function shotSlides(data: ProjectData, numbers: Map<string, string>): Slide[] {
  const codes = shotCodes(data.shots, numbers);
  const slides: Slide[] = [];
  for (const scene of data.scenes) {
    const shots = data.shots.filter((s) => s.sceneId === scene.id);
    for (let i = 0; i < shots.length; i += 7) {
      const chunk = shots.slice(i, i + 7);
      slides.push({
        key: `${scene.id}:${i}`,
        node: (
          <div className="absolute inset-0 flex flex-col justify-center px-[6vw] py-[10vh]">
            <div className="slate text-accent">
              Scene {numbers.get(scene.id)} · {shots.length} shot{shots.length === 1 ? '' : 's'}
              {shots.length > 7 ? ` · ${i / 7 + 1} of ${Math.ceil(shots.length / 7)}` : ''}
            </div>
            <h2 className="display mt-2 text-[clamp(30px,4vw,56px)]">{scene.heading || 'Untitled scene'}</h2>
            <table className="mt-8 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/15">
                  {['Shot', 'Type', 'Angle', 'Movement', 'Description', 'Lens'].map((h) => (
                    <th key={h} className="eyebrow py-2 pr-6 font-medium text-white/45">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chunk.map((s) => (
                  <tr key={s.id} className="border-b border-white/8 text-[clamp(14px,1.25vw,19px)]">
                    <td className="py-3 pr-6 font-mono text-accent">{codes.get(s.id)}</td>
                    <td className="py-3 pr-6 font-mono text-white/80">{shotTypeAbbr(s.shotType)}</td>
                    <td className="py-3 pr-6 text-white/70">{angleLabel(s.angle)}</td>
                    <td className="py-3 pr-6 text-white/70">{movementLabel(s.movement)}</td>
                    <td className="py-3 pr-6 text-white/90">{s.description}</td>
                    <td className="py-3 text-white/55">{s.lens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      });
    }
  }
  return slides;
}

// ─── Slides ─────────────────────────────────────────────────────────────────

function TitleSlide({ data }: { data: ProjectData }) {
  const p = data.project;
  const type = PRODUCTION_TYPES.find((t) => t.value === p.productionType)?.label;
  return (
    <div className="absolute inset-0">
      <ProjectCover project={p} variant="full" className="grain absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 px-[6vw] pb-[10vh]">
        <div className="slate text-accent">{[p.genres.join(' / '), type, p.runtimeTarget ? `${p.runtimeTarget} minutes` : ''].filter(Boolean).join('  ·  ')}</div>
        <h1 className="display mt-3 max-w-[16ch] text-[clamp(56px,9vw,150px)] leading-[0.92] text-white">{p.title}</h1>
      </div>
    </div>
  );
}

function QuoteSlide({ eyebrow, text }: { eyebrow: string; text: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-[10vw]">
      <div className="eyebrow text-accent">{eyebrow}</div>
      <p className="display mt-6 max-w-[28ch] text-[clamp(30px,4.2vw,68px)] italic leading-[1.12] text-white">“{text}”</p>
    </div>
  );
}

function TextSlide({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-[10vw]">
      <div className="eyebrow text-accent">{eyebrow}</div>
      <h2 className="display mt-3 text-[clamp(36px,4.5vw,72px)] text-white">{title}</h2>
      <div className="mt-6 max-w-[62ch] space-y-4 text-[clamp(16px,1.5vw,23px)] leading-relaxed text-white/80">
        {body.split(/\n\s*\n/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </div>
  );
}

function CharactersGridSlide({ characters, data }: { characters: Character[]; data: ProjectData }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-[7vw]">
      <div className="eyebrow text-accent">Characters</div>
      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-3">
        {characters.map((c) => {
          const actor = data.people.find((p) => p.id === c.actorId);
          return (
            <div key={c.id} className="flex items-start gap-4">
              <Portrait character={c} className="size-[clamp(64px,7vw,110px)] shrink-0" />
              <div className="min-w-0">
                <div className="display text-[clamp(22px,2.2vw,36px)] leading-tight text-white">{c.name}</div>
                {c.age && <div className="slate mt-1 text-white/45">Age {c.age}</div>}
                {actor && <div className="mt-1 text-[13px] text-white/60">Played by {actor.name}</div>}
                {(c.personality || c.goals) && <p className="mt-2 line-clamp-3 text-[clamp(13px,1.05vw,16px)] text-white/70">{c.personality || c.goals}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Portrait({ character, className }: { character: Character; className?: string }) {
  const initials = character.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const fallback = <div className={cn('flex items-center justify-center rounded-full border border-white/20 bg-white/5 display text-white/70', className)} style={{ fontSize: 'clamp(22px,2.4vw,40px)' }}>{initials || '?'}</div>;
  if (!character.portraitAssetId) return fallback;
  return (
    <div className={cn('overflow-hidden rounded-full border border-white/20', className)}>
      <AssetImage assetId={character.portraitAssetId} alt={character.name} variant="full" className="size-full" fallback={fallback} />
    </div>
  );
}

function CharacterSlide({ character: c, data }: { character: Character; data: ProjectData }) {
  const actor = data.people.find((p) => p.id === c.actorId);
  const scenes = data.scenes.filter((s) => s.characterIds.includes(c.id)).length;
  const rows: [string, string][] = [
    ['Personality', c.personality],
    ['Wants', c.goals || c.motivations],
    ['Fears', c.fears],
    ['Arc', c.arc],
  ].filter((r): r is [string, string] => !!r[1]);
  return (
    <div className="absolute inset-0 grid items-center gap-[5vw] px-[7vw] md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[42vh] overflow-hidden rounded-sm border border-white/15 bg-white/5">
        {c.portraitAssetId ? (
          <AssetImage assetId={c.portraitAssetId} alt={c.name} variant="full" className="absolute inset-0 size-full" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center display text-[12vh] text-white/25">{c.name.slice(0, 1)}</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="slate text-accent">
          {[c.age && `Age ${c.age}`, actor && `Played by ${actor.name}`, `${scenes} scene${scenes === 1 ? '' : 's'}`].filter(Boolean).join('  ·  ')}
        </div>
        <h2 className="display mt-2 text-[clamp(44px,6vw,96px)] leading-[0.95] text-white">{c.name}</h2>
        {c.appearance && <p className="mt-4 max-w-[56ch] text-[clamp(14px,1.25vw,19px)] italic text-white/60">{c.appearance}</p>}
        <dl className="mt-6 space-y-4">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow text-white/40">{k}</dt>
              <dd className="mt-1 max-w-[60ch] text-[clamp(15px,1.3vw,20px)] leading-snug text-white/85">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function SceneCardSlide({ scene, number, frames }: { scene: Scene; number: string; frames: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-[8vw] text-center">
      <div className="slate text-accent">Scene {number}</div>
      <h2 className="display mt-4 max-w-[22ch] text-[clamp(40px,6vw,96px)] leading-[0.98] text-white">{scene.heading || 'Untitled scene'}</h2>
      {scene.summary && <p className="mt-6 max-w-[56ch] text-[clamp(15px,1.4vw,21px)] text-white/65">{scene.summary}</p>}
      <div className="eyebrow mt-8 text-white/35">{frames} frame{frames === 1 ? '' : 's'}</div>
    </div>
  );
}

function SceneSlide({ scene, data, number }: { scene: Scene; data: ProjectData; number: string }) {
  const chars = scene.characterIds.map((id) => data.characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
  const loc = data.locations.find((l) => l.id === scene.locationId);
  const frame = data.frames.find((f) => f.sceneId === scene.id && f.imageAssetId);
  const items = data.items.filter((i) => i.sceneIds.includes(scene.id));
  const shots = data.shots.filter((s) => s.sceneId === scene.id).length;
  const duration = scene.estDurationSec ?? scene.scriptSec;
  const facts: [string, string][] = [
    ['Location', loc?.name ?? scene.locationName ?? ''],
    ['Time', scene.timeOfDay],
    ['Length', scene.pageEighths ? `${formatEighths(scene.pageEighths)} pg${duration ? ` · ~${formatSeconds(duration)}` : ''}` : duration ? `~${formatSeconds(duration)}` : ''],
    ['Shots', shots ? String(shots) : ''],
  ].filter((f): f is [string, string] => !!f[1]);
  return (
    <div className="absolute inset-0 grid items-center gap-[4vw] px-[6vw] py-[8vh] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0">
        <div className="slate text-accent">Scene {number}</div>
        <h2 className="display mt-2 text-[clamp(34px,4.6vw,76px)] leading-[0.98] text-white">{scene.heading || 'Untitled scene'}</h2>
        {(scene.summary || scene.scriptExcerpt) && <p className="mt-5 max-w-[60ch] text-[clamp(15px,1.35vw,21px)] leading-relaxed text-white/75">{scene.summary || scene.scriptExcerpt}</p>}
        <dl className="mt-7 grid max-w-xl grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow text-white/40">{k}</dt>
              <dd className="mt-1 text-[15px] text-white/85">{v}</dd>
            </div>
          ))}
        </dl>
        {chars.length > 0 && (
          <div className="mt-6">
            <div className="eyebrow text-white/40">Characters</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {chars.map((c) => (
                <span key={c.id} className="rounded-xs border border-white/15 px-2.5 py-1 text-[14px] text-white/85">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {(items.length > 0 || scene.sfxNotes) && (
          <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
            {items.length > 0 && (
              <div>
                <div className="eyebrow text-white/40">Props & wardrobe</div>
                <p className="mt-1 text-[14px] text-white/75">{items.map((i) => i.name).join(', ')}</p>
              </div>
            )}
            {scene.sfxNotes && (
              <div>
                <div className="eyebrow text-white/40">Effects</div>
                <p className="mt-1 text-[14px] text-white/75">{scene.sfxNotes}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {frame?.imageAssetId && (
        <div className="relative hidden aspect-video overflow-hidden rounded-sm border border-white/15 lg:block">
          <AssetImage assetId={frame.imageAssetId} alt="Storyboard frame" variant="full" fit="contain" className="absolute inset-0 size-full bg-black" />
        </div>
      )}
    </div>
  );
}

function LookSlide({ style, frames, data, numbers }: { style: string; frames: ProjectData['frames']; data: ProjectData; numbers: Map<string, string> }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-[6vw] py-[8vh]">
      <div className="eyebrow text-accent">The look</div>
      {style && <p className="display mt-4 max-w-[34ch] text-[clamp(26px,3vw,48px)] leading-tight text-white">{style}</p>}
      {frames.length > 0 && (
        <div className={cn('mt-8 grid gap-3', frames.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {frames.map((f) => {
            const scene = data.scenes.find((s) => s.id === f.sceneId);
            return (
              <figure key={f.id} className="min-w-0">
                <div className="relative aspect-video overflow-hidden rounded-sm border border-white/10 bg-black">
                  <AssetImage assetId={f.imageAssetId} alt={f.action || 'Frame'} variant="thumb" className="absolute inset-0 size-full" />
                </div>
                <figcaption className="slate mt-1.5 truncate text-white/45">
                  {numbers.get(f.sceneId)} · {scene?.heading}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductionSlide({ data }: { data: ProjectData }) {
  const p = data.project;
  const script = data.scripts.find((s) => s.id === p.primaryScriptId) ?? data.scripts[0];
  const stats = scriptStats(script?.elements ?? []);
  const filmingDays = data.events.filter((e) => e.type === 'filming').length;
  const crew = data.people.length;
  const facts: [string, string][] = [
    ['Stage', stageLabel(p.stage)],
    ['Script', stats.pageCount ? `${stats.pageCount} pages · ~${formatSeconds(stats.runtimeSec)}` : 'In development'],
    ['Scenes', String(data.scenes.length)],
    ['Shots planned', String(data.shots.length)],
    ['Filming days', filmingDays ? String(filmingDays) : 'Not scheduled'],
    ['Team', crew ? `${crew} ${crew === 1 ? 'person' : 'people'}` : '—'],
    ['Locations', String(data.locations.length)],
    ['Filming', p.filmingStart ? `${formatDate(p.filmingStart, 'd MMM')}${p.filmingEnd ? ` – ${formatDate(p.filmingEnd, 'd MMM yyyy')}` : ''}` : 'Dates to be set'],
  ];
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-[8vw]">
      <div className="eyebrow text-accent">The production</div>
      <h2 className="display mt-3 text-[clamp(36px,4.5vw,72px)] text-white">Making it</h2>
      <dl className="mt-10 grid max-w-5xl grid-cols-2 gap-x-10 gap-y-8 md:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="border-t border-white/15 pt-3">
            <dt className="eyebrow text-white/40">{k}</dt>
            <dd className="display mt-2 text-[clamp(20px,2vw,32px)] leading-tight text-white">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EndSlide({ data }: { data: ProjectData }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      <div className="eyebrow text-white/40">Thank you</div>
      <h2 className="display mt-4 text-[clamp(48px,7vw,120px)] text-white">{data.project.title}</h2>
    </div>
  );
}

/** A screenplay page at true proportions (8.5 × 11 in), scaled to fit the screen. */
function ScreenplayPage({ lines, page }: { lines: PageLine[]; page: number }) {
  const { widthIn, heightIn, lines: perPage } = PAGE_SIZES.letter;
  // 1 inch as a share of the page width, in container query units.
  const inch = (n: number) => `calc(${(n / widthIn) * 100}cqw)`;
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[3vh]">
      <div className="h-full max-h-full" style={{ aspectRatio: `${widthIn} / ${heightIn}` }}>
        <div className="relative size-full bg-[#f6f3ec] text-[#1a1814] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]" style={{ containerType: 'inline-size' }}>
          <div className="absolute inset-0 font-script" style={{ fontSize: `calc(${(12 / (widthIn * 72)) * 100}cqw)`, lineHeight: 1 }}>
            {page > 1 && (
              <div className="absolute" style={{ top: inch(0.5), right: inch(1) }}>
                {page}.
              </div>
            )}
            {lines.map((l, i) => {
              if (l.kind === 'blank' || !l.text) return null;
              const top = `calc(${inch(1)} + ${i} * ${inch((heightIn - 2) / perPage)})`;
              const style =
                l.align === 'right'
                  ? { top, right: inch(1), textAlign: 'right' as const }
                  : l.align === 'center'
                    ? { top, left: inch(1.5), width: inch(6), textAlign: 'center' as const }
                    : { top, left: inch(l.left) };
              return (
                <div key={i} className={cn('absolute whitespace-pre', l.kind === 'scene' && 'font-bold')} style={style}>
                  {l.sceneNumber && <span className="absolute" style={{ right: `calc(100% + ${inch(0.3)})` }}>{l.sceneNumber}</span>}
                  {l.text}
                  {l.sceneNumber && <span className="absolute" style={{ left: inch(7.45 - l.left) }}>{l.sceneNumber}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
