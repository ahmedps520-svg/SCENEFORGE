import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  optional,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  optional?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="label">
            {label}
            {optional && <span className="ml-1.5 font-normal text-faint">Optional</span>}
          </label>
          {aside}
        </div>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-faint leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn('input', invalid && 'input-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} className={cn('input', invalid && 'input-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn('input', className)} {...rest}>
      {children}
    </select>
  );
});

/**
 * Debounced persistence for a single value. Local edits show immediately,
 * are written after `delay` ms of quiet, and are flushed on blur and unmount
 * so moving to another screen never loses typing.
 */
export function useAutosave<T>(value: T, save: (v: T) => void | Promise<void>, delay = 500) {
  const [local, setLocal] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(local);
  const saveRef = useRef(save);
  saveRef.current = save;

  // Adopt external changes when the user isn't mid-edit.
  useEffect(() => {
    if (!dirty.current) {
      setLocal(value);
      latest.current = value;
    }
  }, [value]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (dirty.current) {
      dirty.current = false;
      void saveRef.current(latest.current);
    }
  };

  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (v: T) => {
    setLocal(v);
    latest.current = v;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  return { value: local, change, flush };
}

interface AutoTextProps {
  value: string;
  onSave: (v: string) => void | Promise<void>;
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  /** Rejects empty values with this message instead of saving them. */
  required?: string;
  className?: string;
  inputClassName?: string;
  optional?: boolean;
  type?: string;
  autoFocus?: boolean;
  maxLength?: number;
  readOnly?: boolean;
}

/** A labelled text field that saves itself as you type. */
export function AutoText({
  value,
  onSave,
  label,
  hint,
  placeholder,
  multiline,
  rows = 3,
  required,
  className,
  inputClassName,
  optional,
  type = 'text',
  autoFocus,
  maxLength,
  readOnly,
}: AutoTextProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const { value: v, change, flush } = useAutosave(value, async (next: string) => {
    if (required && !next.trim()) return;
    await onSave(next);
  });
  const onChange = (next: string) => {
    if (required && !next.trim()) setError(required);
    else setError(null);
    change(next);
  };
  const onBlur = () => {
    flush();
    if (required && !v.trim()) {
      setError(null);
      change(value);
    }
  };
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className} optional={optional}>
      {multiline ? (
        <Textarea
          id={id}
          value={v}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          invalid={!!error}
          className={inputClassName}
          autoFocus={autoFocus}
          maxLength={maxLength}
          readOnly={readOnly}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={v}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          invalid={!!error}
          className={inputClassName}
          autoFocus={autoFocus}
          maxLength={maxLength}
          readOnly={readOnly}
        />
      )}
    </Field>
  );
}

/** Toggle switch. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'bg-accent border-accent' : 'bg-raised border-line-strong',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full shadow transition-transform duration-200',
            checked ? 'translate-x-[18px] bg-accent-ink' : 'translate-x-[2px] bg-muted',
          )}
        />
      </button>
      {(label || description) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
          {label && <span className="block text-[13px] text-ink">{label}</span>}
          {description && <span className="block text-[12px] text-faint">{description}</span>}
        </label>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('inline-flex items-center gap-2 cursor-pointer select-none', disabled && 'opacity-50', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded-xs accent-[var(--c-accent)]"
      />
      {label && <span className="text-[13px]">{label}</span>}
    </label>
  );
}
