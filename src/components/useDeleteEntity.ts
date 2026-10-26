import { useConfirm, toastError, toastUndo } from './ui';
import { deleteEntity } from '@/lib/data/deletes';
import type { EntityType } from '@/lib/types';

/**
 * Confirm (optionally), delete with full reference cleanup, and offer Undo.
 * Resolves true when the record was deleted.
 */
export function useDeleteEntity() {
  const confirm = useConfirm();
  return async (
    type: Exclude<EntityType, 'project' | 'script'>,
    id: string,
    opts: { confirmTitle?: string; confirmMessage?: string; skipConfirm?: boolean } = {},
  ): Promise<boolean> => {
    if (!opts.skipConfirm) {
      const ok = await confirm({
        title: opts.confirmTitle ?? 'Delete this?',
        message: opts.confirmMessage ?? 'You can undo this right after.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return false;
    }
    try {
      const { summary, restore } = await deleteEntity(type, id);
      toastUndo(summary, restore);
      return true;
    } catch (e) {
      toastError(e, 'Couldn’t delete');
      return false;
    }
  };
}
