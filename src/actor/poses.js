// Key poses. Every fighter is posed in its own frame, rooted at its feet:
//   +Z = toward the opponent, +X = the fighter's LEFT, −X = the fighter's right
//   (the sword hand), +Y = up.
//
//   hilt   – where the right hand grips the sword
//   dir    – blade direction (grip → tip)
//   edge   – the way the cutting edge faces (the flat is perpendicular to it)
//   lhand  – free hand target for iai; otherwise derived from the two-handed grip
//   sheath – 0..1, pulls the sword into the scabbard at the left hip
//   root   – [x, z] step offset; crouch lowers the hips; lean / twist / tilt the torso
//
// Hanmi stance: left foot forward, right foot back. Both hands share the tsuka.
export const HAND_SPACING = 0.145;
export const STANCE_TWIST = 0.62;

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function makePose(o = {}) {
  const p = {
    root: [0, 0],
    crouch: 0.08,
    lean: 0.05,
    twist: STANCE_TWIST,
    pelvis: o.pelvis ?? (o.twist ?? STANCE_TWIST) * 0.65,
    weight: [0.015, 0.065], // pelvis translation relative to stance/root, independent of chest
    tilt: 0,
    hilt: [-0.14, 1.12, 0.36],
    dir: [0, 0.6, 0.8],
    edge: [0, 1, 0],
    lhand: 'hilt',
    two: 1,
    head: [0, 0],
    sheath: 0,
    elbowR: -0.35, // forward/back component of the right elbow pole
    ...o,
    // Explicit off-hand targets are reserved for iai; every other keyframe grips the tsuka.
    lhand: o.lhand ?? 'hilt',
    two: o.two ?? (o.lhand === undefined ? 1 : 0),
  };
  p.root = [...p.root];
  p.weight = [...p.weight];
  p.head = [...p.head];
  p.hilt = [...p.hilt];
  p.dir = norm(p.dir);
  p.edge = norm(p.edge);
  if (p.lhand === 'hilt' || p.two === 1) {
    p.lhand = p.hilt.map((v, i) => v - p.dir[i] * HAND_SPACING);
  } else p.lhand = [...p.lhand];
  return p;
}

const SCALARS = ['crouch', 'lean', 'twist', 'pelvis', 'tilt', 'two', 'sheath', 'elbowR'];
const VECTORS = ['root', 'weight', 'hilt', 'dir', 'edge', 'lhand', 'head'];

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
  // 按剑: point resting toward the ground ahead; free hand low beside the hip
  rest: makePose({ hilt: [-0.02, 1.04, 0.34], dir: [0, 0.18, 1], edge: [0, -1, 0.18], lean: 0.04, crouch: 0.055, head: [0.06, 0] }),
  // 中段: point forward, knees soft, free hand relaxed behind the hip
  guardM: makePose({ hilt: [-0.02, 1.08, 0.36], dir: [0, 0.32, 1], edge: [0, -1, 0.32], crouch: 0.08, lean: 0.06 }),
  // guards: the side the blade covers is the side your cut will be stopped on
  // 八相 / side guards: both hands stay on the tsuka while the chest winds into the cut.
  guardL: makePose({ hilt: [-0.1, 1.18, 0.38], dir: [-0.72, 0.12, 0.68], edge: [0.1, 0.95, 0.25], twist: -0.38, crouch: 0.11, lean: 0.05 }),
  guardR: makePose({ hilt: [0.08, 1.18, 0.38], dir: [0.72, 0.12, 0.68], edge: [-0.1, 0.95, 0.25], twist: 0.72, crouch: 0.11, lean: 0.05 }),
  // 上段: blade high and slightly behind the crown.
  guardH: makePose({ hilt: [-0.02, 1.72, 0.18], dir: [0.42, 0.7, -0.58], edge: [0, 1, 0.2], twist: 0.5, crouch: 0.13, lean: -0.03, head: [-0.06, 0] }),
  // 下段: pelvis sinks and the point threatens the ground in front.
  guardD: makePose({ hilt: [-0.02, 0.84, 0.42], dir: [-0.2, -0.72, 0.66], edge: [0, -0.7, -0.72], twist: 0.42, crouch: 0.32, lean: 0.18, weight: [0.02, 0.13] }),
  // knocked open by a parry
  stagger: makePose({ hilt: [-0.42, 1.7, -0.12], dir: [-0.6, 0.7, -0.38], edge: [0, 0, 1], lhand: [0.48, 1.22, 0.05], root: [0, -0.32], lean: -0.26, twist: -0.36, crouch: 0.05, head: [-0.28, 0.2] }),
  // defeated: kneeling on the planted sword
  kneel: makePose({ hilt: [-0.22, 0.72, 0.42], dir: [0.02, -1, 0.06], edge: [1, 0, 0], lhand: [0.22, 0.62, 0.3], crouch: 0.5, lean: 0.45, head: [0.5, 0] }),
};

