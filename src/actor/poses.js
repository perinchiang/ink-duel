// Key poses. Every fighter is posed in its own frame, rooted at its feet:
//   +Z = toward the opponent, +X = the fighter's LEFT, −X = the fighter's right
//   (the sword hand), +Y = up.
//
//   hilt   – where the right hand grips the sword
//   dir    – blade direction (grip → tip)
//   edge   – the way the cutting edge faces (the flat is perpendicular to it)
//   lhand  – left hand target (剑指 sword-finger), or 'hilt' for a two-hand grip
//   sheath – 0..1, pulls the sword into the scabbard at the left hip
//   root   – [x, z] step offset; crouch lowers the hips; lean / twist / tilt the torso
//
// A jian is held point-forward: at rest the point is toward the opponent's throat.
// When the point does drop toward the ground the arm hangs straight, never crooked.

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function makePose(o = {}) {
  const p = {
    root: [0, 0],
    crouch: 0.08,
    lean: 0.05,
    twist: 0,
    tilt: 0,
    hilt: [-0.14, 1.12, 0.36],
    dir: [0, 0.6, 0.8],
    edge: [0, 1, 0],
    lhand: [0.22, 1.32, 0.1],
    two: 0,
    head: [0, 0],
    sheath: 0,
    ...o,
  };
  p.root = [...p.root];
  p.head = [...p.head];
  p.hilt = [...p.hilt];
  p.dir = norm(p.dir);
  p.edge = norm(p.edge);
  if (p.lhand === 'hilt') {
    p.two = 1;
    p.lhand = [p.hilt[0] - p.dir[0] * 0.1, p.hilt[1] - p.dir[1] * 0.1, p.hilt[2] - p.dir[2] * 0.1];
  } else p.lhand = [...p.lhand];
  return p;
}

const SCALARS = ['crouch', 'lean', 'twist', 'tilt', 'two', 'sheath'];
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
  // 按剑: arm hanging straight, point resting toward the ground ahead; sword-finger at the chest
  rest: makePose({ hilt: [-0.25, 0.83, 0.1], dir: [-0.06, -0.7, 0.71], edge: [0, 0.7, 0.7], lhand: [0.04, 1.22, 0.24], lean: 0.03, crouch: 0.02, head: [0.06, 0] }),
  // 中段: point at the opponent's throat, knees soft, sword-finger raised behind
  guardM: makePose({ hilt: [-0.2, 1.02, 0.34], dir: [-0.26, 0.12, 0.96], edge: [0, 1, 0], lhand: [0.2, 1.2, 0.2], crouch: 0.11, twist: 0.14, lean: 0.06 }),
  // guards: the side the blade covers is the side your cut will be stopped on
  guardL: makePose({ hilt: [-0.25, 1.16, 0.34], dir: [-0.12, 0.86, 0.5], edge: [-1, 0, 0.2], lhand: [0.24, 1.34, 0.12], twist: -0.12, crouch: 0.09, lean: 0.05 }),
  guardR: makePose({ hilt: [0.05, 1.16, 0.36], dir: [0.24, 0.84, 0.48], edge: [1, 0, 0.2], lhand: [0.3, 1.0, -0.06], twist: 0.3, crouch: 0.09, lean: 0.05 }),
  guardH: makePose({ hilt: [-0.24, 1.62, 0.26], dir: [0.98, 0.12, 0.16], edge: [0, 1, 0], lhand: [0.2, 1.66, 0.3], crouch: 0.12, lean: 0.02, head: [-0.06, 0] }),
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
    windup: makePose({ hilt: [-0.4, 1.74, -0.04], dir: [-0.62, 0.6, -0.5], edge: [0.6, 0, 0.8], lhand: [0.3, 1.3, 0.25], twist: -0.5, lean: -0.06, crouch: 0.1, root: [0, -0.06] }),
    impact: makePose({ hilt: [-0.04, 1.34, 0.56], dir: [0.55, -0.04, 0.83], edge: [0.8, -0.6, 0], lhand: [0.34, 1.16, -0.08], twist: 0.28, lean: 0.18, crouch: 0.14, root: [0, 0.42] }),
    follow: makePose({ hilt: [0.24, 0.98, 0.36], dir: [0.86, -0.42, 0.3], edge: [0.3, -0.6, -0.7], lhand: [0.42, 1.26, -0.22], twist: 0.6, lean: 0.3, crouch: 0.18, root: [0, 0.46] }),
  },
  R: {
    windup: makePose({ hilt: [0.28, 1.66, 0.0], dir: [0.62, 0.62, -0.48], edge: [-0.6, 0, 0.8], lhand: [0.08, 1.06, 0.24], twist: 0.58, lean: -0.03, crouch: 0.1, root: [0, -0.06] }),
    impact: makePose({ hilt: [0.02, 1.34, 0.56], dir: [-0.55, -0.04, 0.83], edge: [-0.8, -0.6, 0], lhand: [0.36, 1.22, -0.06], twist: -0.22, lean: 0.18, crouch: 0.14, root: [0, 0.42] }),
    follow: makePose({ hilt: [-0.36, 0.98, 0.34], dir: [-0.86, -0.42, 0.3], edge: [-0.3, -0.6, -0.7], lhand: [0.42, 1.3, -0.16], twist: -0.5, lean: 0.28, crouch: 0.18, root: [0, 0.46] }),
  },
  O: {
    windup: makePose({ hilt: [-0.05, 1.95, 0.08], dir: [0.03, 0.75, -0.66], edge: [0, 0.6, 0.8], lhand: 'hilt', twist: -0.05, lean: -0.1, crouch: 0.04, root: [0, -0.06] }),
    impact: makePose({ hilt: [-0.04, 1.44, 0.58], dir: [0, 0.0, 1], edge: [0, -1, 0.05], lhand: 'hilt', lean: 0.2, crouch: 0.1, root: [0, 0.42] }),
    follow: makePose({ hilt: [-0.04, 0.92, 0.48], dir: [0, -0.92, 0.4], edge: [0, -0.4, -0.9], lhand: 'hilt', lean: 0.4, crouch: 0.24, root: [0, 0.46] }),
  },
};

