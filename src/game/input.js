// Touch / mouse swipes. A swipe commits as soon as it is long enough (not on release),
// so parries respond the moment the finger has clearly moved. The same stroke keeps
// being tracked afterwards: if it closes into a counter-clockwise loop, that is the
// sheathing gesture (归鞘).

export class SwipeInput {
  constructor(el, h) {
    this.el = el;
    this.h = h;
    this.active = null;
    this.seq = 0;
    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') h.onDodge(-1);
      else if (k === 'd' || k === 'arrowright') h.onDodge(1);
    });
  }

  threshold() {
    return Math.min(window.innerWidth, window.innerHeight) * 0.085;
  }

  down(e) {
    if (e.target.closest && e.target.closest('[data-ui]')) return;
    if (this.active) return;
    e.preventDefault();
    const now = performance.now();
    this.active = { pid: e.pointerId, id: ++this.seq, pts: [{ x: e.clientX, y: e.clientY, t: now }], committed: false, circled: false, start: now };
    this.h.onStroke(this.active.id, this.active.pts, false);
  }

  move(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.pid) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const now = performance.now();
    for (const ev of evs.length ? evs : [e]) a.pts.push({ x: ev.clientX, y: ev.clientY, t: now });
    this.h.onStroke(a.id, a.pts, false);
    if (!a.committed) this.tryCommit(a, false);
    if (!a.circled && isCounterClockwiseLoop(a.pts, this.threshold())) {
      a.circled = true;
      this.h.onCircle?.();
      this.finish(a);
      return;
    }
    if (now - a.start > 1600) this.finish(a);
  }

  up(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.pid) return;
    if (!a.committed) this.tryCommit(a, true);
    this.finish(a);
  }

  finish(a) {
    this.h.onStroke(a.id, a.pts, true, a.circled);
    this.active = null;
  }

  tryCommit(a, final) {
    const p0 = a.pts[0];
    const p = a.pts[a.pts.length - 1];
    const d = Math.hypot(p.x - p0.x, p.y - p0.y);
    const th = this.threshold();
    if (d >= th || (final && d >= th * 0.45)) {
      a.committed = true;
      this.h.onSwipe({ a: { x: p0.x, y: p0.y }, b: { x: p.x, y: p.y }, dx: p.x - p0.x, dy: p.y - p0.y, id: a.id });
    }
  }
}

/**
 * A stroke counts as a counter-clockwise loop (as seen on screen) when it winds at least
 * ~300° around its own centre, stays roughly round, and is big enough to be deliberate.
 */
export function isCounterClockwiseLoop(pts, minSize) {
  if (pts.length < 12) return false;
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let wind = 0, rSum = 0, rMin = Infinity, rMax = 0;
  let prev = Math.atan2(-(pts[0].y - cy), pts[0].x - cx);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const r = Math.hypot(p.x - cx, p.y - cy);
    rSum += r;
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
    const a = Math.atan2(-(p.y - cy), p.x - cx); // y flipped: positive = counter-clockwise
    let d = a - prev;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    wind += d;
    prev = a;
  }
  const rAvg = rSum / (pts.length - 1);
  return wind > (Math.PI * 2 * 300) / 360 && rAvg > minSize * 0.45 && rMin > rAvg * 0.2 && rMax < rAvg * 2.6;
}
