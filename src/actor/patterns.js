// Garment lines painted into the UV space of the lathe-built torso and skirt, so the
// crossed collar (交领右衽), the front overlap and the hem bands bend and twist with
// the body instead of being separate pieces stuck on top.
//
// Lathe UVs: u runs around the body, v runs along the profile points *by index*.
// The lathes are built with phiStart = π, so u = 0.5 is the front (+Z) and u > 0.5
// is the wearer's left (+X); u = 0 / 1 is the centre of the back.
import * as THREE from 'three';
import { drawBrush } from '../render/brush.js';

export function profileV(profile) {
  // v for a height y, interpolated between the profile points (index-based UVs)
  const n = profile.length - 1;
  return (y) => {
    for (let j = 0; j < n; j++) {
      const a = profile[j][1], b = profile[j + 1][1];
      if ((y - a) * (y - b) <= 0 && a !== b) return (j + (y - a) / (b - a)) / n;
    }
    return y < profile[0][1] ? 0 : 1;
  };
}

function canvasFor(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * o.trim  – colour of the collar band / hem band
 * o.inner – colour of the inner collar showing at the neck
 */
export function torsoPattern(profile, o = {}) {
  const W = 1024, H = 512;
  const c = canvasFor(W, H);
  const g = c.getContext('2d');
  const V = profileV(profile);
  const P = (u, y) => ({ x: u * W, y: (1 - V(y)) * H });
  const trim = o.trim ?? '#141317';
  const inner = o.inner ?? '#d8d0c0';

  // inner collar: a pale V at the throat, under the outer lapel
  g.fillStyle = inner;
  g.beginPath();
  const a = P(0.44, 0.545), b = P(0.565, 0.545), tip = P(0.5, 0.43);
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(tip.x, tip.y);
  g.closePath();
  g.fill();

  // the wearer's left panel crosses over to the right armpit: one long collar band
  const lapel = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    // starts at the left of the neck, sweeps down and round to the right side
    const u = 0.565 - t * 0.265 - Math.sin(t * Math.PI) * 0.015;
    const y = 0.545 - t * 0.33 + Math.sin(t * Math.PI) * 0.03;
    lapel.push(P(u, y));
  }
  drawBrush(g, lapel, { width: H * 0.06, color: trim, dry: 0.15, seed: 3, taperStart: 0.02, taperEnd: 0.18, head: 0.1, core: 0.42 });
  // the underlying right panel's collar edge on the other side of the neck
  const under = [P(0.44, 0.545), P(0.475, 0.49), P(0.5, 0.435)];
  drawBrush(g, under, { width: H * 0.035, color: trim, dry: 0.2, seed: 5, taperStart: 0.05, taperEnd: 0.5, core: 0.4 });
  // collar round the back of the neck
  const back = [];
  for (let i = 0; i <= 10; i++) back.push(P(0.565 + (i / 10) * 0.435, 0.54 - Math.sin((i / 10) * Math.PI) * 0.005));
  drawBrush(g, back, { width: H * 0.05, color: trim, dry: 0.15, seed: 7, taperStart: 0.01, taperEnd: 0.01, core: 0.42 });
  const back2 = [];
  for (let i = 0; i <= 10; i++) back2.push(P((i / 10) * 0.44, 0.54));
  drawBrush(g, back2, { width: H * 0.05, color: trim, dry: 0.15, seed: 8, taperStart: 0.01, taperEnd: 0.01, core: 0.42 });

  // a few folds pulled toward the belt
  const folds = [[0.38, 0.62], [0.62, 0.7], [0.12, 0.88], [0.86, 0.95]];
  folds.forEach(([u0, u1], i) => {
    const pts = [P(u0, 0.33), P((u0 * 2 + u1) / 3, 0.2), P(u1, 0.05)];
    drawBrush(g, pts, { width: H * 0.012, color: trim, alpha: 0.45, dry: 0.75, seed: 20 + i, taperStart: 0.3, taperEnd: 0.6, core: 0.15 });
  });
  // centre-back seam
  drawBrush(g, [P(0.0, 0.5), P(0.0, 0.02)], { width: H * 0.014, color: trim, alpha: 0.55, dry: 0.6, seed: 31, core: 0.2 });
  drawBrush(g, [P(1.0, 0.5), P(1.0, 0.02)], { width: H * 0.014, color: trim, alpha: 0.55, dry: 0.6, seed: 31, core: 0.2 });
  return texture(c);
}

export function skirtPattern(profile, o = {}) {
  const W = 1024, H = 512;
  const c = canvasFor(W, H);
  const g = c.getContext('2d');
  const V = profileV(profile);
  const P = (u, y) => ({ x: u * W, y: (1 - V(y)) * H });
  const trim = o.trim ?? '#141317';
  const hemTop = o.hemTop ?? -0.82, hemBot = o.hemBot ?? -0.9;

  // hem band all the way round
  g.fillStyle = trim;
  const y0 = (1 - V(hemTop)) * H, y1 = (1 - V(hemBot)) * H;
  g.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  // front overlap edge continuing from the collar, slightly curving out at the hem
  const edge = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    edge.push(P(0.3 + t * 0.03, 0.0 - t * (0.0 - hemTop)));
  }
  drawBrush(g, edge, { width: H * 0.04, color: trim, dry: 0.2, seed: 11, taperStart: 0.01, taperEnd: 0.05, core: 0.42 });
  // long folds down the skirt
  const folds = [0.08, 0.2, 0.42, 0.58, 0.7, 0.84, 0.95];
  folds.forEach((u, i) => {
    const pts = [P(u, -0.12), P(u + 0.01, -0.45), P(u + 0.02, hemTop + 0.02)];
    drawBrush(g, pts, { width: H * 0.012, color: trim, alpha: 0.4, dry: 0.8, seed: 40 + i, taperStart: 0.5, taperEnd: 0.2, core: 0.12 });
  });
  return texture(c);
}

export function sleevePattern(o = {}) {
  // cylinder UV: the +Y end (the wide, wrist end of the forearm sleeve) is the
  // top of the canvas — a cuff band there
  const W = 256, H = 128;
  const c = canvasFor(W, H);
  const g = c.getContext('2d');
  g.fillStyle = o.trim ?? '#141317';
  g.fillRect(0, 0, W, H * (o.cuff ?? 0.16));
  return texture(c);
}
