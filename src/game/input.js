// Touch / mouse swipes. A swipe commits as soon as it is long enough (not on release),
// so parries respond the moment the finger has clearly moved. The stroke keeps drawing.

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
    this.active = { pid: e.pointerId, id: ++this.seq, pts: [{ x: e.clientX, y: e.clientY, t: now }], committed: false, commitAt: 0 };
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
    else if (now - a.commitAt > 240) this.finish(a);
  }

  up(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.pid) return;
    if (!a.committed) this.tryCommit(a, true);
    this.finish(a);
  }

  finish(a) {
    this.h.onStroke(a.id, a.pts, true);
    this.active = null;
  }

  tryCommit(a, final) {
    const p0 = a.pts[0];
    const p = a.pts[a.pts.length - 1];
    const d = Math.hypot(p.x - p0.x, p.y - p0.y);
    const th = this.threshold();
    if (d >= th || (final && d >= th * 0.45)) {
      a.committed = true;
      a.commitAt = performance.now();
      this.h.onSwipe({ a: { x: p0.x, y: p0.y }, b: { x: p.x, y: p.y }, dx: p.x - p0.x, dy: p.y - p0.y, id: a.id });
    }
  }
}
