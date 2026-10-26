import type { ReactNode } from 'react';
import { cn } from './cn';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[];
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex items-center rounded-sm border border-line-strong bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xs font-medium transition-colors',
            size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12.5px]',
            value === o.value ? 'bg-hover text-ink shadow-[inset_0_0_0_1px_var(--c-line-strong)]' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex items-center gap-5 border-b border-line overflow-x-auto no-scrollbar', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b py-2.5 text-[13px] transition-colors',
            value === t.value ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="font-mono text-[10.5px] text-faint">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
