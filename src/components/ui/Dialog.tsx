import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevent closing on outside click (e.g. forms with unsaved input). */
  modalLock?: boolean;
  className?: string;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', modalLock, className }: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <RD.Content
          onPointerDownOutside={modalLock ? (e) => e.preventDefault() : undefined}
          className={cn(
            'fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-24px)] max-h-[calc(100dvh-32px)] flex flex-col',
            'bg-surface border border-line-strong rounded-md shadow-pop data-[state=open]:animate-pop focus:outline-none',
            SIZES[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <RD.Title className="display text-[24px] text-ink">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-1 text-[13px] text-muted leading-relaxed">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RD.Description>
              )}
            </div>
            <RD.Close className="btn-icon -mr-1.5 -mt-1" aria-label="Close">
              <X className="size-4" />
            </RD.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Side panel for detail editing. Full-screen on phones. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'max-w-xl',
  headerExtra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
  headerExtra?: ReactNode;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in" />
        <RD.Content
          className={cn(
            'fixed z-50 inset-y-0 right-0 w-full flex flex-col bg-panel border-l border-line-strong shadow-pop',
            'data-[state=open]:animate-slide-in-right focus:outline-none',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <RD.Title className="display text-[24px] text-ink truncate">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-[12.5px] text-muted">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">Details</RD.Description>
              )}
            </div>
            <div className="flex items-center gap-1">
              {headerExtra}
              <RD.Close className="btn-icon" aria-label="Close panel">
                <X className="size-4" />
              </RD.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 safe-bottom">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
