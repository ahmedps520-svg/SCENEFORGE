import { useMemo } from 'react';
import type { Project } from '@/lib/types';
import { AssetImage, cn } from './ui';

/**
 * Generated poster art for projects without an uploaded cover. Deterministic
 * per project (seed + genre), so a film keeps its look across sessions.
 */

type Palette = { sky: [string, string]; glow: string; land: [string, string, string]; motif: 'city' | 'peaks' | 'waves' | 'forest' | 'desert' };

const PALETTES: Record<string, Palette> = {
  thriller: { sky: ['#071219', '#1f4048'], glow: '#cfe3dc', land: ['#13262c', '#0c181d', '#050a0c'], motif: 'city' },
  horror: { sky: ['#0b0405', '#3e0b0d'], glow: '#d8463a', land: ['#220608', '#140405', '#080203'], motif: 'forest' },
  'science fiction': { sky: ['#03061a', '#1b2d66'], glow: '#8fdcff', land: ['#101b3d', '#0a1029', '#040714'], motif: 'peaks' },
  comedy: { sky: ['#3b2010', '#e39a45'], glow: '#fff0c8', land: ['#7a3f1a', '#4e2610', '#2a1408'], motif: 'waves' },
  drama: { sky: ['#120d09', '#6b4422'], glow: '#f2c46e', land: ['#2e1e12', '#1d130b', '#0d0805'], motif: 'peaks' },
  fantasy: { sky: ['#0d0718', '#4d2b70'], glow: '#f0d27c', land: ['#2a1840', '#1a0f29', '#0b0612'], motif: 'peaks' },
  mystery: { sky: ['#060a12', '#2c3754'], glow: '#b8c9db', land: ['#161d2d', '#0e131f', '#05070c'], motif: 'forest' },
  documentary: { sky: ['#0e0e0d', '#46443e'], glow: '#ece5d6', land: ['#25241f', '#181714', '#0a0a09'], motif: 'desert' },
  action: { sky: ['#120806', '#7a2d10'], glow: '#ffb061', land: ['#3b160a', '#240d06', '#100503'], motif: 'city' },
  romance: { sky: ['#180910', '#7a2f48'], glow: '#ffc7d2', land: ['#3d1625', '#260d17', '#11060a'], motif: 'waves' },
  western: { sky: ['#1c0f06', '#a05523'], glow: '#ffd38c', land: ['#5a2c10', '#3a1c0a', '#1a0c04'], motif: 'desert' },
  crime: { sky: ['#090909', '#2e2016'], glow: '#e0ae55', land: ['#1a140f', '#110d0a', '#060504'], motif: 'city' },
  animation: { sky: ['#081526', '#2d7896'], glow: '#ffe08a', land: ['#15425a', '#0d2b3c', '#06141c'], motif: 'waves' },
  musical: { sky: ['#12081a', '#62215f'], glow: '#ffbfe6', land: ['#36123a', '#230b26', '#100512'], motif: 'city' },
  experimental: { sky: ['#0a0a0a', '#30302d'], glow: '#e7e2d6', land: ['#1d1d1b', '#131312', '#070707'], motif: 'waves' },
};

