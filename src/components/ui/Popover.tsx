import * as RP from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'start',
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <RP.Root open={open} onOpenChange={onOpenChange}>
      <RP.Trigger asChild>{trigger}</RP.Trigger>
      <RP.Portal>
        <RP.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn('z-[60] rounded-md border border-line-strong bg-raised shadow-pop data-[state=open]:animate-pop focus:outline-none', className)}
        >
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}

export const PopoverClose = RP.Close;
