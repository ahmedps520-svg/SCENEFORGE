import type { jsPDF } from 'jspdf';
import { angleLabel, movementLabel, shotTypeLabel } from '../constants';
import { assetAsDataUrl } from '../data/assets';
import type { Project, Scene, StoryboardFrame } from '../types';
import { createDoc, docFooters, docHeader, FAINT, INK, label, MARGIN, MUTED, pageSize, RULE, savePdf } from './common';

export interface StoryboardPdfOptions {
  project: Project;
  scenes: Scene[];
  frames: StoryboardFrame[];
  sceneNumbers: Map<string, string>;
  frameNumbers: Map<string, string>;
  /** Limit to these scenes (in story order). Defaults to every scene with frames. */
  sceneIds?: string[];
  layout: 'grid' | 'detail';
}

const IMG_CACHE_PX = 1400;

/** Draw an image (or a placeholder) letterboxed into a 16:9 box. */
async function drawFrameImage(doc: jsPDF, frame: StoryboardFrame, x: number, y: number, w: number, h: number) {
  doc.setFillColor('#f1eee8');
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.6);
  doc.rect(x, y, w, h, 'FD');
  const img = frame.imageAssetId ? await assetAsDataUrl(frame.imageAssetId, IMG_CACHE_PX) : null;
  if (img) {
    const scale = Math.min(w / img.width, h / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    doc.addImage(img.dataUrl, 'JPEG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
    doc.setDrawColor(RULE);
    doc.rect(x, y, w, h, 'S');
  } else {
    // Rule-of-thirds guides, so blank frames still read as a frame.
    doc.setDrawColor('#e0dbd1');
    doc.setLineWidth(0.4);
    for (const f of [1 / 3, 2 / 3]) {
      doc.line(x + w * f, y + 6, x + w * f, y + h - 6);
      doc.line(x + 6, y + h * f, x + w - 6, y + h * f);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(FAINT);
    doc.text(shotTypeLabel(frame.shotType).toUpperCase(), x + w / 2, y + h / 2 + 3, { align: 'center' });
    doc.setTextColor(INK);
  }
}

function sceneHeader(doc: jsPDF, scene: Scene, number: string, y: number, cont: boolean): number {
  const { w } = pageSize(doc);
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(INK);
  const heading = `${number}.  ${scene.heading || 'UNTITLED SCENE'}${cont ? '  (CONT.)' : ''}`;
  doc.text(heading, MARGIN, y);
  if (scene.summary && !cont) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED);
    const lines = (doc.splitTextToSize(scene.summary, w - MARGIN * 2) as string[]).slice(0, 2);
    doc.text(lines, MARGIN, y + 13);
    y += lines.length * 11;
  }
  doc.setTextColor(INK);
  return y + 20;
}

function clampLines(doc: jsPDF, text: string, width: number, max: number): string[] {
  const lines = doc.splitTextToSize(text, width) as string[];
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max);
  out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…';
  return out;
}

function techLine(f: StoryboardFrame) {
  return [shotTypeLabel(f.shotType), angleLabel(f.angle), movementLabel(f.movement)].join(' · ');
}

