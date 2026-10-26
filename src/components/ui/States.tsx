import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center animate-fade-in', compact ? 'py-8 px-4' : 'py-16 px-6', className)}>
      {icon && (
        <div className={cn('mb-4 flex items-center justify-center rounded-full border border-line-strong text-accent', compact ? 'size-10' : 'size-14')}>
          {icon}
        </div>
      )}
      <h3 className={cn('display text-ink', compact ? 'text-xl' : 'text-[28px]')}>{title}</h3>
      {children && <div className="mt-2 max-w-md text-[13.5px] text-muted leading-relaxed">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted', className)} aria-label={label} />;
}

/** Full-area loading state with a subtle film-leader feel. */
export function Loading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-1 items-center justify-center py-24', className)} role="status">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="relative size-9">
          <div className="absolute inset-0 rounded-full border border-line-strong" />
          <div className="absolute inset-0 rounded-full border-t border-accent animate-spin" />
        </div>
        <span className="eyebrow">{label}</span>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-[color-mix(in_srgb,var(--c-ink)_6%,transparent)]', className)} />;
}

export function ErrorState({ title = 'Something went wrong', message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6" role="alert">
      <h3 className="display text-2xl text-ink">{title}</h3>
      {message && <p className="mt-2 max-w-md text-[13.5px] text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
