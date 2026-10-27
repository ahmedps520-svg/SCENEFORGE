import type { jsPDF } from 'jspdf';
import { ACCENT, createDoc, docFooters, docHeader, ensureSpace, FAINT, INK, label, MARGIN, MUTED, pageSize, paragraph, RULE, savePdf } from './common';

/** Everything a call sheet shows. Built once from saved data, used by both the preview and the PDF. */
export interface CallSheetData {
  projectTitle: string;
  eventTitle: string;
  /** e.g. "Day 2 of 5" */
  dayLabel: string;
  dateLabel: string;
  crewCall: string;
  shootingCall: string;
  wrap: string;
  location?: { name: string; address: string; access: string; restrictions: string };
  scenes: { number: string; heading: string; timeOfDay: string; summary: string; pages: string; cast: string }[];
  totalPages: string;
  cast: { name: string; characters: string; call: string }[];
  uncast: string[];
  crew: { name: string; roles: string }[];
  equipment: string;
  notes: string;
  emergency: { name: string; role: string; phone: string }[];
  safetyNotes: string;
  nextDay?: { label: string; detail: string };
}

interface Col {
  label: string;
  width: number;
  align?: 'left' | 'right';
}

/** Table with wrapped cells; repeats the header row after a page break. */
function table(doc: jsPDF, y: number, cols: Col[], rows: string[][]): number {
  const size = 8.6;
  const lh = size * 1.32;
  const pad = 5;
  const drawHeader = (yy: number) => {
    let x = MARGIN;
    doc.setFillColor('#f2efe8');
    doc.rect(MARGIN, yy - 10, cols.reduce((n, c) => n + c.width, 0), 15, 'F');
    for (const c of cols) {
      if (c.align === 'right') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(FAINT);
        doc.text(c.label.toUpperCase(), x + c.width - pad, yy, { align: 'right' });
        doc.setTextColor(INK);
      } else {
        label(doc, c.label, x + pad, yy);
      }
      x += c.width;
    }
    return yy + 12;
  };
  y = drawHeader(y);
  doc.setFontSize(size);
  for (const row of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const cells = row.map((cell, i) => doc.splitTextToSize(cell || '—', cols[i].width - pad * 2) as string[]);
    const h = Math.max(...cells.map((c) => c.length)) * lh + 6;
    const before = y;
    y = ensureSpace(doc, y, h + 4);
    if (y !== before) y = drawHeader(y + 10);
    let x = MARGIN;
    cells.forEach((lines, i) => {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      lines.forEach((ln, k) => {
        if (cols[i].align === 'right') doc.text(ln, x + cols[i].width - pad, y + 4 + k * lh, { align: 'right' });
        else doc.text(ln, x + pad, y + 4 + k * lh);
      });
      x += cols[i].width;
    });
    y += h;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y - 2, MARGIN + cols.reduce((n, c) => n + c.width, 0), y - 2);
  }
  doc.setTextColor(INK);
  return y + 6;
}

