/**
 * Simple hand-drawn-style storyboard compositions for the sample film,
 * generated as SVG so the sample ships without bundled image files.
 */

export type SketchKind =
  | 'road-wide'
  | 'car-interior'
  | 'lighthouse-door'
  | 'kitchen-two'
  | 'close-face'
  | 'papers-insert'
  | 'lens-wide'
  | 'ots-window'
  | 'gallery-storm';

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600;
const H = 900;

class Pen {
  parts: string[] = [];
  constructor(private r: () => number) {}
  private j(n = 3) {
    return (this.r() - 0.5) * n;
  }
  line(x1: number, y1: number, x2: number, y2: number, w = 4, color = '#2a2622') {
    // Two slightly offset passes give a pencil feel.
    for (let pass = 0; pass < 2; pass++) {
      const mx = (x1 + x2) / 2 + this.j(6);
      const my = (y1 + y2) / 2 + this.j(6);
      this.parts.push(
        `<path d="M${x1 + this.j()} ${y1 + this.j()} Q${mx} ${my} ${x2 + this.j()} ${y2 + this.j()}" stroke="${color}" stroke-width="${pass ? w * 0.55 : w}" fill="none" stroke-linecap="round" opacity="${pass ? 0.5 : 0.92}"/>`,
      );
    }
  }
  poly(points: [number, number][], w = 4, close = false, color = '#2a2622') {
    for (let i = 0; i < points.length - 1; i++) this.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], w, color);
    if (close) this.line(points[points.length - 1][0], points[points.length - 1][1], points[0][0], points[0][1], w, color);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, w = 4, fill = 'none', color = '#2a2622') {
    this.parts.push(
      `<ellipse cx="${cx + this.j()}" cy="${cy + this.j()}" rx="${rx}" ry="${ry}" stroke="${color}" stroke-width="${w}" fill="${fill}" opacity="0.9"/>`,
    );
  }
  fill(d: string, color: string, opacity = 1) {
    this.parts.push(`<path d="${d}" fill="${color}" opacity="${opacity}"/>`);
  }
  hatch(x: number, y: number, w: number, h: number, spacing = 18, color = '#2a2622') {
    for (let i = -h; i < w; i += spacing) {
      const x1 = Math.max(x, x + i);
      const y1 = i < 0 ? y - i : y;
      const x2 = Math.min(x + w, x + i + h);
      const y2 = i + h > w ? y + (w - i) : y + h;
      this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.6" opacity="0.35"/>`);
    }
  }
  rain(n: number) {
    for (let i = 0; i < n; i++) {
      const x = this.r() * W;
      const y = this.r() * H;
      this.parts.push(`<line x1="${x}" y1="${y}" x2="${x - 26}" y2="${y + 70}" stroke="#4b5a66" stroke-width="2" opacity="0.45"/>`);
    }
  }
  figure(x: number, y: number, s: number) {
    this.ellipse(x, y - 120 * s, 26 * s, 30 * s, 4);
    this.poly([[x - 50 * s, y], [x - 40 * s, y - 70 * s], [x, y - 88 * s], [x + 40 * s, y - 70 * s], [x + 50 * s, y]], 4);
  }
}

function lighthouse(p: Pen, x: number, base: number, h: number) {
  const top = base - h;
  p.poly([[x - h * 0.09, base], [x - h * 0.05, top + h * 0.12], [x + h * 0.05, top + h * 0.12], [x + h * 0.09, base]], 4);
  p.poly([[x - h * 0.07, top + h * 0.12], [x - h * 0.07, top], [x + h * 0.07, top], [x + h * 0.07, top + h * 0.12]], 4);
  p.line(x - h * 0.09, top, x + h * 0.09, top - h * 0.02);
  p.fill(`M${x} ${top + h * 0.05} L${x - 900} ${top - 160} L${x - 900} ${top + 140} Z`, '#d6a44e', 0.18);
}

