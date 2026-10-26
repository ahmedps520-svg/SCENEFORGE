import { uid } from '../ids';
import type { ElementType, ScriptElement, TitlePage } from '../types';
import { looksLikeHeading, stripSceneNumber } from './heading';

/**
 * Fountain (https://fountain.io) import and export.
 * Supports title pages, forced elements (. ! @ > ~), scene numbers, centered text,
 * transitions, dual-dialogue markers, notes, boneyard, sections and synopses.
 */

export interface ParsedScreenplay {
  titlePage: Partial<TitlePage>;
  elements: ScriptElement[];
}

const TITLE_KEYS: Record<string, keyof TitlePage> = {
  title: 'title',
  credit: 'credit',
  author: 'author',
  authors: 'author',
  source: 'source',
  'draft date': 'draftDate',
  date: 'draftDate',
  contact: 'contact',
};

function el(type: ElementType, text: string): ScriptElement {
  const e: ScriptElement = { id: uid(), type, text };
  if (type === 'scene') e.sceneId = uid();
  return e;
}

function isUpper(line: string): boolean {
  const withoutExt = line.replace(/\(.*?\)/g, '');
  return /\p{L}/u.test(withoutExt) && withoutExt === withoutExt.toUpperCase();
}

function parseTitlePage(lines: string[]): { titlePage: Partial<TitlePage>; consumed: number } {
  const titlePage: Partial<TitlePage> = {};
  if (!lines.length || !/^[A-Za-z][A-Za-z ]*:/.test(lines[0])) return { titlePage, consumed: 0 };
  let i = 0;
  let currentKey: keyof TitlePage | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break;
    const m = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
    if (m) {
      const key = TITLE_KEYS[m[1].trim().toLowerCase()] ?? null;
      currentKey = key;
      if (key && m[2]) titlePage[key] = m[2].trim();
    } else if (currentKey && /^(\s{3,}|\t)/.test(line)) {
      const prev = titlePage[currentKey];
      titlePage[currentKey] = prev ? `${prev}\n${line.trim()}` : line.trim();
    }
  }
  return { titlePage, consumed: i };
}

export function parseFountain(source: string): ParsedScreenplay {
  let text = source.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  text = text.replace(/\/\*[\s\S]*?\*\//g, ''); // boneyard
  text = text.replace(/\[\[[\s\S]*?\]\]/g, ''); // notes
  const allLines = text.split('\n');
  const { titlePage, consumed } = parseTitlePage(allLines);
  const lines = allLines.slice(consumed);

  const elements: ScriptElement[] = [];
  let i = 0;
  const prevBlank = (idx: number) => idx === 0 || !lines[idx - 1].trim();
  const nextBlank = (idx: number) => idx >= lines.length - 1 || !lines[idx + 1].trim();

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      i++;
      continue;
    }
    // Page breaks, sections and synopses carry no printable screenplay content.
    if (/^={3,}$/.test(line) || line.startsWith('#') || /^=(?!=)/.test(line)) {
      i++;
      continue;
    }

    // Centered: > THE END <
    if (line.startsWith('>') && line.endsWith('<')) {
      elements.push(el('centered', line.slice(1, -1).trim()));
      i++;
      continue;
    }
    // Forced transition
    if (line.startsWith('>')) {
      elements.push(el('transition', line.slice(1).trim()));
      i++;
      continue;
    }
    // Forced scene heading (but not "..." ellipsis)
    if (/^\.[^.]/.test(line)) {
      elements.push(el('scene', stripSceneNumber(line.slice(1).trim())));
      i++;
      continue;
    }
    // Scene heading
    if (looksLikeHeading(line) && prevBlank(i)) {
      elements.push(el('scene', stripSceneNumber(line)));
      i++;
      continue;
    }
    // Transition: all caps ending in TO:
    if (isUpper(line) && /TO:$/.test(line) && prevBlank(i) && nextBlank(i)) {
      elements.push(el('transition', line));
      i++;
      continue;
    }
    if (/^(FADE OUT\.?|FADE TO BLACK\.?|CUT TO BLACK\.?)$/.test(line) && prevBlank(i)) {
      elements.push(el('transition', line));
      i++;
      continue;
    }

    // Character cue (forced with @, or all caps followed by dialogue)
    const forcedChar = line.startsWith('@');
    if ((forcedChar || (isUpper(line) && !line.startsWith('!'))) && prevBlank(i) && !nextBlank(i)) {
      const name = (forcedChar ? line.slice(1) : line).replace(/\s*\^$/, '').trim();
      elements.push(el('character', name));
      i++;
      while (i < lines.length && (lines[i].trim() || /^ {2,}$/.test(lines[i]))) {
        const d = lines[i].trim();
        if (d && d.startsWith('(') && d.endsWith(')')) {
          elements.push(el('parenthetical', d));
        } else {
          const last = elements[elements.length - 1];
          // Consecutive dialogue lines form one dialogue element.
          if (last.type === 'dialogue') last.text += '\n' + d;
          else elements.push(el('dialogue', d));
        }
        i++;
      }
      continue;
    }

    // Action (forced with ! or lyrics ~). Consecutive lines form one paragraph.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      let l = lines[i].replace(/\s+$/, '');
      if (para.length === 0 && l.trimStart().startsWith('!')) l = l.trimStart().slice(1);
      if (l.trimStart().startsWith('~')) l = l.trimStart().slice(1).trim();
      para.push(l.trim());
      i++;
      // A heading directly after an action line without a blank line still starts a new element.
      if (i < lines.length && /^\.[^.]/.test(lines[i].trim())) break;
    }
    elements.push(el('action', para.join('\n')));
  }

  return { titlePage, elements };
}

