import { Lightbulb, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { dismissTip, useSettings } from '@/lib/data/settings';
import { cn } from './cn';

/** Section header used at the top of every workspace screen. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn('flex flex-col gap-4 pb-5', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1 className="display text-[34px] sm:text-[40px] text-ink">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[13.5px] text-muted leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** One-line contextual guidance, dismissed permanently per tip id. */
export function Tip({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const settings = useSettings();
  if (!settings || settings.dismissedTips.includes(id)) return null;
  return (
    <div className={cn('flex items-start gap-3 rounded-md border border-line bg-accent-soft/60 px-3.5 py-2.5 text-[12.5px] text-muted animate-fade-in', className)}>
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      <button onClick={() => void dismissTip(id)} className="shrink-0 text-faint hover:text-ink" aria-label="Dismiss tip">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Section({ title, actions, children, className, description }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; description?: ReactNode }) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="eyebrow text-muted">{title}</h2>
          {description && <p className="mt-1 text-[12.5px] text-faint">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Small "label: value" stat used in headers and cards. */
export function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-mono text-[15px] text-ink">{value}</div>
    </div>
  );
}

/** Standard padded, width-limited container for workspace pages. */
export function PageContainer({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:px-10 lg:py-8 animate-fade-in', wide ? 'max-w-[1680px]' : 'max-w-[1320px]', className)}>{children}</div>;
}
