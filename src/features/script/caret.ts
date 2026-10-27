/**
 * Visual-line position of the caret inside a wrapped textarea, measured with
 * a hidden mirror element that copies the textarea's typography and width.
 */

let mirror: HTMLDivElement | null = null;

const COPY = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxSizing',
  'tabSize',
] as const;

function lineHeightOf(style: CSSStyleDeclaration): number {
  const lh = parseFloat(style.lineHeight);
  if (!Number.isNaN(lh)) return lh;
  return parseFloat(style.fontSize) * 1.4;
}

/** Returns the caret's line index and the total number of visual lines. */
export function caretLine(ta: HTMLTextAreaElement): { line: number; lines: number } {
  const style = window.getComputedStyle(ta);
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    Object.assign(mirror.style, {
      position: 'absolute',
      visibility: 'hidden',
      top: '0',
      left: '-9999px',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      wordBreak: 'normal',
    });
    document.body.appendChild(mirror);
  }
  for (const k of COPY) (mirror.style as unknown as Record<string, string>)[k] = style[k] as string;
  mirror.style.width = `${ta.clientWidth}px`;
  const lh = lineHeightOf(style);
  const pos = ta.selectionStart ?? 0;
  mirror.textContent = ta.value.slice(0, pos);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  const line = Math.max(0, Math.round((marker.offsetTop - parseFloat(style.paddingTop || '0')) / lh));
  mirror.textContent = ta.value + '​';
  const lines = Math.max(1, Math.round((mirror.scrollHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0')) / lh));
  return { line, lines };
}

export function caretOnFirstLine(ta: HTMLTextAreaElement): boolean {
  if (ta.selectionStart !== ta.selectionEnd) return false;
  if (!ta.value.slice(0, ta.selectionStart ?? 0).includes('\n') && ta.value.length < 30) return true;
  return caretLine(ta).line === 0;
}

export function caretOnLastLine(ta: HTMLTextAreaElement): boolean {
  if (ta.selectionStart !== ta.selectionEnd) return false;
  if (!ta.value.slice(ta.selectionStart ?? 0).includes('\n') && ta.value.length < 30) return true;
  const { line, lines } = caretLine(ta);
  return line >= lines - 1;
}
