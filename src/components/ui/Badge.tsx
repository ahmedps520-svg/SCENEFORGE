import type { ReactNode } from 'react';
import type { Tone } from '@/lib/constants';
import { cn } from './cn';

const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-muted border-line-strong',
  accent: 'bg-accent-soft text-accent border-[color-mix(in_srgb,var(--c-accent)_30%,transparent)]',
  success: 'bg-success-soft text-success border-[color-mix(in_srgb,var(--c-success)_28%,transparent)]',
  warning: 'bg-warning-soft text-warning border-[color-mix(in_srgb,var(--c-warning)_28%,transparent)]',
  danger: 'bg-danger-soft text-danger border-[color-mix(in_srgb,var(--c-danger)_30%,transparent)]',
  info: 'bg-info-soft text-info border-[color-mix(in_srgb,var(--c-info)_28%,transparent)]',
  live: 'bg-danger-soft text-live border-[color-mix(in_srgb,var(--c-live)_35%,transparent)]',
};

const DOTS: Record<Tone, string> = {
  neutral: 'bg-faint',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  live: 'bg-live animate-pulse-live',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[22px] px-2 rounded-xs border text-[11.5px] font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral', className }: { tone?: Tone; className?: string }) {
  return <span className={cn('inline-block size-2 rounded-full shrink-0', DOTS[tone], className)} />;
}
