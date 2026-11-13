// One continuous tapered trouser silhouette per leg; no exposed joint balls.
import * as THREE from 'three';
import { solveTwoBone } from './ik.js';
const SIDES = 12;
const radii = [0.115, 0.13, 0.098, 0.075, 0.052];
export function legGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(5 * SIDES * 3), 3));
  const indices = [];
  for (let r = 0; r < 4; r++) for (let s = 0; s < SIDES; s++) {
    const a = r * SIDES + s, b = r * SIDES + (s + 1) % SIDES;
    indices.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
  }
  g.setIndex(indices);
  return g;
}
export function solveLeg(hip, ankle, side, knee, end) {
  // Exceptional dodge/draw transitions may outrun a planted shoe. Fit the cloth
  // chain to that support rather than leaving an exposed gap at the ankle.
  const length = Math.max(0.46, hip.distanceTo(ankle) / (2 * 0.995));
  solveTwoBone(hip, ankle, length, length, new THREE.Vector3(side * 0.22, 0, 1), knee, end);
}
export function shapeLeg(g, hip, knee, ankle) {
  const centres = [hip, hip.clone().lerp(knee, 0.5), knee, knee.clone().lerp(ankle, 0.55), ankle];
  const tangent = new THREE.Vector3(), x = new THREE.Vector3(), z = new THREE.Vector3();
  const pos = g.attributes.position;
  for (let r = 0; r < 5; r++) {
    tangent.subVectors(centres[Math.min(4, r + 1)], centres[Math.max(0, r - 1)]).normalize();
    x.set(Math.abs(tangent.z) > 0.95 ? 1 : 0, 0, Math.abs(tangent.z) > 0.95 ? 0 : 1).cross(tangent).normalize();
    z.crossVectors(tangent, x).normalize();
    for (let s = 0; s < SIDES; s++) {
      const a = s / SIDES * Math.PI * 2;
      const p = centres[r].clone().addScaledVector(x, Math.cos(a) * radii[r]).addScaledVector(z, Math.sin(a) * radii[r] * 0.85);
      pos.setXYZ(r * SIDES + s, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}
