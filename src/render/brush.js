// Procedural ink brush: bristle strokes with dry-brush breaks (飞白), splats and bursts.
// Everything here draws onto 2D canvases in whatever pixel space the caller uses.
import { noise2, mulberry32, sstep, clamp } from '../core/noise.js';

export const INK = '#16151a';
export const PAPER = '#ebe3d2';
export const RED = '#b3352b';

export function chaikin(pts, iters = 2) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) break;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      q.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

export function resample(pts, step) {
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let ax = pts[i - 1].x, ay = pts[i - 1].y;
    const bx = pts[i].x, by = pts[i].y;
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= step && seg > 0) {
      const t = (step - acc) / seg;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      out.push({ x: ax, y: ay });
      seg = Math.hypot(bx - ax, by - ay);
      acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  const l = out[out.length - 1];
  if (Math.hypot(last.x - l.x, last.y - l.y) > step * 0.3) out.push({ x: last.x, y: last.y });
  return out;
}

/**
 * Draw one brush stroke along raw points.
 * width: full stroke width; dry: 0 = wet & solid, 1 = very dry with many breaks.
 * taperStart / taperEnd: fraction of the length used to swell in / taper out.
 */
export function drawBrush(ctx, raw, o = {}) {
  if (!raw || raw.length < 2) return;
  const width = o.width ?? 30;
  const color = o.color ?? INK;
  const alpha = o.alpha ?? 1;
  const seed = o.seed ?? 0;
  const dry = o.dry ?? 0.5;
  const ts = o.taperStart ?? 0.1;
  const te = o.taperEnd ?? 0.55;
  const head = o.head ?? 0.6;
  const core = o.core ?? 0.32;
  let pts = o.smooth === false ? raw : chaikin(raw, 2);
  pts = resample(pts, Math.max(1.2, width * 0.16));
  const n = pts.length;
  if (n < 2) return;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const total = cum[n - 1] || 1;
  const nx = new Float32Array(n), ny = new Float32Array(n), w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / l;
    ny[i] = tx / l;
    const s = cum[i] / total;
    const swell = 0.55 + 0.45 * sstep(0, ts, s);
    const taper = 1 - 0.92 * sstep(1 - te, 1, s);
    const press = 1 + head * 0.35 * (1 - sstep(0, ts * 1.6, s));
    w[i] = width * swell * taper * press * (o.profile ? o.profile(s) : 1);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // solid core so the stroke reads as one gesture
  if (core > 0) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.lineTo(pts[i].x + nx[i] * w[i] * core, pts[i].y + ny[i] * w[i] * core);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(pts[i].x - nx[i] * w[i] * core, pts[i].y - ny[i] * w[i] * core);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, w[0] * (core + 0.06), 0, Math.PI * 2);
    ctx.fill();
  }
  // bristles
  const B = Math.max(7, Math.min(26, Math.round(width / 2)));
  for (let b = 0; b < B; b++) {
    const off = ((b + 0.5) / B - 0.5) * (0.94 + 0.12 * noise2(b * 3.1, seed));
    const edge = Math.abs(off) * 2;
    let run = false;
    let runW = 0;
    for (let i = 0; i < n; i++) {
      const s = cum[i] / total;
      const thr = dry * (0.06 + 0.62 * s * s * s + 0.42 * edge * edge * edge);
      const nz = noise2(b * 13.17 + seed * 1.31, cum[i] / (width * 0.75) + seed * 0.37);
      const ok = nz > thr && w[i] > 0.5;
      const x = pts[i].x + nx[i] * off * w[i];
      const y = pts[i].y + ny[i] * off * w[i];
      if (ok && !run) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        run = true;
        runW = w[i];
        continue;
      }
      if (run) {
        if (ok) ctx.lineTo(x, y);
        const breakRun = !ok || i === n - 1 || Math.abs(w[i] - runW) > width * 0.14;
        if (breakRun) {
          ctx.lineWidth = Math.max(0.5, (runW / B) * 2.1);
          ctx.stroke();
          run = false;
          if (ok && i < n - 1) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            run = true;
            runW = w[i];
          }
        }
      }
    }
  }
  ctx.restore();
}

