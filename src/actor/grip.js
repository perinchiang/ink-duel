// Shared weapon target and elbow clearance for both procedural and skinned actors.
import * as THREE from 'three';
import { solveTwoBone } from './ik.js';

const v = new THREE.Vector3(), local = new THREE.Vector3();
const inverse = new THREE.Quaternion();

export function fitGrip(target, direction, right, left, spacing, reach, hips, chestQ) {
  // The two reach balls live in RIGHT-grip space. Do not clamp each hand separately.
  const leftCentre = left.clone().addScaledVector(direction, spacing);
  inverse.copy(chestQ).invert();
  for (let n = 0; n < 24; n++) {
    local.copy(target).sub(hips).applyQuaternion(inverse);
    // Keep the entire handle in front of the chest, including the lower palm.
    const bladeZ = v.copy(direction).applyQuaternion(inverse).z;
    local.z = Math.max(local.z, 0.28 + Math.max(0, bladeZ * spacing));
    target.copy(local).applyQuaternion(chestQ).add(hips);
    for (const centre of [right, leftCentre]) {
      v.subVectors(target, centre);
      if (v.length() > reach) target.copy(centre).add(v.setLength(reach));
    }
  }
  return target;
}

export function armClearance(a, b, hips, chestQ, start = 0) {
  inverse.copy(chestQ).invert();
  let score = 10;
  for (let i = start; i <= 12; i++) {
    local.copy(a).lerp(b, i / 12).sub(hips).applyQuaternion(inverse);
    if (local.y < 0.06 || local.y > 0.5) continue;
    // Torso + sleeve allowance, rather than a zero-radius bone line.
    score = Math.min(score, Math.hypot(local.x / 0.27, local.z / 0.205));
  }
  return score;
}

export function solveClearArm(shoulder, hand, upper, fore, side, hips, chestQ, elbow, end) {
  const axis = hand.clone().sub(shoulder).normalize();
  const pole = new THREE.Vector3(side * 0.65, -0.4, 0.85).applyQuaternion(chestQ);
  const candidate = new THREE.Vector3(), tip = new THREE.Vector3();
  let best = -Infinity;
  for (let i = 0; i < 20; i++) {
    const angle = i === 0 ? 0 : Math.ceil(i / 2) * Math.PI / 10 * (i % 2 ? 1 : -1);
    solveTwoBone(shoulder, hand, upper, fore, pole.clone().applyAxisAngle(axis, angle), candidate, tip);
    const foreClearance = armClearance(candidate, tip, hips, chestQ);
    const upperClearance = armClearance(shoulder, candidate, hips, chestQ, 5);
    // Upper sleeves join the torso at the shoulder; prioritise keeping the entire
    // forearm out of the chest before choosing the most natural elbow bend.
    const score = Math.min(1.1, foreClearance) * 3 + Math.min(1.05, upperClearance) * 0.2 - Math.abs(angle) * 0.01;
    if (score > best) { best = score; elbow.copy(candidate); end.copy(tip); }
  }
}
