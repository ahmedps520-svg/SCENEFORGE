import { lazy, Suspense, useEffect } from 'react';
import { setCommandPaletteOpen, useCommandPaletteOpen } from './commands';

const CommandPalette = lazy(() => import('@/features/search/CommandPalette'));

/** Listens for ⌘K / Ctrl+K anywhere and mounts the palette on demand. */
export function CommandPaletteHost() {
  const open = useCommandPaletteOpen();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setCommandPaletteOpen} />
    </Suspense>
  );
}