// Opponent attacks, named by where the blade comes from as the player sees it:
//   L – the opponent's forehand, from his right shoulder (screen-left), cutting down
//   R – his backhand, from his left shoulder (screen-right)
//   O – straight down from overhead, two-handed
export const ATTACKS = {
  L: {
      windup: makePose({ hilt: [-0.18, 1.66, 0.02], dir: [-0.7, 0.58, -0.42], edge: [0.6, 0, 0.8], twist: -0.58, lean: -0.06, crouch: 0.13, root: [0, -0.06] }),
    impact: makePose({ hilt: [-0.02, 1.34, 0.58], dir: [0.55, -0.04, 0.83], edge: [0.8, -0.6, 0], twist: 0.3, lean: 0.18, crouch: 0.16, root: [0, 0.42] }),
    follow: makePose({ hilt: [0.2, 1.0, 0.4], dir: [0.86, -0.42, 0.3], edge: [0.3, -0.6, -0.7], twist: 0.7, lean: 0.3, crouch: 0.2, root: [0, 0.46] }),
  },
  R: {
    windup: makePose({ hilt: [0.18, 1.66, 0.02], dir: [0.7, 0.58, -0.42], edge: [-0.6, 0, 0.8], twist: 0.76, lean: -0.03, crouch: 0.13, root: [0, -0.06] }),
    impact: makePose({ hilt: [0.02, 1.34, 0.58], dir: [-0.55, -0.04, 0.83], edge: [-0.8, -0.6, 0], twist: -0.25, lean: 0.18, crouch: 0.16, root: [0, 0.42] }),
    follow: makePose({ hilt: [-0.2, 1.0, 0.4], dir: [-0.86, -0.42, 0.3], edge: [-0.3, -0.6, -0.7], twist: -0.58, lean: 0.28, crouch: 0.2, root: [0, 0.46] }),
  },
  O: {
    windup: makePose({ hilt: [-0.02, 1.92, 0.1], dir: [0.05, 0.76, -0.65], edge: [0, 0.6, 0.8], twist: 0.46, lean: -0.1, crouch: 0.08, root: [0, -0.06] }),
    impact: makePose({ hilt: [-0.02, 1.44, 0.58], dir: [0, 0.0, 1], edge: [0, -1, 0.05], twist: 0.2, lean: 0.2, crouch: 0.14, root: [0, 0.42] }),
    follow: makePose({ hilt: [-0.02, 0.94, 0.48], dir: [0, -0.92, 0.4], edge: [0, -0.4, -0.9], twist: 0.3, lean: 0.4, crouch: 0.28, root: [0, 0.46] }),
  },
  D: {
    windup: makePose({ hilt: [-0.06, 0.82, 0.34], dir: [-0.35, -0.7, 0.62], edge: [0.1, -0.7, -0.7], twist: 0.56, lean: 0.2, crouch: 0.34, weight: [0.02, 0.14], root: [0, -0.08] }),
    impact: makePose({ hilt: [0.08, 1.28, 0.62], dir: [0.68, 0.18, 0.71], edge: [0.1, 0.85, -0.3], twist: -0.2, lean: 0.2, crouch: 0.19, root: [0, 0.38] }),
    follow: makePose({ hilt: [0.26, 1.48, 0.38], dir: [0.9, 0.32, 0.28], edge: [0, 0.3, -0.95], twist: -0.5, lean: 0.08, crouch: 0.16, root: [0, 0.42] }),
  },
};

export const GUARD_POSE = { L: POSES.guardL, R: POSES.guardR, H: POSES.guardH, D: POSES.guardD };

