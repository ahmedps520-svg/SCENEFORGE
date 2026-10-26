import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Input } from './Field';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Require typing this text to confirm (for irreversible, large deletes). */
  typeToConfirm?: string;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setTyped('');
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const blocked = !!opts?.typeToConfirm && typed.trim() !== opts.typeToConfirm.trim();

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!opts}
        onOpenChange={(o) => !o && close(false)}
        title={opts?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {opts?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)} autoFocus={!opts?.typeToConfirm}>
              {opts?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {opts?.message && <div className="text-[13.5px] text-muted leading-relaxed">{opts.message}</div>}
        {opts?.typeToConfirm && (
          <div className="mt-4">
            <p className="mb-2 text-[12.5px] text-muted">
              Type <span className="font-mono text-ink">{opts.typeToConfirm}</span> to confirm.
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !blocked) close(true);
              }}
            />
          </div>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useConfirm must be used inside ConfirmProvider');
  return fn;
}
