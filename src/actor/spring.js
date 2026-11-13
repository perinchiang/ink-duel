// Second-order dynamics on every pose channel: the body follows its key poses with
// weight (a little lag, a little overshoot) instead of sliding between them linearly.
// Arms are fast and snappy, the torso slower and heavier.

const LAYOUT = [
  ['root', 2, 'body'],
  ['crouch', 1, 'body'],
  ['lean', 1, 'body'],
  ['twist', 1, 'body'],
  ['pelvis', 1, 'body'],
  ['weight', 2, 'body'],
  ['tilt', 1, 'body'],
  ['head', 2, 'head'],
  ['two', 1, 'arm'],
  ['hilt', 3, 'arm'],
  ['dir', 3, 'arm'],
  ['edge', 3, 'arm'],
  ['lhand', 3, 'arm'],
  ['sheath', 1, 'arm'],
];
const N = LAYOUT.reduce((s, l) => s + l[1], 0);

function read(pose, arr) {
  let i = 0;
  for (const [k, n] of LAYOUT) {
    if (n === 1) arr[i++] = pose[k];
    else for (let j = 0; j < n; j++) arr[i++] = pose[k][j];
  }
}

function write(arr, pose) {
  let i = 0;
  for (const [k, n] of LAYOUT) {
    if (n === 1) pose[k] = arr[i++];
    else for (let j = 0; j < n; j++) pose[k][j] = arr[i++];
  }
}

const GROUP = new Array(N);
{
  let i = 0;
  for (const [, n, g] of LAYOUT) for (let j = 0; j < n; j++) GROUP[i++] = g;
}

export class PoseSpring {
  constructor(pose, tune = {}) {
    this.tune = {
      body: { f: 3.4, z: 0.72, r: 0.4 },
      head: { f: 2.6, z: 0.8, r: 0.2 },
      arm: { f: 7.5, z: 0.64, r: 1.15 },
      ...tune,
    };
    this.x = new Float32Array(N);
    this.xp = new Float32Array(N);
    this.y = new Float32Array(N);
    this.yd = new Float32Array(N);
    this.reset(pose);
  }

  reset(pose) {
    read(pose, this.x);
    this.xp.set(this.x);
    this.y.set(this.x);
    this.yd.fill(0);
  }

  /** boost > 1 tightens everything (used for fast strikes so timing stays honest). */
  update(dt, pose, out, boost = 1) {
    if (dt <= 0) {
      write(this.y, out);
      return out;
    }
    read(pose, this.x);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < N; i++) {
      const T = this.tune[GROUP[i]];
      const f = T.f * (GROUP[i] === 'head' ? 1 : boost);
      const k1 = T.z / (Math.PI * f);
      const k2 = 1 / ((2 * Math.PI * f) ** 2);
      const k3 = (T.r * T.z) / (2 * Math.PI * f);
      const xd = (this.x[i] - this.xp[i]) / dt;
      for (let s = 0; s < steps; s++) {
        const k2s = Math.max(k2, (h * h) / 2 + (h * k1) / 2, h * k1);
        this.y[i] += h * this.yd[i];
        this.yd[i] += (h * (this.x[i] + k3 * xd - this.y[i] - k1 * this.yd[i])) / k2s;
      }
    }
    this.xp.set(this.x);
    write(this.y, out);
    return out;
  }
}
