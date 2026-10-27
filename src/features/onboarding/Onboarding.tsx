import { ArrowRight, FileUp, HardDrive, Layers, Plus, Sparkles, Clapperboard, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CoverArt } from '@/components/CoverArt';
import { Button, cn, Input } from '@/components/ui';
import { loadSettings, updateSettings, useSettings } from '@/lib/data/settings';
import { useSampleLauncher } from '../dashboard/actions';
import { SlateMark } from '../dashboard/StudioBar';

type Step = 'leader' | 'intro' | 'choose';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** First-run experience: a short brand moment, then three ways to begin. */
export default function Onboarding() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(() => (reducedMotion() ? 'intro' : 'leader'));
  const [name, setName] = useState('');
  const nameLoaded = useRef(false);

  useEffect(() => {
    document.title = 'Welcome — SCENEFORGE';
  }, []);

  useEffect(() => {
    if (settings && !nameLoaded.current) {
      nameLoaded.current = true;
      setName(settings.userName);
    }
  }, [settings]);

  const saveName = async () => {
    const current = await loadSettings();
    if (name.trim() !== current.userName) await updateSettings({ userName: name.trim() });
  };

  const finish = async (to: string) => {
    await saveName();
    await updateSettings({ onboardingComplete: true });
    navigate(to);
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#070707] text-[#f1ece2]" data-onboarding>
      {step === 'leader' && <FilmLeader onDone={() => setStep('intro')} />}
      {step !== 'leader' && (
        <>
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <CoverArt seed={911} genres={['Drama']} />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black" />
          <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8 sm:px-8">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2.5">
                <SlateMark />
                <span className="font-mono text-[11.5px] font-semibold tracking-[0.32em]">SCENEFORGE</span>
              </span>
              <button onClick={() => void finish('/')} className="text-[12.5px] text-white/50 underline-offset-4 hover:text-white hover:underline">
                Skip for now
              </button>
            </div>
            {step === 'intro' ? (
              <Intro name={name} setName={setName} onNext={() => void saveName().then(() => setStep('choose'))} />
            ) : (
              <Choose onBack={() => setStep('intro')} finish={finish} name={name} />
            )}
            <StepDots step={step} />
          </div>
        </>
      )}
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="mt-8 flex justify-center gap-2" aria-hidden>
      {(['intro', 'choose'] as const).map((s) => (
        <span key={s} className={cn('h-1 rounded-full transition-all duration-500', s === step ? 'w-8 bg-[var(--c-accent)]' : 'w-3 bg-white/20')} />
      ))}
    </div>
  );
}

/** A two-second academy leader countdown. Any key or click skips it. */
function FilmLeader({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setInterval(() => setN((x) => x - 1), 520);
    const skip = () => done.current();
    window.addEventListener('keydown', skip);
    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', skip);
    };
  }, []);
  useEffect(() => {
    if (n <= 0) done.current();
  }, [n]);
  return (
    <button onClick={onDone} className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]" aria-label="Skip intro">
      <svg viewBox="0 0 200 200" className="size-[min(62vw,340px)]" aria-hidden>
        <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(241,236,226,0.35)" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(241,236,226,0.2)" strokeWidth="1" />
        <line x1="100" y1="0" x2="100" y2="200" stroke="rgba(241,236,226,0.18)" strokeWidth="1" />
        <line x1="0" y1="100" x2="200" y2="100" stroke="rgba(241,236,226,0.18)" strokeWidth="1" />
        <circle
          key={n}
          cx="100"
          cy="100"
          r="83"
          fill="none"
          stroke="#d6a44e"
          strokeWidth="2"
          strokeDasharray={2 * Math.PI * 83}
          transform="rotate(-90 100 100)"
          style={{ animation: 'leader-sweep 0.52s linear forwards' }}
        />
        <text x="100" y="124" textAnchor="middle" fontFamily="Instrument Serif, Georgia, serif" fontSize="76" fill="#f1ece2">
          {Math.max(n, 1)}
        </text>
      </svg>
      <span className="absolute bottom-8 font-mono text-[10px] tracking-[0.3em] text-white/35">PRESS ANY KEY TO SKIP</span>
      <style>{`@keyframes leader-sweep { from { stroke-dashoffset: ${2 * Math.PI * 83}; } to { stroke-dashoffset: 0; } }`}</style>
    </button>
  );
}