/** Rasterize a brush stroke into its own canvas (for strokes that no longer change). */
export function rasterBrush(pts, o, scale = 1) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const pad = (o.width ?? 30) * 1.2;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil((maxX - minX) * scale));
  c.height = Math.max(2, Math.ceil((maxY - minY) * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(-minX, -minY);
  drawBrush(g, pts, { ...o, alpha: 1 });
  return { canvas: c, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Ink splat: an irregular blob, satellite drops and a few streaks.
 * r in canvas pixels. dir (radians) + spread biases drops in a direction.
 */
export function makeSplat(r, o = {}) {
  const seed = (o.seed ?? Math.random() * 1e6) | 0;
  const rnd = mulberry32(seed);
  const color = o.color ?? INK;
  const R = Math.ceil(r * (o.reach ?? 3.4));
  const c = document.createElement('canvas');
  c.width = c.height = R * 2;
  const g = c.getContext('2d');
  g.translate(R, R);
  g.fillStyle = color;
  const dir = o.dir;
  const spread = o.spread ?? Math.PI;
  const pickAngle = () => (dir === undefined ? rnd() * Math.PI * 2 : dir + (rnd() - 0.5) * 2 * spread * rnd());
  if (o.blob !== false) {
    g.beginPath();
    const N = 56;
    const k = rnd() * 50;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = r * (0.68 + 0.5 * noise2(Math.cos(a) * 1.7 + k, Math.sin(a) * 1.7 + k) + 0.08 * Math.sin(a * 7 + k));
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  const streaks = o.streaks ?? 5;
  for (let i = 0; i < streaks; i++) {
    const a = pickAngle();
    const r0 = r * 0.5;
    const r1 = r * (1.5 + rnd() * 1.5) * (o.streakLen ?? 1);
    const bw = r * (0.1 + rnd() * 0.14);
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = -sa, py = ca;
    g.beginPath();
    g.moveTo(ca * r0 + px * bw, sa * r0 + py * bw);
    g.quadraticCurveTo(ca * (r0 + r1) * 0.5 + px * bw * 0.45, sa * (r0 + r1) * 0.5 + py * bw * 0.45, ca * r1, sa * r1);
    g.quadraticCurveTo(ca * (r0 + r1) * 0.5 - px * bw * 0.45, sa * (r0 + r1) * 0.5 - py * bw * 0.45, ca * r0 - px * bw, sa * r0 - py * bw);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(ca * (r1 + bw * 1.4), sa * (r1 + bw * 1.4), bw * (0.5 + rnd() * 0.5), 0, Math.PI * 2);
    g.fill();
  }
  const drops = o.drops ?? 14;
  for (let i = 0; i < drops; i++) {
    const a = pickAngle();
    const d = r * (1.05 + Math.pow(rnd(), 1.4) * 2.1);
    const s = r * (0.04 + 0.15 * rnd() * (1 - (d / (r * 3.3)) * 0.6));
    g.beginPath();
    g.ellipse(Math.cos(a) * d, Math.sin(a) * d, s * (1 + rnd() * 0.8), s, a, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, cx: R, cy: R };
}

/** Radial burst of tapered spikes — the parry clash. */
export function makeBurst(r, o = {}) {
  const seed = (o.seed ?? Math.random() * 1e6) | 0;
  const rnd = mulberry32(seed);
  const color = o.color ?? INK;
  const R = Math.ceil(r * 4.4);
  const c = document.createElement('canvas');
  c.width = c.height = R * 2;
  const g = c.getContext('2d');
  g.translate(R, R);
  g.fillStyle = color;
  const spikes = o.spikes ?? 22;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const len = r * (1.4 + Math.pow(rnd(), 0.7) * 2.7);
    const bw = r * (0.05 + rnd() * 0.11);
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const r0 = r * 0.35;
    const bend = (rnd() - 0.5) * r * 0.25;
    g.beginPath();
    g.moveTo(ca * r0 + px * bw, sa * r0 + py * bw);
    g.quadraticCurveTo(ca * len * 0.55 + px * (bw * 0.5 + bend), sa * len * 0.55 + py * (bw * 0.5 + bend), ca * len, sa * len);
    g.quadraticCurveTo(ca * len * 0.55 + px * (-bw * 0.5 + bend), sa * len * 0.55 + py * (-bw * 0.5 + bend), ca * r0 - px * bw, sa * r0 - py * bw);
    g.closePath();
    g.fill();
    if (rnd() < 0.6) {
      g.beginPath();
      g.arc(ca * len * (1.08 + rnd() * 0.15), sa * len * (1.08 + rnd() * 0.15), bw * (0.4 + rnd() * 0.7), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.beginPath();
  const k = rnd() * 40;
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = r * (0.45 + 0.25 * noise2(Math.cos(a) * 1.5 + k, Math.sin(a) * 1.5 + k));
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.fill();
  if (o.hollow) {
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas: c, cx: R, cy: R };
}

/** An ensō-like brush circle. */
export function circlePoints(cx, cy, r, a0 = 0.35, a1 = Math.PI * 2 - 0.25, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps) - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function clampPt(p, w, h, m = 0) {
  return { x: clamp(p.x, m, w - m), y: clamp(p.y, m, h - m) };
}
