import type { ElementType, ScriptElement } from '../types';

/**
 * Industry-standard screenplay layout, measured in Courier 12pt characters
 * (10 characters per inch, 6 lines per inch). The same layout drives the
 * editor's page markers, runtime estimates and the PDF export, so they agree.
 */
export interface ElementLayout {
  /** Left edge in inches from the page edge. */
  left: number;
  /** Maximum characters per line. */
  width: number;
  /** Blank lines before the element (dropped at the top of a page). */
  before: number;
  align: 'left' | 'right' | 'center';
  upper: boolean;
}

export const LAYOUT: Record<ElementType, ElementLayout> = {
  scene: { left: 1.5, width: 60, before: 2, align: 'left', upper: true },
  action: { left: 1.5, width: 60, before: 1, align: 'left', upper: false },
  character: { left: 3.7, width: 38, before: 1, align: 'left', upper: true },
  parenthetical: { left: 3.1, width: 25, before: 0, align: 'left', upper: false },
  dialogue: { left: 2.5, width: 35, before: 0, align: 'left', upper: false },
  transition: { left: 5.5, width: 20, before: 1, align: 'right', upper: true },
  shot: { left: 1.5, width: 60, before: 1, align: 'left', upper: true },
  centered: { left: 1.5, width: 60, before: 1, align: 'center', upper: false },
};

export const PAGE_SIZES = {
  letter: { widthIn: 8.5, heightIn: 11, lines: 54 },
  a4: { widthIn: 8.27, heightIn: 11.69, lines: 58 },
} as const;

export type PageSize = keyof typeof PAGE_SIZES;

export interface PageLine {
  text: string;
  /** 'more' and 'contd' are synthetic lines inserted when dialogue breaks across pages. */
  kind: ElementType | 'more' | 'blank';
  left: number;
  width: number;
  align: 'left' | 'right' | 'center';
  elementId?: string;
  sceneNumber?: string;
}

export interface Pagination {
  pages: PageLine[][];
  /** Page (1-based) on which each element starts. */
  elementPage: Map<string, number>;
  linesPerPage: number;
  /** Lines used on the last page. */
  lastPageLines: number;
}

/** Remove Fountain emphasis markers for display/print. */
export function plainText(text: string): string {
  return text.replace(/\\\*/g, '\u0000').replace(/\*{1,3}|_(?=\S)|(?<=\S)_/g, '').replace(/\u0000/g, '*');
}

/** Word-wrap text to `width` characters, honouring explicit newlines. */
export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= width) line += ' ' + w;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

export function displayText(el: Pick<ScriptElement, 'type' | 'text'>): string {
  let t = plainText(el.text).trim();
  if (el.type === 'parenthetical' && t && !t.startsWith('(')) t = `(${t})`;
  if (LAYOUT[el.type].upper) t = t.toUpperCase();
  return t;
}

interface Block {
  el: ScriptElement;
  lines: string[];
  before: number;
}

interface Group {
  blocks: Block[];
  /** Speech groups (character + dialogue) split with (MORE)/(CONT'D). */
  speech: boolean;
  /** Headings keep with the following group. */
  keepWithNext: boolean;
}

function toBlocks(elements: ScriptElement[]): Block[] {
  const blocks: Block[] = [];
  for (const el of elements) {
    const text = displayText(el);
    if (!text) continue;
    const lay = LAYOUT[el.type];
    blocks.push({ el, lines: wrapText(text, lay.width), before: lay.before });
  }
  return blocks;
}

function toGroups(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.el.type === 'character') {
      const g: Group = { blocks: [b], speech: true, keepWithNext: false };
      i++;
      while (i < blocks.length && (blocks[i].el.type === 'dialogue' || blocks[i].el.type === 'parenthetical')) {
        g.blocks.push(blocks[i]);
        i++;
      }
      groups.push(g);
      continue;
    }
    groups.push({ blocks: [b], speech: false, keepWithNext: b.el.type === 'scene' || b.el.type === 'shot' });
    i++;
  }
  return groups;
}

function lineFor(block: Block, text: string, sceneNumber?: string): PageLine {
  const lay = LAYOUT[block.el.type];
  return {
    text,
    kind: block.el.type,
    left: lay.left,
    width: lay.width,
    align: lay.align,
    elementId: block.el.id,
    sceneNumber,
  };
}

const BLANK: PageLine = { text: '', kind: 'blank', left: 1.5, width: 60, align: 'left' };

function groupHeight(g: Group, atTop: boolean): number {
  let h = 0;
  g.blocks.forEach((b, i) => {
    h += (i === 0 && atTop ? 0 : b.before) + b.lines.length;
  });
  return h;
}