export function sketchSvg(kind: SketchKind, seed = 1): string {
  const r = rng(seed * 97 + kind.length);
  const p = new Pen(r);
  switch (kind) {
    case 'road-wide': {
      p.line(0, 520, W, 500, 3);
      p.poly([[600, H], [790, 510], [830, 510], [1120, H]], 4);
      p.line(810, 560, 812, 600, 3);
      p.line(812, 650, 815, 720, 3);
      p.poly([[700, 700], [700, 640], [760, 620], [880, 620], [930, 645], [930, 700]], 4, true);
      p.ellipse(720, 690, 14, 10, 3, '#d6a44e');
      p.ellipse(910, 690, 14, 10, 3, '#d6a44e');
      lighthouse(p, 1340, 505, 300);
      p.hatch(0, 520, 560, 380, 22);
      break;
    }
    case 'car-interior': {
      p.poly([[120, 120], [1480, 120], [1400, 560], [200, 560]], 6, true);
      p.line(0, 640, W, 620, 6);
      p.ellipse(1050, 480, 90, 110, 5);
      p.poly([[930, 900], [960, 640], [1050, 590], [1140, 640], [1170, 900]], 5);
      p.line(1000, 470, 1030, 472, 3);
      lighthouse(p, 420, 520, 230);
      p.hatch(0, 640, W, 260, 26);
      break;
    }
    case 'lighthouse-door': {
      p.poly([[560, 900], [620, 140], [980, 140], [1040, 900]], 5);
      p.poly([[720, 900], [720, 470], [880, 470], [880, 900]], 5);
      p.ellipse(860, 690, 8, 8, 3, '#2a2622');
      p.figure(1180, 900, 2.2);
      p.fill('M720 470 L880 470 L880 900 L720 900 Z', '#d6a44e', 0.22);
      p.rain(40);
      break;
    }
    case 'kitchen-two': {
      p.poly([[160, 120], [560, 120], [560, 460], [160, 460]], 4, true);
      p.line(360, 120, 360, 460, 3);
      p.line(160, 290, 560, 290, 3);
      p.line(0, 640, W, 640, 4);
      p.ellipse(800, 640, 420, 60, 4);
      p.figure(520, 660, 2.4);
      p.figure(1120, 660, 2.6);
      p.ellipse(800, 590, 24, 30, 3, '#d6a44e');
      p.line(800, 560, 800, 520, 3, '#d6a44e');
      break;
    }
    case 'close-face': {
      p.ellipse(820, 470, 300, 380, 6);
      p.line(690, 400, 770, 395, 5);
      p.line(880, 395, 960, 400, 5);
      p.line(820, 450, 800, 560, 4);
      p.line(760, 640, 880, 636, 4);
      p.poly([[420, 900], [540, 760], [700, 820]], 5);
      p.poly([[1220, 900], [1100, 760], [940, 820]], 5);
      p.hatch(1000, 140, 220, 700, 20);
      break;
    }
    case 'papers-insert': {
      p.poly([[300, 200], [1200, 160], [1280, 760], [360, 800]], 5, true);
      for (let i = 0; i < 9; i++) p.line(420, 300 + i * 52, 1100 + r() * 60, 290 + i * 52, 3, '#6b665d');
      p.line(860, 700, 1140, 690, 4);
      p.poly([[1180, 520], [1500, 820], [1440, 860], [1130, 560]], 4, true);
      break;
    }
    case 'lens-wide': {
      for (let i = 0; i < 6; i++) p.ellipse(800, 380, 140 + i * 48, 220 + i * 26, 4 - i * 0.4);
      p.fill('M800 380 L1600 220 L1600 540 Z', '#d6a44e', 0.18);
      p.poly([[200, 820], [1400, 820]], 5);
      p.figure(380, 820, 1.4);
      p.figure(520, 820, 1.0);
      p.line(0, 120, W, 120, 3);
      break;
    }
    case 'ots-window': {
      p.poly([[700, 160], [1460, 160], [1460, 700], [700, 700]], 4, true);
      p.line(1080, 160, 1080, 700, 3);
      p.rain(60);
      p.figure(1240, 700, 1.6);
      p.fill('M0 900 L0 380 Q120 300 300 330 Q470 360 520 520 L560 900 Z', '#2a2622', 0.85);
      break;
    }
    case 'gallery-storm': {
      p.line(0, 640, W, 600, 5);
      for (let x = 60; x < W; x += 120) p.line(x, 640 - x * 0.025, x, 800 - x * 0.025, 4);
      p.line(0, 800, W, 760, 5);
      p.figure(820, 640, 2.4);
      p.ellipse(920, 470, 30, 40, 4, '#d6a44e');
      p.rain(140);
      p.poly([[0, 300], [320, 220], [700, 280], [1100, 200], [1600, 260]], 3, false, '#4b5a66');
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f3efe6"/><rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#2a2622" stroke-width="3" opacity="0.5"/>${p.parts.join('')}</svg>`;
}