export function paletteFor(genres: string[], productionType?: string): Palette {
  for (const g of genres) {
    const p = PALETTES[g.toLowerCase()];
    if (p) return p;
  }
  if (productionType === 'documentary') return PALETTES.documentary;
  if (productionType === 'experimental') return PALETTES.experimental;
  return PALETTES.drama;
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 480;
const H = 270;

function ridge(r: () => number, motif: Palette['motif'], baseY: number, amp: number): string {
  const pts: [number, number][] = [];
  if (motif === 'city') {
    let x = -10;
    while (x < W + 10) {
      const w = 8 + r() * 26;
      const h = amp * (0.25 + r() * 0.9);
      pts.push([x, baseY - h], [x + w, baseY - h]);
      x += w + (r() < 0.3 ? r() * 6 : 0);
    }
  } else if (motif === 'forest') {
    for (let x = -10; x < W + 10; x += 6 + r() * 8) {
      const h = amp * (0.4 + r() * 0.8);
      pts.push([x, baseY - h * 0.3], [x + 3, baseY - h], [x + 6, baseY - h * 0.3]);
    }
  } else if (motif === 'waves') {
    for (let x = -10; x <= W + 10; x += 12) {
      pts.push([x, baseY - amp * 0.5 - Math.sin(x / (40 + r() * 6)) * amp * 0.35 - r() * 2]);
    }
  } else if (motif === 'desert') {
    for (let x = -10; x <= W + 10; x += 20) {
      const mesa = r() < 0.12;
      pts.push([x, baseY - amp * (mesa ? 1.1 : 0.2 + r() * 0.25)]);
      if (mesa) pts.push([x + 18, baseY - amp * 1.1]);
    }
  } else {
    for (let x = -10; x <= W + 10; x += 18 + r() * 22) {
      pts.push([x, baseY - amp * (0.2 + r() * 0.95)]);
    }
  }
  return `M-20 ${H} L${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} L${W + 20} ${H} Z`;
}

export function CoverArt({ seed, genres, productionType, className }: { seed: number; genres: string[]; productionType?: string; className?: string }) {
  const art = useMemo(() => {
    const p = paletteFor(genres, productionType);
    const r = rng(seed + 7);
    const sunX = 70 + r() * (W - 140);
    const sunY = 55 + r() * 70;
    const sunR = 14 + r() * 30;
    const horizon = 175 + r() * 35;
    const layers = [0, 1, 2].map((i) => ({
      d: ridge(r, p.motif, horizon + i * 26, 46 - i * 10),
      fill: p.land[i],
    }));
    const stars = Array.from({ length: p.motif === 'waves' || p.motif === 'desert' ? 0 : 22 }, () => ({
      x: r() * W,
      y: r() * horizon * 0.7,
      o: 0.15 + r() * 0.5,
      s: 0.5 + r() * 0.9,
    }));
    return { p, sunX, sunY, sunR, horizon, layers, stars, id: `c${seed}` };
  }, [seed, genres, productionType]);

  const { p, id } = art;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={cn('block size-full', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={p.glow} stopOpacity="0.55" />
          <stop offset="0.35" stopColor={p.glow} stopOpacity="0.16" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fog`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.glow} stopOpacity="0" />
          <stop offset="0.5" stopColor={p.glow} stopOpacity="0.1" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-vig`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.65" />
        </radialGradient>
        <filter id={`${id}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed % 100} />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.09 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      {art.stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill={p.glow} opacity={s.o} />
      ))}
      <circle cx={art.sunX} cy={art.sunY} r={art.sunR * 4.2} fill={`url(#${id}-glow)`} />
      <circle cx={art.sunX} cy={art.sunY} r={art.sunR} fill={p.glow} opacity="0.92" />
      <rect y={art.horizon - 40} width={W} height="70" fill={`url(#${id}-fog)`} />
      {art.layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.fill} />
      ))}
      <rect width={W} height={H} fill={`url(#${id}-vig)`} />
      <rect width={W} height={H} filter={`url(#${id}-grain)`} opacity="0.9" />
    </svg>
  );
}

/** A project's cover: the uploaded image, or its generated poster art. */
export function ProjectCover({ project, className, variant = 'thumb' }: { project: Pick<Project, 'coverAssetId' | 'coverSeed' | 'genres' | 'productionType' | 'title'>; className?: string; variant?: 'thumb' | 'full' }) {
  const generated = <CoverArt seed={project.coverSeed} genres={project.genres} productionType={project.productionType} className="absolute inset-0" />;
  // Callers may position the cover themselves (e.g. `absolute inset-0`); only default to `relative`.
  const positioned = /\b(absolute|fixed|sticky)\b/.test(className ?? '');
  return (
    <div className={cn(!positioned && 'relative', 'overflow-hidden bg-black', className)}>
      {project.coverAssetId ? (
        <AssetImage assetId={project.coverAssetId} alt={`${project.title} cover`} variant={variant} className="absolute inset-0 size-full" fallback={generated} />
      ) : (
        generated
      )}
    </div>
  );
}
