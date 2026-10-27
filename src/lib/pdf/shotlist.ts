import type { jsPDF } from 'jspdf';
import { createDoc, docFooters, docHeader, ensureSpace, FAINT, INK, MARGIN, MUTED, pageSize, RULE, savePdf } from './common';

export interface ShotPdfRow {
  code: string;
  description: string;
  type: string;
  angle: string;
  movement: string;
  lens: string;
  frameRate: string;
  actors: string;
  setup: string;
  film: string;
  priority: string;
  status: string;
  done: boolean;
}

export interface ShotPdfGroup {
  title: string;
  meta?: string;
  rows: ShotPdfRow[];
}

interface Col {
  key: keyof ShotPdfRow;
  label: string;
  /** Share of the available width. */
  w: number;
}

const COLS: Col[] = [
  { key: 'code', label: 'Shot', w: 0.055 },
  { key: 'description', label: 'Description', w: 0.25 },
  { key: 'type', label: 'Type', w: 0.075 },
  { key: 'angle', label: 'Angle', w: 0.075 },
  { key: 'movement', label: 'Move', w: 0.07 },
  { key: 'lens', label: 'Lens / camera', w: 0.1 },
  { key: 'frameRate', label: 'FPS', w: 0.04 },
  { key: 'actors', label: 'Actors', w: 0.12 },
  { key: 'setup', label: 'Setup', w: 0.045 },
  { key: 'film', label: 'Film', w: 0.045 },
  { key: 'priority', label: 'Priority', w: 0.06 },
  { key: 'status', label: 'Status', w: 0.065 },
];

const SIZE = 7.6;
const LH = 9.6;

function headerRow(doc: jsPDF, y: number, xs: number[], widths: number[]) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(FAINT);
  COLS.forEach((c, i) => doc.text(c.label.toUpperCase(), xs[i], y));
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 4, MARGIN + widths.reduce((a, b) => a + b, 0), y + 4);
  doc.setTextColor(INK);
  return y + 14;
}

/** Landscape, grouped shot list built from saved shot data. */
export function exportShotListPdf(opts: {
  projectTitle: string;
  /** e.g. "Grouped by scene" */
  subtitle: string;
  groups: ShotPdfGroup[];
  filename: string;
  format?: 'letter' | 'a4';
}) {
  const doc = createDoc({ orientation: 'landscape', format: opts.format });
  const { w } = pageSize(doc);
  const avail = w - MARGIN * 2;
  const widths = COLS.map((c) => c.w * avail);
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const total = opts.groups.reduce((n, g) => n + g.rows.length, 0);
  const done = opts.groups.reduce((n, g) => n + g.rows.filter((r) => r.done).length, 0);

  let y = docHeader(doc, {
    kicker: 'Shot list',
    title: opts.projectTitle,
    subtitle: opts.subtitle,
    meta: [`${total} shots`, `${done} completed`, `Exported ${new Date().toLocaleDateString()}`],
  });

  if (!opts.groups.length) {
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text('No shots match the current view.', MARGIN, y + 10);
  }

  for (const g of opts.groups) {
    y = ensureSpace(doc, y, 60);
    doc.setFont('times', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(INK);
    doc.text(g.title, MARGIN, y);
    if (g.meta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED);
      doc.text(g.meta, w - MARGIN, y, { align: 'right' });
    }
    y = headerRow(doc, y + 14, xs, widths);

    for (const r of g.rows) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(SIZE);
      const cells = COLS.map((c, i) => doc.splitTextToSize(String(r[c.key] ?? ''), widths[i] - 6) as string[]);
      const lines = Math.max(1, ...cells.map((c) => c.length));
      const h = lines * LH + 4;
      const before = y;
      y = ensureSpace(doc, y, h + 4);
      if (y < before) y = headerRow(doc, y, xs, widths);
      cells.forEach((c, i) => {
        if (COLS[i].key === 'code') doc.setFont('helvetica', 'bold');
        else doc.setFont('helvetica', 'normal');
        doc.setTextColor(r.done && COLS[i].key !== 'status' ? MUTED : INK);
        c.forEach((line, li) => doc.text(line, xs[i], y + li * LH));
      });
      doc.setDrawColor(RULE);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, y + h - LH + 2, MARGIN + avail, y + h - LH + 2);
      y += h;
    }
    y += 14;
  }

  docFooters(doc, `${opts.projectTitle} — Shot list`);
  savePdf(doc, opts.filename);
}
