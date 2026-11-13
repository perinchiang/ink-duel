// A verlet ribbon (hat tails, sword tassel) drawn as a camera-facing tapered strip.
import * as THREE from 'three';

const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Ribbon {
  constructor({ count = 9, seg = 0.07, width = 0.03, color = '#141317', taper = 0.7, gravity = 5.5, drag = 0.94 } = {}) {
    this.n = count;
    this.seg = seg;
    this.width = width;
    this.taper = taper;
    this.gravity = gravity;
    this.drag = drag;
    this.p = Array.from({ length: count }, () => new THREE.Vector3());
    this.q = Array.from({ length: count }, () => new THREE.Vector3());
    this.ready = false;
    const pos = new Float32Array(count * 2 * 3);
    const idx = [];
    for (let i = 0; i < count - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  reset(anchor) {
    for (let i = 0; i < this.n; i++) {
      this.p[i].copy(anchor).y -= i * this.seg;
      this.q[i].copy(this.p[i]);
    }
    this.ready = true;
  }

  update(anchor, dt, camPos, wind) {
    if (!this.ready) this.reset(anchor);
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      this.p[0].copy(anchor);
      this.q[0].copy(anchor);
      for (let i = 1; i < this.n; i++) {
        const p = this.p[i], q = this.q[i];
        _t.subVectors(p, q).multiplyScalar(this.drag);
        q.copy(p);
        p.add(_t);
        p.y -= this.gravity * h * h;
        if (wind) p.addScaledVector(wind, h * h * (i / this.n));
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < this.n; i++) {
          const a = this.p[i - 1], b = this.p[i];
          _t.subVectors(b, a);
          const l = _t.length() || 1e-5;
          b.copy(a).addScaledVector(_t, this.seg / l);
          if (b.y < 0.01) b.y = 0.01;
        }
      }
    }
    const pos = this.mesh.geometry.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      const a = this.p[Math.max(0, i - 1)], b = this.p[Math.min(this.n - 1, i + 1)];
      _t.subVectors(b, a).normalize();
      _c.subVectors(camPos, this.p[i]).normalize();
      _s.crossVectors(_t, _c).normalize().multiplyScalar(this.width * (1 - this.taper * (i / (this.n - 1))) * 0.5);
      const p = this.p[i];
      pos[i * 6] = p.x + _s.x; pos[i * 6 + 1] = p.y + _s.y; pos[i * 6 + 2] = p.z + _s.z;
      pos[i * 6 + 3] = p.x - _s.x; pos[i * 6 + 4] = p.y - _s.y; pos[i * 6 + 5] = p.z - _s.z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
