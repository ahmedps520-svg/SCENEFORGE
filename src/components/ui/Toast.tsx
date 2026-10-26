import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { cn } from './cn';

type Kind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
  detail?: string;
  action?: { label: string; onClick: () => void | Promise<void> };
  duration: number;
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(
  message: string,
  opts: { kind?: Kind; detail?: string; action?: ToastItem['action']; duration?: number } = {},
) {
  const id = ++seq;
  const item: ToastItem = {
    id,
    kind: opts.kind ?? 'success',
    message,
    detail: opts.detail,
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 8000 : opts.kind === 'error' ? 7000 : 3500),
  };
  items = [...items.slice(-3), item];
  emit();
  return id;
}

toast.error = (message: string, detail?: string) => toast(message, { kind: 'error', detail });
toast.info = (message: string, detail?: string) => toast(message, { kind: 'info', detail });

/** Report a caught error to the user in plain language. */
export function toastError(e: unknown, fallback = 'That didn’t work') {
  const msg = e instanceof Error ? e.message : String(e);
  toast(fallback, { kind: 'error', detail: msg });
}

/** Toast with an Undo button for destructive actions. */
export function toastUndo(message: string, undo: () => Promise<void>) {
  toast(message, {
    action: {
      label: 'Undo',
      onClick: async () => {
        try {
          await undo();
          toast('Restored');
        } catch (e) {
          toastError(e, 'Couldn’t undo');
        }
      },
    },
  });
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
  );
}

function ToastView({ t }: { t: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration]);
  const Icon = t.kind === 'error' ? AlertCircle : t.kind === 'info' ? Info : CheckCircle2;
  return (
    <div
      role={t.kind === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-md border border-line-strong bg-raised px-3.5 py-3 shadow-pop animate-rise"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', t.kind === 'error' ? 'text-danger' : t.kind === 'info' ? 'text-info' : 'text-success')} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">{t.message}</p>
        {t.detail && <p className="mt-0.5 text-[12px] text-muted break-words">{t.detail}</p>}
      </div>
      {t.action && (
        <button
          className="shrink-0 text-[12.5px] font-medium text-accent hover:underline"
          onClick={() => {
            dismiss(t.id);
            void t.action!.onClick();
          }}
        >
          {t.action.label}
        </button>
      )}
      <button className="shrink-0 text-faint hover:text-ink" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const list = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:items-end sm:pb-4 max-md:bottom-14"
    >
      {list.map((t) => (
        <ToastView key={t.id} t={t} />
      ))}
    </div>
  );
}
