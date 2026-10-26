const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random 16-character id. Long enough that ids never collide with ordinary text. */
export function uid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Identifies this browser tab, so we can tell our own writes from other tabs'. */
export const SESSION_ID = uid();
