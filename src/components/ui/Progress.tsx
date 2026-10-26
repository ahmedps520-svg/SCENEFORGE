import { cn } from './cn';

export function ProgressBar({ value, className, tone = 'accent', label }: { value: number; className?: string; tone?: 'accent' | 'success' | 'muted'; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--c-ink)_9%,transparent)]', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-[var(--ease-film)]',
          tone === 'accent' && 'bg-accent',
          tone === 'success' && 'bg-success',
          tone === 'muted' && 'bg-muted',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProgressRing({ value, size = 44, stroke = 3, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct * 100)}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--c-ink) 10%, transparent)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute font-mono text-[10.5px] text-ink">{Math.round(pct * 100)}</span>
    </div>
  );
}
