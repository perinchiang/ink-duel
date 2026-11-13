// The painted backdrop: paper, layered ink-wash mountains fading into mist, a pale moon
// and dry-brush ground. Painted once per resize onto a 2D canvas behind the 3D layer.
import { fbm1, mulberry32, noise1 } from '../core/noise.js';
import { drawBrush, INK } from './brush.js';

const PAPER = '#ebe3d2';

function rgba(a) {
  return `rgba(22,21,26,${a})`;
}

export function paintBackdrop(canvas, w, h, dpr, horizonY, seed = 7) {
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rnd = mulberry32(seed);
  const m = Math.min(w, h);

  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  // warm vignette
  const vg = g.createRadialGradient(w * 0.5, h * 0.45, m * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(255,250,238,0.35)');
  vg.addColorStop(1, 'rgba(90,72,48,0.16)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  // moon
  const mx = w * 0.76, my = horizonY - h * 0.36, mr = m * 0.055;
  g.fillStyle = 'rgba(255,252,244,0.75)';
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fill();
  drawBrush(g, circlePts(mx, my, mr), { width: m * 0.006, alpha: 0.28, dry: 0.7, seed: 3, taperStart: 0.2, taperEnd: 0.4 });

  // mountains, far → near
  const layers = [
    { base: horizonY - h * 0.02, amp: h * 0.3, freq: 1.6, a: 0.13, fade: h * 0.22, rough: 0.5 },
    { base: horizonY + h * 0.01, amp: h * 0.2, freq: 2.4, a: 0.2, fade: h * 0.16, rough: 0.7 },
    { base: horizonY + h * 0.025, amp: h * 0.11, freq: 3.4, a: 0.3, fade: h * 0.1, rough: 0.9 },
  ];
  layers.forEach((L, li) => {
    const off = rnd() * 100;
    const step = 3;
    const ridge = [];
    for (let x = -10; x <= w + 10; x += step) {
      const u = x / w;
      // keep the middle lower so the duel stays clear; peaks toward the sides
      const sideLift = 0.55 + 0.45 * Math.pow(Math.abs(u - 0.5) * 2, 1.3);
      const f = fbm1(u * L.freq + off, 5);
      const y = L.base - L.amp * Math.pow(f, 1.6) * 1.9 * sideLift;
      ridge.push({ x, y });
    }
    let top = Infinity;
    for (const p of ridge) top = Math.min(top, p.y);
    const grd = g.createLinearGradient(0, top, 0, L.base + L.fade * 0.2);
    grd.addColorStop(0, rgba(L.a));
    grd.addColorStop(0.55, rgba(L.a * 0.55));
    grd.addColorStop(1, rgba(0));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(ridge[0].x, L.base + L.fade);
    for (const p of ridge) g.lineTo(p.x, p.y);
    g.lineTo(ridge[ridge.length - 1].x, L.base + L.fade);
    g.closePath();
    g.fill();
    // texture strokes (皴) hanging from the ridge
    g.strokeStyle = INK;
    g.lineCap = 'round';
    for (let i = 0; i < ridge.length; i += 2) {
      const p = ridge[i];
      if (rnd() > 0.55) continue;
      const len = (L.base - p.y) * (0.15 + rnd() * 0.6) + 2;
      g.globalAlpha = L.a * (0.25 + rnd() * 0.5) * L.rough;
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(p.x, p.y + 1);
      g.quadraticCurveTo(p.x + (rnd() - 0.5) * 6, p.y + len * 0.5, p.x + (rnd() - 0.5) * 10, p.y + len);
      g.stroke();
    }
    g.globalAlpha = 1;
    // ridge line, broken
    for (let i = 0; i < ridge.length - 1; ) {
      const len = 8 + Math.floor(rnd() * 30);
      const seg = ridge.slice(i, i + len);
      if (seg.length > 2 && rnd() < 0.75) {
        drawBrush(g, seg, { width: (1.2 + li * 1.1) * (m / 700), alpha: L.a * 1.5, dry: 0.75, seed: i + li * 99, taperStart: 0.3, taperEnd: 0.5, core: 0.2 });
      }
      i += len + Math.floor(rnd() * 12);
    }
  });

  // mist band across the mountain feet
  const mist = g.createLinearGradient(0, horizonY - h * 0.08, 0, horizonY + h * 0.06);
  mist.addColorStop(0, 'rgba(235,227,210,0)');
  mist.addColorStop(0.6, 'rgba(235,227,210,0.92)');
  mist.addColorStop(1, 'rgba(235,227,210,0.6)');
  g.fillStyle = mist;
  g.fillRect(0, horizonY - h * 0.08, w, h * 0.14);

  // ground: a few long dry strokes, denser toward the viewer
  for (let i = 0; i < 16; i++) {
    const t = Math.pow(rnd(), 0.8);
    const y = horizonY + h * 0.02 + t * (h - horizonY) * 0.95;
    const x0 = rnd() * w * 0.9 - w * 0.1;
    const len = w * (0.15 + rnd() * 0.45) * (0.5 + t);
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const x = x0 + (len * k) / 10;
      pts.push({ x, y: y + (noise1(x * 0.01 + i) - 0.5) * 6 * (1 + t) });
    }
    drawBrush(g, pts, { width: (2 + t * 9) * (m / 700), alpha: 0.05 + t * 0.07, dry: 0.85, seed: 40 + i, taperStart: 0.25, taperEnd: 0.5, core: 0.15 });
  }
  // a horizon whisper
  const hz = [];
  for (let x = 0; x <= w; x += 12) hz.push({ x, y: horizonY + h * 0.012 + (noise1(x * 0.02) - 0.5) * 2 });
  drawBrush(g, hz, { width: m * 0.004, alpha: 0.12, dry: 0.9, seed: 5, taperStart: 0.2, taperEnd: 0.3, core: 0.15 });
}

function circlePts(cx, cy, r) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = 0.3 + (i / 40) * (Math.PI * 2 - 0.5);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** Paper fibre texture used as a multiply layer over everything. */
export function paperTextureURL(size = 256, seed = 11) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 255 - Math.floor(Math.pow(rnd(), 3) * 26);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v - 2;
    img.data[i * 4 + 2] = v - 6;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // fibres
  g.lineCap = 'round';
  for (let i = 0; i < 220; i++) {
    const x = rnd() * size, y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const l = 4 + rnd() * 18;
    g.strokeStyle = `rgba(120,100,70,${0.05 + rnd() * 0.08})`;
    g.lineWidth = 0.5 + rnd() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c.toDataURL();
}