/** Serialise elements to Fountain, forcing element types wherever Fountain would otherwise guess wrong. */
export function toFountain(elements: ScriptElement[], titlePage?: Partial<TitlePage>): string {
  const out: string[] = [];
  if (titlePage) {
    const entries: [string, string | undefined][] = [
      ['Title', titlePage.title],
      ['Credit', titlePage.credit],
      ['Author', titlePage.author],
      ['Source', titlePage.source],
      ['Draft date', titlePage.draftDate],
      ['Contact', titlePage.contact],
    ];
    const lines = entries
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => {
        const parts = v!.trim().split('\n');
        return parts.length === 1 ? `${k}: ${parts[0]}` : `${k}:\n${parts.map((p) => `   ${p}`).join('\n')}`;
      });
    if (lines.length) out.push(lines.join('\n'), '');
  }

  let prev: ElementType | null = null;
  for (const e of elements) {
    const t = e.text.trim();
    if (!t) continue;
    const inSpeech = e.type === 'dialogue' || e.type === 'parenthetical';
    if (prev !== null && !(inSpeech && (prev === 'character' || prev === 'dialogue' || prev === 'parenthetical'))) {
      out.push('');
    }
    switch (e.type) {
      case 'scene': {
        const h = t.toUpperCase();
        out.push(looksLikeHeading(h) ? h : `.${h}`);
        break;
      }
      case 'action': {
        const firstLine = t.split('\n')[0];
        const ambiguous = isUpper(firstLine) || looksLikeHeading(firstLine) || /^[.@>~!#=]/.test(firstLine);
        out.push(ambiguous ? `!${t}` : t);
        break;
      }
      case 'character': {
        const name = t.toUpperCase();
        out.push(isUpper(t) ? name : `@${t}`);
        break;
      }
      case 'parenthetical':
        out.push(t.startsWith('(') ? t : `(${t})`);
        break;
      case 'dialogue':
        // Blank lines inside dialogue would end the speech; Fountain uses two spaces for that.
        out.push(t.replace(/\n\s*\n/g, '\n  \n'));
        break;
      case 'transition': {
        const tr = t.toUpperCase();
        out.push(/TO:$/.test(tr) ? tr : `> ${tr}`);
        break;
      }
      case 'shot':
        out.push(`!${t.toUpperCase()}`);
        break;
      case 'centered':
        out.push(`> ${t} <`);
        break;
    }
    prev = e.type;
  }
  return out.join('\n') + '\n';
}

/**
 * Parse pasted text into elements. Multi-line pastes are treated as Fountain;
 * a single line is left for the caller to insert into the current element.
 */
export function parsePaste(text: string): ScriptElement[] | null {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.includes('\n')) return null;
  const { elements } = parseFountain(normalized);
  return elements.length > 1 ? elements : null;
}
