// Key poses for the swordsman. Coordinates are relative to the swordsman's root
// (his feet), axis-aligned with the world: +X = screen right, +Z = toward the player.
// The swordsman holds the sword in his right hand, which sits on screen-left.
//
//   hilt  – where the right hand grips the sword
//   dir   – blade direction (grip → tip)
//   edge  – the way the cutting edge faces (the blade flat is perpendicular to it)
//   lhand – left hand target (sword-finger 剑指 gesture), or 'hilt' for a two-hand grip
//   root  – [x, z] step offset, crouch – lower the hips, lean/twist/tilt – torso

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function makePose(o = {}) {
  const p = {
    root: [0, 0],
    crouch: 0.06,
    lean: 0.05,
    twist: 0,
    tilt: 0,
    hilt: [-0.2, 1.12, 0.32],
    dir: [0, 1, 0],
    edge: [1, 0, 0],
    lhand: [0.2, 1.1, 0.2],
    two: 0,
    head: [0, 0],
    ...o,
  };
  p.dir = norm(p.dir);
  p.edge = norm(p.edge);
  if (p.lhand === 'hilt') {
    p.two = 1;
    p.lhand = [p.hilt[0] - p.dir[0] * 0.1, p.hilt[1] - p.dir[1] * 0.1, p.hilt[2] - p.dir[2] * 0.1];
  }
  return p;
}

const SCALARS = ['crouch', 'lean', 'twist', 'tilt', 'two'];
const VECTORS = ['root', 'hilt', 'dir', 'edge', 'lhand', 'head'];

export function copyPose(src, out = makePose()) {
  for (const k of SCALARS) out[k] = src[k];
  for (const k of VECTORS) for (let i = 0; i < src[k].length; i++) out[k][i] = src[k][i];
  return out;
}

export function blendPose(a, b, t, out) {
  for (const k of SCALARS) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of VECTORS) {
    const A = a[k], B = b[k], O = out[k];
    for (let i = 0; i < A.length; i++) O[i] = A[i] + (B[i] - A[i]) * t;
  }
  return out;
}

export const POSES = {
  // sword lowered at his side, sword-finger raised — the salute before the duel
  rest: makePose({ hilt: [-0.3, 0.98, 0.12], dir: [-0.12, -0.95, 0.28], edge: [0, 0, 1], lhand: [-0.02, 1.28, 0.28], lean: 0.12, crouch: 0.02, head: [0.12, 0] }),
  // guards: where his blade covers is where your cut will be stopped
  guardL: makePose({ hilt: [-0.22, 1.13, 0.34], dir: [-0.08, 0.96, 0.28], edge: [1, 0, 0.25], lhand: [0.14, 1.27, 0.26], twist: -0.15, lean: 0.06, crouch: 0.07 }),
  guardR: makePose({ hilt: [0.12, 1.1, 0.36], dir: [0.18, 0.95, 0.22], edge: [-1, 0, 0.25], lhand: [0.34, 1.0, -0.05], twist: 0.3, lean: 0.06, crouch: 0.07 }),
  guardH: makePose({ hilt: [-0.24, 1.6, 0.28], dir: [0.97, 0.15, 0.12], edge: [0, 1, 0.1], lhand: [0.3, 1.64, 0.32], crouch: 0.1, lean: 0.02, head: [-0.08, 0] }),
  // knocked open by a parry
  stagger: makePose({ hilt: [-0.42, 1.72, -0.2], dir: [-0.55, 0.55, -0.62], edge: [0, 0, 1], lhand: [0.5, 1.25, 0.0], root: [0, -0.3], lean: -0.28, twist: -0.35, crouch: 0.02, head: [-0.3, 0.2] }),
  // defeated: kneeling on the planted sword
  kneel: makePose({ hilt: [-0.22, 0.72, 0.42], dir: [0.02, -1, 0.06], edge: [1, 0, 0], lhand: [0.22, 0.62, 0.3], crouch: 0.5, lean: 0.45, head: [0.5, 0] }),
};

// Attacks are named by where the blade comes FROM on screen.
//   L – from upper-left, cutting down to the right (forehand)
//   R – from upper-right, cutting down to the left (backhand)
//   O – straight down from overhead (two-handed)
export const ATTACKS = {
  L: {
    windup: makePose({ hilt: [-0.34, 1.8, -0.05], dir: [-0.38, 0.72, -0.58], edge: [0.5, 0, 0.85], lhand: [0.3, 1.3, 0.25], twist: -0.45, lean: -0.05, crouch: 0.08, root: [0, -0.05] }),
    impact: makePose({ hilt: [-0.02, 1.3, 0.58], dir: [0.18, 0.06, 0.98], edge: [0.7, -0.7, 0], lhand: [0.32, 1.15, -0.05], twist: 0.25, lean: 0.18, crouch: 0.1, root: [0, 0.42] }),
    follow: makePose({ hilt: [0.3, 0.86, 0.36], dir: [0.58, -0.62, 0.3], edge: [0.3, -0.5, -0.8], lhand: [0.4, 1.25, -0.2], twist: 0.55, lean: 0.3, crouch: 0.14, root: [0, 0.45] }),
  },
  R: {
    windup: makePose({ hilt: [0.22, 1.66, 0.02], dir: [0.42, 0.72, -0.55], edge: [-0.5, 0, 0.85], lhand: [0.05, 1.05, 0.25], twist: 0.55, lean: -0.02, crouch: 0.08, root: [0, -0.05] }),
    impact: makePose({ hilt: [0.04, 1.3, 0.58], dir: [-0.18, 0.06, 0.98], edge: [-0.7, -0.7, 0], lhand: [0.35, 1.2, -0.05], twist: -0.2, lean: 0.18, crouch: 0.1, root: [0, 0.42] }),
    follow: makePose({ hilt: [-0.34, 0.88, 0.34], dir: [-0.6, -0.6, 0.3], edge: [-0.3, -0.5, -0.8], lhand: [0.42, 1.3, -0.15], twist: -0.45, lean: 0.28, crouch: 0.14, root: [0, 0.45] }),
  },
  O: {
    windup: makePose({ hilt: [-0.05, 1.93, 0.08], dir: [0.05, 0.86, -0.5], edge: [0, 0.4, 0.9], lhand: 'hilt', twist: -0.05, lean: -0.1, crouch: 0.02, root: [0, -0.05] }),
    impact: makePose({ hilt: [-0.03, 1.42, 0.6], dir: [0, 0.08, 1], edge: [0, -1, 0.05], lhand: 'hilt', lean: 0.2, crouch: 0.06, root: [0, 0.42] }),
    follow: makePose({ hilt: [-0.03, 0.9, 0.42], dir: [0, -0.78, 0.62], edge: [0, -0.6, -0.8], lhand: 'hilt', lean: 0.38, crouch: 0.18, root: [0, 0.45] }),
  },
};

export const GUARD_POSE = { L: POSES.guardL, R: POSES.guardR, H: POSES.guardH };
