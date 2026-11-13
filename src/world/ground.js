// The duel ground: a large transparent canvas-textured plane that keeps every ink stain
// spilled during the fight.
import * as THREE from 'three';
import { makeSplat, drawBrush } from '../render/brush.js';
import { mulberry32 } from '../core/noise.js';

export class Ground {
  constructor(center = new THREE.Vector3(0, 0, -3), size = 9, res = 1024) {
    this.center = center.clone();
    this.size = size;
    this.res = res;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = res;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(center.x, 0.001, center.z);
    this.mesh.renderOrder = -2;
    this.rnd = mulberry32(99);
    this.reset();
  }

  reset() {
    const g = this.ctx, R = this.res;
    g.clearRect(0, 0, R, R);
    // soft wash where the two duellists stand
    const grd = g.createRadialGradient(R / 2, R * 0.46, R * 0.04, R / 2, R * 0.5, R * 0.5);
    grd.addColorStop(0, 'rgba(22,21,26,0.10)');
    grd.addColorStop(0.6, 'rgba(22,21,26,0.04)');
    grd.addColorStop(1, 'rgba(22,21,26,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, R, R);
    // dry horizontal strokes that read as trampled earth in perspective
    for (let i = 0; i < 22; i++) {
      const y = R * (0.15 + this.rnd() * 0.75);
      const x = R * (0.05 + this.rnd() * 0.5);
      const len = R * (0.15 + this.rnd() * 0.35);
      const pts = [];
      for (let k = 0; k <= 8; k++) pts.push({ x: x + (len * k) / 8, y: y + Math.sin(k + i) * 3 });
      const edge = 1 - Math.min(1, Math.abs(y / R - 0.5) * 2);
      drawBrush(g, pts, { width: 6 + this.rnd() * 14, alpha: 0.06 * edge + 0.02, dry: 0.9, seed: i * 7, core: 0.1 });
    }
    this.tex.needsUpdate = true;
  }

  /** Spill ink at a world-space point on the ground. */
  stain(x, z, size = 0.25, alpha = 0.55, dir) {
    const R = this.res;
    const u = ((x - this.center.x) / this.size + 0.5) * R;
    const v = ((z - this.center.z) / this.size + 0.5) * R;
    const r = (size / this.size) * R;
    const sp = makeSplat(r, { drops: 10, streaks: 3, dir, spread: 0.8 });
    const g = this.ctx;
    g.save();
    g.globalAlpha = alpha;
    g.translate(u, v);
    g.scale(1, 1);
    g.drawImage(sp.canvas, -sp.cx, -sp.cy);
    g.restore();
    this.tex.needsUpdate = true;
  }
}
