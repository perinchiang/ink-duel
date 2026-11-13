// Analytic two-bone IK: given shoulder s and target t, find elbow and the reachable end.
import * as THREE from 'three';

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();

export function solveTwoBone(s, t, l1, l2, pole, outElbow, outEnd) {
  _d.subVectors(t, s);
  let dist = _d.length();
  const maxR = (l1 + l2) * 0.995;
  const minR = Math.abs(l1 - l2) + 0.03;
  dist = Math.min(maxR, Math.max(minR, dist));
  if (_d.lengthSq() < 1e-8) _d.set(0, -1, 0);
  _d.normalize();
  outEnd.copy(s).addScaledVector(_d, dist);
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0).addScaledVector(_d, -_d.y);
  _p.normalize();
  outElbow.copy(s).addScaledVector(_d, l1 * Math.cos(a)).addScaledVector(_p, l1 * Math.sin(a));
}

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Vector3();

/** Place a Y-aligned part centred between a and b. */
export function placeSegment(obj, a, b) {
  obj.position.lerpVectors(a, b, 0.5);
  _m.subVectors(b, a);
  if (_m.lengthSq() < 1e-10) return;
  obj.quaternion.setFromUnitVectors(UP, _m.normalize());
}
