import { jsPDF } from 'jspdf';
import { revisionColor } from '../constants';
import { slug } from '../download';
import { paginate, PAGE_SIZES, plainText, type PageSize } from '../screenplay/paginate';
import type { Project, Script } from '../types';

/**
 * Screenplay PDF in standard format: Courier 12pt, 6 lines per inch, 1.5"
 * left margin, page numbers top right from page 2, optional scene numbers on
 * both sides, and a title page.
 */

export interface ScreenplayPdfOptions {
  script: Script;
  project: Project;
  pageSize: PageSize;
  /** sceneId → number, as shown in the editor. */
  sceneNumbers: Map<string, string>;
  showSceneNumbers: boolean;
  includeTitlePage: boolean;
}

const PT = 72;
const LINE = 12;
const TOP = 1 * PT;

function baseline(lineIndex: number): number {
  // Courier ascent ≈ 9pt; first line sits one inch from the top edge.
  return TOP + lineIndex * LINE + 9;
}

function titlePage(doc: jsPDF, script: Script, project: Project, size: { widthIn: number; heightIn: number }) {
  const tp = script.titlePage;
  const W = size.widthIn * PT;
  const H = size.heightIn * PT;
  const center = W / 2;
  doc.setFont('courier', 'normal');
  doc.setFontSize(12);
  let y = H / 3;
  const title = (tp.title || project.title || 'Untitled').toUpperCase();
  for (const line of doc.splitTextToSize(title, 6 * PT) as string[]) {
    doc.text(line, center, y, { align: 'center' });
    y += LINE;
  }
  y += LINE * 3;
  if (tp.credit) {
    doc.text(tp.credit, center, y, { align: 'center' });
    y += LINE * 2;
  }
  if (tp.author) {
    for (const line of tp.author.split('\n')) {
      doc.text(line, center, y, { align: 'center' });
      y += LINE;
    }
  }
  if (tp.source) {
    y += LINE * 2;
    for (const line of doc.splitTextToSize(tp.source, 5 * PT) as string[]) {
      doc.text(line, center, y, { align: 'center' });
      y += LINE;
    }
  }
  const bottom: string[] = [];
  if (tp.draftDate) bottom.push(tp.draftDate);
  if (tp.contact) bottom.push(...tp.contact.split('\n'));
  let by = H - PT - (bottom.length - 1) * LINE;
  for (const line of bottom) {
    doc.text(line, 1.5 * PT, by);
    by += LINE;
  }
}

/** Build the document without saving it (used by export and tests). */
export function buildScreenplayPdf(opts: ScreenplayPdfOptions): jsPDF {
  const { script, project } = opts;
  const size = PAGE_SIZES[opts.pageSize];
  const doc = new jsPDF({ unit: 'pt', format: opts.pageSize === 'a4' ? 'a4' : 'letter', orientation: 'portrait' });
  doc.setProperties({ title: `${project.title} — ${script.title}`, creator: 'SCENEFORGE' });
  doc.setTextColor(0, 0, 0);

  if (opts.includeTitlePage) titlePage(doc, script, project, size);

  const p = paginate(script.elements, { pageSize: opts.pageSize, sceneNumbers: opts.sceneNumbers });
  const rev = revisionColor(script.revisionColor);
  const revLabel = script.revisionColor !== 'white' ? `${rev.label} Revision` : '';
  const W = size.widthIn * PT;

  p.pages.forEach((lines, pageIdx) => {
    if (pageIdx > 0 || opts.includeTitlePage) doc.addPage();
    const pageNo = pageIdx + 1;
    doc.setFont('courier', 'normal');
    doc.setFontSize(12);
    if (pageNo > 1) doc.text(`${pageNo}.`, 7.5 * PT, 0.5 * PT + 9, { align: 'right' });
    if (revLabel) {
      doc.setFontSize(10);
      doc.text(`${revLabel} — ${new Date(script.updatedAt).toLocaleDateString()}`, 1.5 * PT, 0.5 * PT + 9);
      doc.setFontSize(12);
    }
    lines.forEach((line, i) => {
      if (line.kind === 'blank' || !line.text) return;
      const y = baseline(i);
      const text = plainText(line.text);
      const left = line.left * PT;
      if (line.align === 'right') doc.text(text, left + (line.width / 10) * PT, y, { align: 'right' });
      else if (line.align === 'center') doc.text(text, left + (line.width / 20) * PT, y, { align: 'center' });
      else doc.text(text, left, y);
      if (line.sceneNumber && opts.showSceneNumbers) {
        doc.text(line.sceneNumber, 1.5 * PT - 0.35 * PT, y, { align: 'right' });
        doc.text(line.sceneNumber, Math.min(W - 0.4 * PT, 7.5 * PT + 0.35 * PT), y);
      }
    });
  });
  return doc;
}

export function exportScreenplayPdf(opts: ScreenplayPdfOptions) {
  const doc = buildScreenplayPdf(opts);
  doc.save(`${slug(opts.project.title)}-${slug(opts.script.title)}.pdf`);
}
