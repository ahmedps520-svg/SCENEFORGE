import { useSyncExternalStore } from 'react';

/** Global open state for the command palette (⌘K / Ctrl+K). */
let open = false;
const listeners = new Set<() => void>();

export function openCommandPalette() {
  open = true;
  listeners.forEach((l) => l());
}

export function setCommandPaletteOpen(v: boolean) {
  open = v;
  listeners.forEach((l) => l());
}

export function useCommandPaletteOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
  );
}