function Intro({ name, setName, onNext }: { name: string; setName: (v: string) => void; onNext: () => void }) {
  const points = [
    { icon: <Clapperboard className="size-4" />, title: 'Write and break down', body: 'A real screenplay editor whose scenes flow straight into breakdowns, storyboards and shot lists.' },
    { icon: <Layers className="size-4" />, title: 'Plan the whole shoot', body: 'Characters, locations, cast, schedules and call sheets — all connected, all in one place.' },
    { icon: <HardDrive className="size-4" />, title: 'Private by default', body: 'Projects are stored on this device. Export a backup any time; nothing is uploaded without you.' },
  ];
  return (
    <div className="flex flex-1 flex-col justify-center py-10">
      <div className="eyebrow animate-rise text-[var(--c-accent)]">Your personal film studio</div>
      <h1 className="mt-4 font-display text-[56px] leading-[0.95] tracking-[-0.01em] sm:text-[88px] lg:text-[112px]">
        <span className="block animate-rise [animation-delay:80ms]">Your film,</span>
        <span className="block animate-rise italic text-white/80 [animation-delay:200ms]">from first idea</span>
        <span className="block animate-rise [animation-delay:320ms]">to final shot.</span>
      </h1>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {points.map((p, i) => (
          <div key={p.title} className="animate-rise border-t border-white/15 pt-4" style={{ animationDelay: `${450 + i * 80}ms` }}>
            <div className="flex items-center gap-2 text-[var(--c-accent)]">
              {p.icon}
              <span className="text-[13px] font-medium text-[#f1ece2]">{p.title}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-white/60">{p.body}</p>
          </div>
        ))}
      </div>
      <form
        className="mt-12 flex max-w-lg animate-rise flex-col gap-3 [animation-delay:700ms] sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <div className="flex-1">
          <label htmlFor="onboard-name" className="mb-1.5 block text-[12px] text-white/60">
            What should we call you? <span className="text-white/35">Optional</span>
          </label>
          <Input
            id="onboard-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={60}
            autoComplete="name"
            className="h-11 border-white/20 bg-black/50 text-[#f1ece2] placeholder:text-white/30"
          />
        </div>
        <Button type="submit" variant="primary" size="lg" iconRight={<ArrowRight className="size-4" />}>
          Continue
        </Button>
      </form>
      <p className="mt-3 animate-rise text-[11.5px] text-white/40 [animation-delay:760ms]">Used for credits, comments and activity history. You can change it in Settings.</p>
    </div>
  );
}

function Choose({ onBack, finish, name }: { onBack: () => void; finish: (to: string) => Promise<void>; name: string }) {
  const sample = useSampleLauncher();
  const [pending, setPending] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const options = [
    {
      key: 'new',
      icon: <Plus className="size-5" />,
      title: 'Start a new film',
      body: 'Set the title and as much or as little as you like — everything can be changed later.',
      run: () => finish('/new'),
    },
    {
      key: 'sample',
      icon: <Sparkles className="size-5" />,
      title: 'Explore a sample film',
      body: 'A short film mid pre-production. See how the script, characters, scenes, storyboards and shots connect. Remove it whenever you like.',
      run: () => sample.launch(),
    },
    {
      key: 'import',
      icon: <FileUp className="size-5" />,
      title: 'Import a screenplay',
      body: 'Bring in a Fountain (.fountain) or Final Draft (.fdx) file. Scenes and speaking roles are detected for you.',
      run: () => finish('/import'),
    },
  ];
  return (
    <div className="flex flex-1 flex-col justify-center py-10">
      <div className="eyebrow animate-rise text-[var(--c-accent)]">Scene one</div>
      <h2 className="mt-3 animate-rise font-display text-[44px] leading-none sm:text-[64px] [animation-delay:60ms]">
        {name.trim() ? `Where shall we start, ${name.trim().split(/\s+/)[0]}?` : 'Where shall we start?'}
      </h2>
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {options.map((o, i) => {
          const busy = pending === o.key && (o.key !== 'sample' || sample.busy);
          return (
            <button
              key={o.key}
              ref={i === 0 ? first : undefined}
              disabled={!!pending && busy}
              onClick={async () => {
                setPending(o.key);
                try {
                  await o.run();
                } finally {
                  setPending(null);
                }
              }}
              className="group flex min-h-[230px] animate-rise flex-col items-start gap-3 rounded-md border border-white/15 bg-black/50 p-6 text-left backdrop-blur-sm transition-[border-color,background,transform] duration-300 hover:-translate-y-0.5 hover:border-[var(--c-accent)] hover:bg-black/70 focus-visible:border-[var(--c-accent)]"
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              <span className="flex size-11 items-center justify-center rounded-full border border-white/20 text-[var(--c-accent)]">
                {busy ? <Loader2 className="size-5 animate-spin" /> : o.icon}
              </span>
              <span className="font-display text-[28px] leading-tight">{o.title}</span>
              <span className="text-[13px] leading-relaxed text-white/60">{o.body}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[12.5px] text-white/50 group-hover:text-[var(--c-accent)]">
                {busy ? 'Opening…' : 'Begin'} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-8">
        <button onClick={onBack} className="text-[12.5px] text-white/50 hover:text-white">
          ← Back
        </button>
      </div>
    </div>
  );
}