export async function buildStoryboardPdf(opts: StoryboardPdfOptions): Promise<jsPDF> {
  const doc = createDoc({ orientation: 'landscape' });
  const { w, h } = pageSize(doc);
  const byScene = new Map<string, StoryboardFrame[]>();
  for (const f of opts.frames) byScene.set(f.sceneId, [...(byScene.get(f.sceneId) ?? []), f]);
  const scenes = [...opts.scenes]
    .sort((a, b) => a.order - b.order)
    .filter((s) => (opts.sceneIds ? opts.sceneIds.includes(s.id) : true) && (byScene.get(s.id)?.length ?? 0) > 0);
  const total = scenes.reduce((n, s) => n + (byScene.get(s.id)?.length ?? 0), 0);

  let y = docHeader(doc, {
    kicker: 'Storyboard',
    title: opts.project.title,
    subtitle: opts.project.logline || undefined,
    meta: [`${scenes.length} scene${scenes.length === 1 ? '' : 's'}`, `${total} frame${total === 1 ? '' : 's'}`, new Date().toLocaleDateString(undefined, { dateStyle: 'long' })],
  });
  const bottom = h - MARGIN - 24;
  let first = true;

  for (const scene of scenes) {
    const frames = [...(byScene.get(scene.id) ?? [])].sort((a, b) => a.order - b.order);
    const number = opts.sceneNumbers.get(scene.id) ?? '';
    if (!first) {
      doc.addPage();
      y = MARGIN + 10;
    }
    first = false;
    y = sceneHeader(doc, scene, number, y, false);

    if (opts.layout === 'grid') {
      const cols = 3;
      const gap = 18;
      const cw = (w - MARGIN * 2 - gap * (cols - 1)) / cols;
      const ih = (cw * 9) / 16;
      const textH = 58;
      const rowH = ih + textH;
      for (let i = 0; i < frames.length; i++) {
        const col = i % cols;
        if (col === 0 && i > 0) y += rowH + 10;
        if (col === 0 && y + rowH > bottom) {
          doc.addPage();
          y = sceneHeader(doc, scene, number, MARGIN + 10, true);
        }
        const f = frames[i];
        const x = MARGIN + col * (cw + gap);
        await drawFrameImage(doc, f, x, y, cw, ih);
        let ty = y + ih + 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(opts.frameNumbers.get(f.id) ?? '', x, ty);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(MUTED);
        doc.text(techLine(f) + (f.durationSec ? `  ·  ${f.durationSec}s` : ''), x + 28, ty);
        doc.setTextColor(INK);
        ty += 11;
        doc.setFontSize(8);
        const action = clampLines(doc, f.action || '—', cw, 3);
        doc.text(action, x, ty);
        ty += action.length * 10;
        if (f.audio) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.5);
          doc.setTextColor(MUTED);
          doc.text(clampLines(doc, `“${f.audio}”`, cw, 1), x, ty);
          doc.setTextColor(INK);
        }
      }
    } else {
      // Two frames per page, sized to whatever space is left below the headers.
      const sizeFor = (top: number) => {
        const ih = Math.max(120, Math.min(214, (bottom - top) / 2 - 26));
        return { ih, iw: (ih * 16) / 9 };
      };
      let { iw, ih } = sizeFor(y);
      let onPage = 0;
      for (let i = 0; i < frames.length; i++) {
        if (onPage === 2 || y + ih > bottom) {
          doc.addPage();
          y = sceneHeader(doc, scene, number, MARGIN + 10, true);
          ({ iw, ih } = sizeFor(y));
          onPage = 0;
        }
        const f = frames[i];
        await drawFrameImage(doc, f, MARGIN, y, iw, ih);
        const tx = MARGIN + iw + 22;
        const tw = w - MARGIN - tx;
        const limit = y + ih + 6;
        let ty = y + 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text(`Frame ${opts.frameNumbers.get(f.id) ?? ''}`, tx, ty);
        ty += 16;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(MUTED);
        doc.text(techLine(f), tx, ty);
        ty += 12;
        const timing = [f.durationSec ? `${f.durationSec}s` : null, f.transition ? `Transition: ${f.transition}` : null].filter(Boolean).join('   ·   ');
        if (timing) {
          doc.text(timing, tx, ty);
          ty += 12;
        }
        doc.setTextColor(INK);
        ty += 6;
        const blocks: [string, string][] = [
          ['Action', f.action],
          ['Dialogue / audio', f.audio],
          ['Notes', f.notes],
        ];
        for (const [k, v] of blocks) {
          if (!v) continue;
          const room = Math.floor((limit - ty - 10) / 11.5);
          if (room < 1) break;
          label(doc, k, tx, ty);
          ty += 10;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          const lines = clampLines(doc, v, tw, Math.min(6, room));
          doc.text(lines, tx, ty);
          ty += lines.length * 11.5 + 8;
        }
        y += ih + 26;
        onPage++;
        if (onPage === 1 && i < frames.length - 1 && y + ih <= bottom) {
          doc.setDrawColor(RULE);
          doc.line(MARGIN, y - 13, w - MARGIN, y - 13);
        }
      }
    }
  }

  if (!scenes.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(MUTED);
    doc.text('No storyboard frames in the selected scenes.', MARGIN, y + 10);
  }
  docFooters(doc, `${opts.project.title} — Storyboard`);
  return doc;
}

export async function exportStoryboardPdf(opts: StoryboardPdfOptions) {
  const doc = await buildStoryboardPdf(opts);
  const safe = opts.project.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'storyboard';
  savePdf(doc, `${safe}-storyboard.pdf`);
}
