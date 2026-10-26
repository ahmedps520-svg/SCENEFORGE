import { jsPDF } from 'jspdf';

/**
 * Shared layout for SCENEFORGE production documents (storyboards, shot
 * lists, call sheets). Screenplays use their own Courier layout.
 * Units are points (72 per inch).
 */

export const INK = '#16140f';
export const MUTED = '#6b665d';
export const FAINT = '#a39d92';
export const RULE = '#d9d4c9';
export const ACCENT = '#9c6a17';

export interface DocOptions {
  orientation?: 'portrait' | 'landscape';
  format?: 'letter' | 'a4';
}

export function createDoc(opts: DocOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: opts.format ?? 'letter', orientation: opts.orientation ?? 'portrait' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(INK);
  return doc;
}

export const MARGIN = 40;

export function pageSize(doc: jsPDF) {
  return { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() };
}

/** Title block at the top of the first page. Returns the y where content starts. */
export function docHeader(doc: jsPDF, opts: { kicker: string; title: string; subtitle?: string; meta?: string[] }): number {
  const { w } = pageSize(doc);
  let y = MARGIN + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(ACCENT);
  doc.text(opts.kicker.toUpperCase().split('').join(' '), MARGIN, y);
  y += 22;
  doc.setFont('times', 'normal');
  doc.setFontSize(24);
  doc.setTextColor(INK);
  const titleLines = doc.splitTextToSize(opts.title, w - MARGIN * 2) as string[];
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 26;
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    const sub = doc.splitTextToSize(opts.subtitle, w - MARGIN * 2) as string[];
    doc.text(sub, MARGIN, y - 6);
    y += sub.length * 13;
  }
  if (opts.meta?.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED);
    doc.text(opts.meta.join('   ·   '), MARGIN, y);
    y += 12;
  }
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, w - MARGIN, y);
  doc.setTextColor(INK);
  return y + 18;
}

/** Footer with project title and page numbers on every page. Call last. */
export function docFooters(doc: jsPDF, label: string) {
  const { w, h } = pageSize(doc);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(FAINT);
    doc.text(`SCENEFORGE  ·  ${label}`, MARGIN, h - 22);
    doc.text(`${i} / ${n}`, w - MARGIN, h - 22, { align: 'right' });
  }
  doc.setTextColor(INK);
}

/** Add a page if `needed` points don't fit below `y`. Returns the y to continue at. */
export function ensureSpace(doc: jsPDF, y: number, needed: number, top = MARGIN + 10): number {
  const { h } = pageSize(doc);
  if (y + needed > h - MARGIN - 20) {
    doc.addPage();
    return top;
  }
  return y;
}

/** Wrapped paragraph; returns the new y. */
export function paragraph(doc: jsPDF, text: string, x: number, y: number, width: number, opts: { size?: number; color?: string; lineHeight?: number; font?: 'normal' | 'bold' | 'italic' } = {}): number {
  const size = opts.size ?? 9.5;
  const lh = opts.lineHeight ?? size * 1.38;
  doc.setFont('helvetica', opts.font ?? 'normal');
  doc.setFontSize(size);
  doc.setTextColor(opts.color ?? INK);
  const lines = doc.splitTextToSize(text || '', width) as string[];
  lines.forEach((line, i) => doc.text(line, x, y + i * lh));
  doc.setTextColor(INK);
  return y + lines.length * lh;
}

export function label(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(FAINT);
  doc.text(text.toUpperCase(), x, y);
  doc.setTextColor(INK);
}

/** Save the PDF via a download. */
export function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