// ---- the player's own poses (same frame; the player faces the opponent too) --------
// Seen over the player's right shoulder, screen-left is the player's left (+X).
export const PLAYER = {
  // meet each incoming cut with the blade raised across its path
  parry: {
    L: makePose({ two: 1, hilt: [0.04, 1.44, 0.42], dir: [0.48, 0.8, 0.36], edge: [1, 0.2, 0.1], twist: 0.36, crouch: 0.13, lean: 0.06 }),
    R: makePose({ two: 1, hilt: [-0.28, 1.44, 0.4], dir: [-0.4, 0.84, 0.36], edge: [-1, 0.2, 0.1], twist: -0.16, crouch: 0.13, lean: 0.06 }),
    O: makePose({ two: 1, hilt: [-0.3, 1.66, 0.32], dir: [0.98, 0.18, 0.1], edge: [0, 1, 0], crouch: 0.17, lean: -0.02, head: [-0.1, 0] }),
  },
  // 归鞘: the blade in the scabbard, right hand on the hilt across the body, weight low
  sheathed: makePose({ two: 0, sheath: 1, crouch: 0.22, lean: 0.16, twist: 0.5, root: [0, -0.05], head: [0.05, -0.45] }),
  // 出鞘斩: a flat draw-cut that carries the whole body through
  // 居合见切: right hand explodes forward while the left hand rips the saya back.
  drawCut: makePose({ two: 0, hilt: [-0.18, 1.3, 0.64], dir: [-0.58, 0.04, 0.82], edge: [-1, 0, 0.1], lhand: [0.38, 1.02, -0.28], root: [0, 0.6], crouch: 0.25, lean: 0.28, twist: 0.42 }),
  drawFollow: makePose({ two: 0, hilt: [-0.52, 1.32, 0.26], dir: [-0.94, 0.18, -0.16], edge: [-0.5, 0, -1], lhand: [0.5, 1.04, -0.38], root: [0, 0.64], crouch: 0.2, lean: 0.16, twist: 0.68, head: [0, -0.15] }),
};

/**
 * A cut drawn from a screen swipe. u = unit swipe direction on screen, y up.
 * Screen right is the player's right (−X), so the local lateral is −u.x.
 * Returns [windup, impact, follow].
 */
export function cutPoses(ux, uy) {
  const length = Math.hypot(ux, uy) || 1;
  const lx = -ux / length, ly = uy / length;
  const C = [-0.17, 1.18, 0.28];
  // Sweep in the lateral/vertical plane with slight forward clearance.
  // Edge is the rotational tangent, never a parallel-to-blade hint.
  const blade = (angle) => ({
    dir: [lx * Math.sin(angle) - ly * Math.cos(angle), ly * Math.sin(angle) + lx * Math.cos(angle), 0.3],
    edge: [lx * Math.cos(angle) + ly * Math.sin(angle), ly * Math.cos(angle) - lx * Math.sin(angle), 0],
  });
  const windup = makePose({
    hilt: [C[0] - lx * 0.16, C[1] - ly * 0.28 + 0.1, 0.22],
    ...blade(-1.3),
    elbowR: 0.8,
    two: 1,
    lhand: [0.29, 0.76, -0.08],
    twist: -lx * 0.52 + 0.05,
    pelvis: -lx * 0.22,
    weight: [0.035, -0.08],
    crouch: 0.16,
    lean: -0.02,
    root: [0, -0.02],
  });
  const impact = makePose({
    hilt: [C[0] - 0.18 + lx * 0.08, C[1] + 0.26 + ly * 0.1, 0.3],
    ...blade(0.15),
    elbowR: 0.8,
    two: 1,
    lhand: [0.29, 0.75, -0.1],
    twist: lx * 0.12 + 0.12,
    pelvis: lx * 0.3 + 0.08,
    weight: [-0.045, 0.07],
    crouch: 0.15,
    lean: 0.16,
    root: [0, 0.12],
  });
  const follow = makePose({
    // Finish across the shoulder line instead of disappearing behind the chest.
    // Keep lateral reach compact; the blade still completes the same transverse arc.
    hilt: [C[0] + lx * 0.55, C[1] + 0.22 + ly * 0.1, 0.18],
    ...blade(1.65),
    elbowR: 0.8,
    two: 1,
    lhand: [0.29, 0.73, -0.12],
    twist: lx * 0.48 + 0.12,
    pelvis: lx * 0.24 + 0.08,
    weight: [-0.045, 0.06],
    crouch: 0.19,
    lean: 0.22,
    root: [0, 0.14],
  });
  return [windup, impact, follow];
}

export function dodgePose(side) {
  // side: +1 = screen right = the player's right (−X)
  return makePose({ ...POSES.guardM, hilt: [...POSES.guardM.hilt], root: [-side * 0.55, -0.08], crouch: 0.24, lean: 0.08, tilt: side * 0.16, twist: 0.1 });
}

export function hurtPose() {
  return makePose({ ...POSES.guardM, hilt: [-0.2, 1.05, 0.22], dir: [-0.2, 0.3, 0.9], root: [0, -0.18], lean: -0.22, crouch: 0.06, twist: -0.2, head: [-0.25, 0.1] });
}