export function paginate(
  elements: ScriptElement[],
  opts: { pageSize?: PageSize; sceneNumbers?: Map<string, string> } = {},
): Pagination {
  const linesPerPage = PAGE_SIZES[opts.pageSize ?? 'letter'].lines;
  const groups = toGroups(toBlocks(elements));
  const pages: PageLine[][] = [[]];
  const elementPage = new Map<string, number>();
  let page = pages[0];

  const remaining = () => linesPerPage - page.length;
  const newPage = () => {
    page = [];
    pages.push(page);
  };
  const sceneNo = (b: Block) => (b.el.type === 'scene' && b.el.sceneId ? opts.sceneNumbers?.get(b.el.sceneId) : undefined);
  const mark = (b: Block) => {
    if (!elementPage.has(b.el.id)) elementPage.set(b.el.id, pages.length);
  };
  const place = (b: Block, lines: string[], withSpacing: boolean) => {
    if (withSpacing && page.length > 0) for (let k = 0; k < b.before; k++) page.push(BLANK);
    mark(b);
    lines.forEach((t, idx) => page.push(lineFor(b, t, idx === 0 ? sceneNo(b) : undefined)));
  };

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const atTop = page.length === 0;
    let need = groupHeight(g, atTop);
    if (g.keepWithNext && groups[gi + 1]) {
      // A heading must be followed by at least two lines of what comes next.
      const next = groups[gi + 1];
      need += next.blocks[0].before + Math.min(2, next.blocks[0].lines.length);
    }

    if (need <= remaining()) {
      g.blocks.forEach((b, i) => place(b, b.lines, i > 0 || !atTop));
      continue;
    }

    if (g.keepWithNext || (!g.speech && g.blocks[0].lines.length < 4)) {
      if (!atTop) newPage();
      g.blocks.forEach((b) => place(b, b.lines, page.length > 0));
      continue;
    }

    if (!g.speech) {
      // Split a long action paragraph, keeping at least two lines on each side.
      const b = g.blocks[0];
      const space = remaining() - (atTop ? 0 : b.before);
      if (space >= 2 && b.lines.length - space >= 2) {
        place(b, b.lines.slice(0, space), !atTop);
        let rest = b.lines.slice(space);
        while (rest.length) {
          newPage();
          const chunk = rest.slice(0, linesPerPage);
          chunk.forEach((t) => page.push(lineFor(b, t)));
          rest = rest.slice(linesPerPage);
        }
      } else {
        if (!atTop) newPage();
        place(b, b.lines, false);
        let overflow = page.length - linesPerPage;
        while (overflow > 0) {
          const extra = page.splice(linesPerPage);
          newPage();
          page.push(...extra);
          overflow = page.length - linesPerPage;
        }
      }
      continue;
    }

    // Speech: split with (MORE) / (CONT'D) when at least cue + 2 lines + (MORE) fit.
    const cue = g.blocks[0];
    const body: { block: Block; line: string }[] = [];
    g.blocks.slice(1).forEach((b) => b.lines.forEach((line) => body.push({ block: b, line })));
    const headroom = remaining() - (atTop ? 0 : cue.before) - cue.lines.length - 1;
    if (headroom >= 2 && body.length - headroom >= 1) {
      place(cue, cue.lines, !atTop);
      let idx = 0;
      const flush = (count: number) => {
        for (let k = 0; k < count && idx < body.length; k++, idx++) {
          const { block, line } = body[idx];
          mark(block);
          page.push(lineFor(block, line));
        }
      };
      flush(headroom);
      while (idx < body.length) {
        page.push({ text: '(MORE)', kind: 'more', left: LAYOUT.character.left, width: 38, align: 'left' });
        newPage();
        const name = cue.lines[0].replace(/\s*\(CONT'D\)\s*$/i, '');
        page.push({ ...lineFor(cue, `${name} (CONT'D)`), elementId: undefined });
        const left = body.length - idx;
        const space = linesPerPage - page.length;
        flush(left > space ? space - 1 : left);
      }
    } else {
      if (!atTop) newPage();
      g.blocks.forEach((b, i) => place(b, b.lines, i > 0));
    }
  }

  if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  return { pages, elementPage, linesPerPage, lastPageLines: pages[pages.length - 1].length };
}

export interface ScriptStats {
  wordCount: number;
  /** Fractional page count, e.g. 12.4. */
  pages: number;
  /** Whole printed pages. */
  pageCount: number;
  /** Runtime estimate in seconds, at the standard one page per minute. */
  runtimeSec: number;
  sceneCount: number;
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function scriptStats(elements: ScriptElement[], pageSize: PageSize = 'letter'): ScriptStats {
  const words = elements.reduce((n, el) => n + countWords(el.text), 0);
  const hasContent = elements.some((el) => el.text.trim());
  if (!hasContent) return { wordCount: 0, pages: 0, pageCount: 0, runtimeSec: 0, sceneCount: 0 };
  const p = paginate(elements, { pageSize });
  const pages = p.pages.length - 1 + p.lastPageLines / p.linesPerPage;
  return {
    wordCount: words,
    pages,
    pageCount: p.pages.length,
    runtimeSec: Math.round(pages * 60),
    sceneCount: elements.filter((e) => e.type === 'scene' && e.text.trim()).length,
  };
}

/** Lines each scene occupies (heading through the line before the next heading). */
export function sceneLengths(elements: ScriptElement[], pageSize: PageSize = 'letter'): Map<string, { lines: number; eighths: number; seconds: number }> {
  const linesPerPage = PAGE_SIZES[pageSize].lines;
  const out = new Map<string, { lines: number; eighths: number; seconds: number }>();
  let current: string | undefined;
  let lines = 0;
  const commit = () => {
    if (!current) return;
    const eighths = Math.max(1, Math.ceil((lines / linesPerPage) * 8));
    out.set(current, { lines, eighths, seconds: Math.round((lines / linesPerPage) * 60) });
  };
  for (const el of elements) {
    if (el.type === 'scene') {
      commit();
      current = el.sceneId;
      lines = 0;
    }
    const text = displayText(el);
    if (!text) continue;
    const lay = LAYOUT[el.type];
    lines += lay.before + wrapText(text, lay.width).length;
  }
  commit();
  return out;
}

/** Page length in eighths, formatted the way production boards show it: "1 3/8". */
export function formatEighths(eighths: number): string {
  if (eighths <= 0) return '0';
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (!rem) return `${whole}`;
  return whole ? `${whole} ${rem}/8` : `${rem}/8`;
}