function heading(doc: jsPDF, text: string, y: number): number {
  y = ensureSpace(doc, y, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(ACCENT);
  doc.text(text.toUpperCase().split('').join(' '), MARGIN, y);
  doc.setTextColor(INK);
  return y + 14;
}

export function exportCallSheetPdf(d: CallSheetData, filename: string) {
  const doc = createDoc();
  const { w } = pageSize(doc);
  const contentW = w - MARGIN * 2;
  let y = docHeader(doc, {
    kicker: `Call sheet · ${d.dayLabel}`,
    title: d.projectTitle,
    subtitle: d.eventTitle,
    meta: [d.dateLabel],
  });

  // Call times
  const boxW = (contentW - 16) / 3;
  const calls: [string, string][] = [
    ['Crew call', d.crewCall],
    ['Shooting call', d.shootingCall],
    ['Estimated wrap', d.wrap],
  ];
  calls.forEach(([l, v], i) => {
    const x = MARGIN + i * (boxW + 8);
    doc.setDrawColor(i === 0 ? ACCENT : RULE);
    doc.setLineWidth(i === 0 ? 1 : 0.6);
    doc.rect(x, y, boxW, 50);
    label(doc, l, x + 10, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(INK);
    doc.text(v, x + 10, y + 39);
  });
  y += 68;

  // Location + emergency side by side
  const colW = (contentW - 16) / 2;
  const topY = y;
  let ly = topY;
  label(doc, 'Location', MARGIN, ly);
  ly += 13;
  if (d.location) {
    ly = paragraph(doc, d.location.name, MARGIN, ly, colW, { size: 11, font: 'bold' });
    if (d.location.address) ly = paragraph(doc, d.location.address, MARGIN, ly + 1, colW, { color: MUTED });
    if (d.location.access) {
      ly += 5;
      label(doc, 'Access', MARGIN, ly);
      ly = paragraph(doc, d.location.access, MARGIN, ly + 11, colW, { size: 8.8 });
    }
    if (d.location.restrictions) {
      ly += 5;
      label(doc, 'Restrictions', MARGIN, ly);
      ly = paragraph(doc, d.location.restrictions, MARGIN, ly + 11, colW, { size: 8.8 });
    }
  } else {
    ly = paragraph(doc, 'No location set', MARGIN, ly, colW, { color: FAINT });
  }

  const ex = MARGIN + colW + 16;
  let ey = topY;
  label(doc, 'Emergency contacts', ex, ey);
  ey += 13;
  if (d.emergency.length) {
    for (const c of d.emergency) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.text(c.name || '—', ex, ey);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(MUTED);
      doc.text([c.role, c.phone].filter(Boolean).join('  ·  '), ex, ey + 11);
      doc.setTextColor(INK);
      ey += 25;
    }
  } else {
    ey = paragraph(doc, 'None supplied', ex, ey, colW, { color: FAINT });
  }
  if (d.safetyNotes) {
    ey += 3;
    label(doc, 'Safety', ex, ey);
    ey = paragraph(doc, d.safetyNotes, ex, ey + 11, colW, { size: 8.8 });
  }
  y = Math.max(ly, ey) + 20;

  // Scenes
  y = heading(doc, `Scenes · ${d.totalPages} pages`, y);
  if (d.scenes.length) {
    y = table(
      doc,
      y,
      [
        { label: 'Sc', width: 34 },
        { label: 'Set', width: 150 },
        { label: 'Description', width: contentW - 34 - 150 - 46 - 44 - 110 },
        { label: 'D/N', width: 46 },
        { label: 'Pages', width: 44, align: 'right' },
        { label: 'Cast', width: 110 },
      ],
      d.scenes.map((s) => [s.number, s.heading, s.summary, s.timeOfDay, s.pages, s.cast]),
    );
  } else {
    y = paragraph(doc, 'No scenes scheduled for this day.', MARGIN, y, contentW, { color: FAINT }) + 8;
  }

  // Cast
  y = heading(doc, 'Cast', y + 6);
  if (d.cast.length) {
    y = table(
      doc,
      y,
      [
        { label: 'Cast member', width: contentW * 0.38 },
        { label: 'Character', width: contentW * 0.42 },
        { label: 'Call', width: contentW * 0.2, align: 'right' },
      ],
      d.cast.map((c) => [c.name, c.characters, c.call]),
    );
  } else {
    y = paragraph(doc, 'No cast assigned to these scenes.', MARGIN, y, contentW, { color: FAINT }) + 8;
  }
  if (d.uncast.length) y = paragraph(doc, `Not yet cast: ${d.uncast.join(', ')}`, MARGIN, y, contentW, { size: 8.5, color: MUTED }) + 6;

  // Crew
  y = heading(doc, 'Crew', y + 6);
  if (d.crew.length) {
    y = table(
      doc,
      y,
      [
        { label: 'Name', width: contentW * 0.45 },
        { label: 'Role', width: contentW * 0.55 },
      ],
      d.crew.map((c) => [c.name, c.roles]),
    );
  } else {
    y = paragraph(doc, 'No crew listed for this day.', MARGIN, y, contentW, { color: FAINT }) + 8;
  }

  if (d.equipment.trim()) {
    y = heading(doc, 'Equipment', y + 6);
    y = paragraph(doc, d.equipment, MARGIN, y, contentW) + 6;
  }
  if (d.notes.trim()) {
    y = heading(doc, 'Notes', y + 6);
    y = paragraph(doc, d.notes, MARGIN, y, contentW) + 6;
  }
  if (d.nextDay) {
    y = heading(doc, 'Advance schedule', y + 6);
    y = paragraph(doc, `${d.nextDay.label} — ${d.nextDay.detail}`, MARGIN, y, contentW, { color: MUTED });
  }

  docFooters(doc, `${d.projectTitle} · Call sheet · ${d.dateLabel}`);
  savePdf(doc, filename);
}
