// The ink overlay: brush strokes from your finger, the red telegraph of incoming cuts,
// splats, parry bursts, calligraphic call-outs and the HUD. Redrawn every frame.
import { drawBrush, rasterBrush, makeSplat, makeBurst, circlePoints, INK, PAPER, RED } from './brush.js';
import { clamp, ease, sstep } from '../core/noise.js';

const KAI = '"Kaiti SC","STKaiti","KaiTi","BiauKai","Songti SC","STSong",serif';

export class InkFX {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.items = [];
    this.strokes = new Map();
    this.telegraph = null;
    this.hint = null;
    this.hud = null;
    this.flash = 0;
    this.redVign = 0;
    this.flood = 0;
    this.time = 0;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.m = Math.min(w, h);
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cacheHud();
  }

  cacheHud() {
    const m = this.m;
    const bw = Math.min(this.w * 0.42, 520), bh = Math.max(10, m * 0.022);
    this.barW = bw;
    this.barH = bh;
    const mk = (alpha, seed) =>
      rasterBrush([{ x: 0, y: 0 }, { x: bw * 0.5, y: -bh * 0.08 }, { x: bw, y: 0 }], { width: bh, dry: 0.45, seed, taperStart: 0.04, taperEnd: 0.12, head: 0.2, core: 0.36, alpha }, this.dpr);
    this.barFull = mk(1, 3);
    this.barBack = mk(1, 8);
    const r = Math.max(9, m * 0.02);
    this.ensoR = r;
    this.enso = rasterBrush(circlePoints(0, 0, r), { width: r * 0.42, dry: 0.5, seed: 4, taperStart: 0.12, taperEnd: 0.4, core: 0.3 }, this.dpr);
  }

  // ---- strokes from input --------------------------------------------------
  stroke(id, pts, done) {
    let s = this.strokes.get(id);
    if (!s) {
      s = { pts: [], age: 0, done: false, seed: Math.random() * 100, width: this.m * 0.042 };
      this.strokes.set(id, s);
    }
    s.pts = pts.map((p) => ({ x: p.x, y: p.y }));
    if (done && !s.done) {
      s.done = true;
      s.age = 0;
      if (s.pts.length > 1) s.img = rasterBrush(s.pts, { width: s.width, dry: 0.55, seed: s.seed }, this.dpr);
    }
  }

  // ---- one-shot effects ----------------------------------------------------
  push(item) {
    item.age = 0;
    this.items.push(item);
    return item;
  }

  splat(x, y, r, o = {}) {
    const sp = makeSplat(r * this.dpr, o);
    return this.push({ kind: 'img', img: sp.canvas, ox: sp.cx / this.dpr, oy: sp.cy / this.dpr, x, y, life: o.life ?? 1.1, hold: o.hold ?? 0.35, rot: o.rot ?? 0, pop: o.pop ?? 0.06, alpha: o.alpha ?? 1 });
  }

  burst(x, y, perfect) {
    const r = this.m * (perfect ? 0.085 : 0.055);
    const b = makeBurst(r * this.dpr, { spikes: perfect ? 26 : 16, hollow: true });
    this.push({ kind: 'img', img: b.canvas, ox: b.cx / this.dpr, oy: b.cy / this.dpr, x, y, life: perfect ? 0.9 : 0.6, hold: 0.12, pop: 0.08, grow: 0.18, rot: Math.random() * 6 });
    this.push({ kind: 'ring', x, y, r0: r * 0.3, r1: r * (perfect ? 3.6 : 2.2), life: perfect ? 0.45 : 0.3, width: r * 0.14 });
    if (perfect) this.flash = 0.55;
  }

  spark(x, y) {
    const r = this.m * 0.022;
    const b = makeBurst(r * this.dpr, { spikes: 9 });
    this.push({ kind: 'img', img: b.canvas, ox: b.cx / this.dpr, oy: b.cy / this.dpr, x, y, life: 0.32, hold: 0.04, pop: 0.05, rot: Math.random() * 6 });
  }

  /** A cut on the opponent: a paper-white slash line, with ink thrown along the stroke. */
  cut(a, b, at) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const L = this.m * 0.16;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8 - 0.5;
      pts.push({ x: at.x + ux * L * t * 2, y: at.y + uy * L * t * 2 + Math.sin(i) * 1.5 });
    }
    this.push({ kind: 'brush', pts, o: { width: this.m * 0.014, color: PAPER, dry: 0.3, seed: Math.random() * 50, taperStart: 0.3, taperEnd: 0.45 }, life: 0.35, hold: 0.1 });
    this.splat(at.x + ux * this.m * 0.05, at.y + uy * this.m * 0.05, this.m * 0.022, { dir: Math.atan2(uy, ux), spread: 0.55, drops: 16, streaks: 4, life: 0.9, hold: 0.25 });
  }

  playerHurt(path) {
    if (path && path.length > 1) {
      this.push({ kind: 'brush', pts: path, o: { width: this.m * 0.05, dry: 0.5, seed: Math.random() * 50, taperStart: 0.08, taperEnd: 0.6 }, life: 0.95, hold: 0.25 });
    }
    const w = this.w, h = this.h;
    const spots = [[0.04, 0.2], [0.96, 0.3], [0.08, 0.85], [0.92, 0.82], [0.5, 0.02]];
    for (const [sx, sy] of spots) {
      if (Math.random() < 0.35) continue;
      this.splat(sx * w, sy * h, this.m * (0.05 + Math.random() * 0.05), { color: RED, life: 1.4, hold: 0.5, alpha: 0.85 });
    }
    this.redVign = 1;
  }

  text(str, x, y, o = {}) {
    return this.push({ kind: 'text', str, x, y, size: o.size ?? this.m * 0.07, color: o.color ?? INK, life: o.life ?? 0.9, hold: o.hold ?? 0.45, pop: 0.12, alpha: o.alpha ?? 1 });
  }

  // ---- render --------------------------------------------------------------
  render(dt) {
    this.time += dt;
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.redVign > 0.01) {
      const grd = g.createRadialGradient(this.w / 2, this.h / 2, this.m * 0.35, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.6);
      grd.addColorStop(0, 'rgba(179,53,43,0)');
      grd.addColorStop(1, `rgba(179,53,43,${0.35 * this.redVign})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, this.w, this.h);
      this.redVign = Math.max(0, this.redVign - dt * 1.6);
    }

    const T = this.telegraph;
    if (T && T.alpha > 0.01 && T.pts.length > 1) {
      drawBrush(g, T.pts, { width: this.m * 0.028 * (0.6 + 0.4 * T.alpha), color: RED, alpha: T.alpha, dry: 0.6, seed: T.seed ?? 1, taperStart: 0.06, taperEnd: 0.75, head: 1 });
    }

    const H = this.hint;
    if (H && H.alpha > 0.01) this.drawHint(g, H);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age >= it.life) {
        this.items.splice(i, 1);
        continue;
      }
      const fade = 1 - sstep(it.hold ?? 0, it.life, it.age);
      this.drawItem(g, it, fade);
    }

    for (const [id, s] of this.strokes) {
      if (s.done) {
        s.age += dt;
        const a = 1 - sstep(0.1, 0.55, s.age);
        if (a <= 0.01) {
          this.strokes.delete(id);
          continue;
        }
        if (s.img) {
          g.globalAlpha = a;
          g.drawImage(s.img.canvas, s.img.x, s.img.y, s.img.w, s.img.h);
          g.globalAlpha = 1;
        }
      } else if (s.pts.length > 1) {
        drawBrush(g, s.pts, { width: s.width, dry: 0.55, seed: s.seed });
      }
    }

    if (this.flood > 0) {
      g.fillStyle = `rgba(22,21,26,${clamp(this.flood) * 0.85})`;
      g.fillRect(0, 0, this.w, this.h);
    }

    if (this.flash > 0.01) {
      g.fillStyle = `rgba(250,246,236,${this.flash})`;
      g.fillRect(0, 0, this.w, this.h);
      this.flash = Math.max(0, this.flash - dt * 3.5);
    }

    if (this.hud && this.hud.visible) this.drawHud(g, this.hud, dt);
  }

  drawItem(g, it, fade) {
    const popT = it.pop ? ease.outBack(clamp(it.age / it.pop)) : 1;
    if (it.kind === 'img') {
      const s = (0.6 + 0.4 * popT) * (1 + (it.grow ?? 0) * clamp(it.age / it.life));
      g.save();
      g.globalAlpha = fade * (it.alpha ?? 1);
      g.translate(it.x, it.y);
      g.rotate(it.rot || 0);
      g.scale(s, s);
      g.drawImage(it.img, -it.ox, -it.oy, it.img.width / this.dpr, it.img.height / this.dpr);
      g.restore();
    } else if (it.kind === 'ring') {
      const u = ease.outCubic(it.age / it.life);
      g.save();
      g.globalAlpha = (1 - u) * 0.9;
      g.strokeStyle = INK;
      g.lineWidth = it.width * (1 - u * 0.7);
      g.beginPath();
      g.arc(it.x, it.y, it.r0 + (it.r1 - it.r0) * u, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    } else if (it.kind === 'brush') {
      drawBrush(g, it.pts, { ...it.o, alpha: fade });
    } else if (it.kind === 'text') {
      const s = 0.7 + 0.3 * popT;
      g.save();
      g.globalAlpha = fade * it.alpha;
      g.translate(it.x, it.y);
      g.scale(s, s);
      g.font = `${Math.round(it.size)}px ${KAI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = it.size * 0.12;
      g.strokeStyle = 'rgba(235,227,210,0.9)';
      g.strokeText(it.str, 0, 0);
      g.fillStyle = it.color;
      g.fillText(it.str, 0, 0);
      g.restore();
    }
  }

  drawHint(g, H) {
    // a faint ink arrow showing the parry swipe: "meet the blade"
    const ang = (H.angle * Math.PI) / 180;
    const ux = Math.cos(ang), uy = -Math.sin(ang);
    const cx = this.w * 0.5 + (H.ox ?? 0), cy = this.h * 0.62;
    const L = this.m * 0.24;
    const a = { x: cx - ux * L * 0.5, y: cy - uy * L * 0.5 };
    const b = { x: cx + ux * L * 0.5, y: cy + uy * L * 0.5 };
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push({ x: a.x + (b.x - a.x) * (i / 10), y: a.y + (b.y - a.y) * (i / 10) });
    g.save();
    g.globalAlpha = H.alpha * 0.55;
    drawBrush(g, pts, { width: this.m * 0.022, dry: 0.75, seed: 9, taperStart: 0.05, taperEnd: 0.3, head: 0.2, alpha: 1 });
    const hl = this.m * 0.05;
    const px = -uy, py = ux;
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(b.x + ux * hl * 0.6, b.y + uy * hl * 0.6);
    g.lineTo(b.x - ux * hl * 0.5 + px * hl * 0.55, b.y - uy * hl * 0.5 + py * hl * 0.55);
    g.lineTo(b.x - ux * hl * 0.2, b.y - uy * hl * 0.2);
    g.lineTo(b.x - ux * hl * 0.5 - px * hl * 0.55, b.y - uy * hl * 0.5 - py * hl * 0.55);
    g.closePath();
    g.fill();
    g.globalAlpha = H.alpha * 0.8;
    g.font = `${Math.round(this.m * 0.036)}px ${KAI}`;
    g.textAlign = 'center';
    g.fillText(H.label ?? '迎 刀 而 上', cx, cy + this.m * 0.17);
    g.restore();
  }

  drawHud(g, hud, dt) {
    const m = this.m;
    // opponent
    const bw = this.barW, bh = this.barH;
    const x0 = (this.w - bw) / 2, y0 = Math.max(30, m * 0.07);
    g.save();
    g.font = `${Math.round(m * 0.034)}px ${KAI}`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillStyle = INK;
    g.fillText(hud.name, this.w / 2, y0 - bh * 0.7);
    const drawBar = (img, frac, alpha) => {
      if (frac <= 0) return;
      g.save();
      g.globalAlpha = alpha;
      g.beginPath();
      g.rect(x0 - bh, y0 - bh * 2, (bw + bh * 2) * frac, bh * 4);
      g.clip();
      g.drawImage(img.canvas, x0 + img.x, y0 + img.y, img.w, img.h);
      g.restore();
    };
    drawBar(this.barBack, 1, 0.12);
    drawBar(this.barFull, clamp(hud.chip / hud.max), 0.3);
    drawBar(this.barFull, clamp(hud.hp / hud.max), 0.92);
    g.restore();
    // player: brush circles, top-left
    const r = this.ensoR;
    for (let i = 0; i < hud.pmax; i++) {
      const tall = this.w < this.h * 1.2;
      const cx = (tall ? this.w / 2 - (hud.pmax - 1) * r * 1.35 : m * 0.06 + r) + i * r * 2.7, cy = tall ? y0 + bh * 2.6 : y0 - bh * 0.4;
      g.globalAlpha = i < hud.php ? 0.9 : 0.14;
      g.drawImage(this.enso.canvas, cx + this.enso.x, cy + this.enso.y, this.enso.w, this.enso.h);
    }
    g.globalAlpha = 1;
  }
}