export const GUARD_POSE = { L: POSES.guardL, R: POSES.guardR, H: POSES.guardH };

// ---- the player's own poses (same frame; the player faces the opponent too) --------
// Seen over the player's right shoulder, screen-left is the player's left (+X).
export const PLAYER = {
  // meet each incoming cut with the blade raised across its path
  parry: {
    L: makePose({ hilt: [0.04, 1.44, 0.42], dir: [0.48, 0.8, 0.36], edge: [1, 0.2, 0.1], lhand: [0.24, 1.1, 0.18], twist: 0.36, crouch: 0.13, lean: 0.06 }),
    R: makePose({ hilt: [-0.28, 1.44, 0.4], dir: [-0.4, 0.84, 0.36], edge: [-1, 0.2, 0.1], lhand: [0.24, 1.22, 0.2], twist: -0.16, crouch: 0.13, lean: 0.06 }),
    O: makePose({ hilt: [-0.3, 1.66, 0.32], dir: [0.98, 0.18, 0.1], edge: [0, 1, 0], lhand: [0.24, 1.7, 0.34], crouch: 0.17, lean: -0.02, head: [-0.1, 0] }),
  },
  // 归鞘: the blade in the scabbard, right hand on the hilt across the body, weight low
  sheathed: makePose({ sheath: 1, crouch: 0.22, lean: 0.16, twist: 0.5, root: [0, -0.05], head: [0.05, -0.45] }),
  // 出鞘斩: a flat draw-cut that carries the whole body through
  drawCut: makePose({ hilt: [-0.16, 1.28, 0.62], dir: [-0.55, 0.05, 0.83], edge: [-1, 0, 0.1], lhand: [0.26, 1.06, 0.05], root: [0, 0.6], crouch: 0.22, lean: 0.26, twist: 0.38 }),
  drawFollow: makePose({ hilt: [-0.48, 1.3, 0.24], dir: [-0.92, 0.2, -0.18], edge: [-0.5, 0, -1], lhand: [0.3, 1.06, 0.02], root: [0, 0.62], crouch: 0.18, lean: 0.14, twist: 0.6, head: [0, -0.15] }),
};

/**
 * A cut drawn from a screen swipe. u = unit swipe direction on screen, y up.
 * Screen right is the player's right (−X), so the local lateral is −u.x.
 * Returns [windup, impact, follow].
 */
export function cutPoses(ux, uy) {
  const lx = -ux, ly = uy;
  const C = [-0.12, 1.34, 0.3];
  const windup = makePose({
    hilt: [C[0] - lx * 0.3, C[1] - ly * 0.32 + 0.1, 0.06],
    dir: [-lx * 0.75, -ly * 0.75 + 0.3, -0.12],
    edge: [lx, ly, 0.2],
    lhand: [0.2, 1.22, 0.2],
    twist: -lx * 0.42 + 0.05,
    crouch: 0.1,
    lean: -0.02,
    root: [0, -0.02],
  });
  const impact = makePose({
    hilt: [C[0] + lx * 0.06, C[1] + ly * 0.04 - 0.02, 0.58],
    dir: [lx * 0.42, ly * 0.42 + 0.05, 0.92],
    edge: [lx, ly, 0],
    lhand: [0.22, 1.18, 0.18],
    twist: lx * 0.12 + 0.12,
    crouch: 0.15,
    lean: 0.16,
    root: [0, 0.26],
  });
  const follow = makePose({
    hilt: [C[0] + lx * 0.28, C[1] + ly * 0.36 - 0.12, 0.42],
    dir: [lx * 0.85, ly * 0.85 - 0.1, 0.5],
    edge: [lx, ly, -0.4],
    lhand: [0.24, 1.22, 0.14],
    twist: lx * 0.48 + 0.12,
    crouch: 0.16,
    lean: 0.22,
    root: [0, 0.28],
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
