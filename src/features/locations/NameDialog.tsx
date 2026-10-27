import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, Field, Input } from '@/components/ui';

/**
 * Small "create" dialog that requires a name before a record is made,
 * so lists never fill up with untitled placeholders.
 */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Name',
  placeholder,
  confirmLabel = 'Create',
  onSubmit,
  children,
  requiredMessage = 'A name is required.',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (name: string) => Promise<void> | void;
  children?: ReactNode;
  requiredMessage?: string;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError(requiredMessage);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <Field label={label} error={error}>
          <Input
            autoFocus
            value={name}
            placeholder={placeholder}
            invalid={!!error}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setError(null);
            }}
          />
        </Field>
        {children}
      </form>
    </Dialog>
  );
}
