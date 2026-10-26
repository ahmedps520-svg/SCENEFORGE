import * as DM from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Menu({
  trigger,
  children,
  align = 'end',
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-[60] min-w-[200px] max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
            'rounded-md border border-line-strong bg-raised p-1 shadow-pop data-[state=open]:animate-pop',
            className,
          )}
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
  shortcut,
  checked,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  checked?: boolean;
}) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex items-center gap-2.5 rounded-sm px-2 h-8 text-[13px] outline-none select-none cursor-pointer',
        'data-[highlighted]:bg-hover data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      <span className="flex size-4 items-center justify-center text-muted">{checked ? <Check className="size-3.5 text-accent" /> : icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="font-mono text-[10.5px] text-faint">{shortcut}</span>}
    </DM.Item>
  );
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pt-2 pb-1 eyebrow">{children}</DM.Label>;
}
