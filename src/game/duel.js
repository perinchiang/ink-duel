// The duel: the opponent's behaviour, how swipes become cuts / parries, and the outcome
// of every exchange. Rendering and input are owned elsewhere; this only decides.
import { POSES, ATTACKS, GUARD_POSE, blendPose, copyPose, makePose } from '../actor/poses.js';
import { ease, angDiff, clamp, noise1 } from '../core/noise.js';
import * as THREE from 'three';

const DIRS = ['L', 'R', 'O'];
// the swipe that meets each attack: toward where the blade comes from (math angle, y up)
export const PARRY_ANGLE = { L: 135, R: 45, O: 90 };
const PARRY_TOL = 42;
const PARRY_WINDOW = 0.36; // how early before impact a parry may be drawn
const PERFECT_WINDOW = 0.12;
const DODGE_WINDOW = 0.42;
const COVERS = { L: ['L', 'U'], R: ['R', 'U'], H: ['H'] };
const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _v = new THREE.Vector3();

export class Duel {
  constructor({ enemy, fx, blade, sfx, ground, view, hooks }) {
    this.enemy = enemy;
    this.fx = fx;
    this.blade = blade;
    this.sfx = sfx;
    this.ground = ground;
    this.view = view;
    this.hooks = hooks;
    this.pose = copyPose(POSES.rest);
    this.work = makePose();
    this.tel = { pts: [], alpha: 0, seed: 1 };
    this.reset();
  }

  reset() {
    this.time = 0;
    this.lastCut = -9;
    this.over = false;
    this.E = {
      state: 'rest', t: 0, dur: 0, from: copyPose(this.pose),
      hp: 30, max: 30, chip: 30, chipDelay: 0,
      guard: 'L', blocks: 0, attack: null, after: null,
      hurt: 0, hurtSide: 1, jolt: 0, flash: 0, glow: 0, dissolve: 0,
      lastDirs: [], phase2: false, counterNext: false,
    };
    this.P = { hp: 5, max: 5, parry: null, dodgeAt: -9, dodgeSide: 0 };
    this.combo = 0;
    this.stats = { perfect: 0, parry: 0, maxCombo: 0, hits: 0, start: 0 };
    this.hintsLeft = 3;
    this.hintBoost = false;
    this.endTimer = -1;
    this.ground?.reset();
  }

  begin() {
    this.stats.start = this.time;
    this.setState('intro', 1.4);
    this.E.guard = 'L';
  }

  setState(s, dur = 0) {
    const E = this.E;
    E.state = s;
    E.t = 0;
    E.dur = dur;
    copyPose(this.pose, E.from);
  }

  toIdle(newGuard = true) {
    const E = this.E;
    if (newGuard) {
      const options = ['L', 'R', 'H'].filter((g) => g !== E.guard || Math.random() < 0.3);
      E.guard = pick(options);
    }
    this.setState('idle', E.phase2 ? rand(0.55, 1.1) : rand(0.9, 1.6));
    E.blocks = 0;
  }

  startAttack({ counter = false, chain = false } = {}) {
    const E = this.E;
    let dir = pick(DIRS);
    const last = E.lastDirs;
    if (last.length >= 2 && last[last.length - 1] === dir && last[last.length - 2] === dir) dir = pick(DIRS.filter((d) => d !== dir));
    last.push(dir);
    if (last.length > 4) last.shift();
    let W = E.phase2 ? rand(0.55, 0.85) : rand(0.75, 1.05);
    if (counter) W = 0.5;
    if (chain) W = 0.48;
    const feint = E.phase2 && !counter && !chain && Math.random() < 0.28 ? pick(DIRS.filter((d) => d !== dir)) : null;
    E.attack = { dir, W, S: 0.13, feint, feintAt: W * 0.55, feinted: false, chain };
    this.setState('windup');
    this.sfx.windup();
  }

  // ---------------------------------------------------------------- update ----
  update(dt) {
    const E = this.E;
    this.time += dt;
    E.t += dt;
    E.hurt = Math.max(0, E.hurt - dt * 5);
    E.jolt = Math.max(0, E.jolt - dt * 7);
    E.flash = Math.max(0, E.flash - dt * 9);
    if (E.chipDelay > 0) E.chipDelay -= dt;
    else if (E.chip > E.hp) E.chip = Math.max(E.hp, E.chip - dt * 5);

    const out = this.work;
    let glow = 0;
    const A = E.attack;
    switch (E.state) {
      case 'rest':
        copyPose(POSES.rest, out);
        break;
      case 'intro': {
        blendPose(E.from, GUARD_POSE[E.guard], ease.inOut(E.t / E.dur), out);
        if (E.t >= E.dur) this.toIdle(false);
        break;
      }
      case 'idle':
      case 'flinch': {
        blendPose(E.from, GUARD_POSE[E.guard], ease.outCubic(E.t / (E.state === 'flinch' ? 0.22 : 0.32)), out);
        if (E.t >= E.dur) {
          if (E.state === 'flinch' && E.counterNext) this.startAttack({ counter: true });
          else if (E.state === 'flinch') this.toIdle(false);
          else this.startAttack();
        }
        break;
      }
      case 'windup': {
        if (A.feint && !A.feinted && E.t > A.feintAt) {
          A.feinted = true;
          A.dir = A.feint;
          A.W = E.phase2 ? 0.42 : 0.5;
          copyPose(this.pose, E.from);
          E.t = 0;
          this.sfx.windup();
        }
        const k = E.t / (A.W * 0.6);
        blendPose(E.from, ATTACKS[A.dir].windup, ease.outCubic(k), out);
        if (k >= 1) {
          // coiled tension: a small tremble while holding the raised blade
          const tr = 0.006;
          out.hilt[0] += (noise1(this.time * 37) - 0.5) * tr;
          out.hilt[1] += (noise1(this.time * 41 + 5) - 0.5) * tr;
        }
        glow = clamp(E.t / (A.W * 0.7)) * 0.75;
        if (E.t >= A.W) {
          this.setState('strike');
          copyPose(ATTACKS[A.dir].windup, E.from);
        }
        break;
      }
      case 'strike': {
        const u = E.t / A.S;
        blendPose(E.from, ATTACKS[A.dir].impact, ease.inQuad(u), out);
        glow = 0.85;
        if (u >= 1) {
          copyPose(ATTACKS[A.dir].impact, out);
          copyPose(out, this.pose);
          this.resolveImpact();
        }
        break;
      }
      case 'follow': {
        blendPose(ATTACKS[A.dir].impact, ATTACKS[A.dir].follow, ease.outCubic(E.t / 0.22), out);
        glow = 0.4 * (1 - E.t / 0.22);
        if (E.t >= 0.22) {
          const next = E.after;
          E.after = null;
          if (next === 'chain') this.startAttack({ chain: true });
          else this.setState('recover', next === 'dodged' ? 0.85 : 0.6);
        }
        break;
      }
      case 'recover': {
        blendPose(E.from, GUARD_POSE[E.guard], ease.inOut(E.t / E.dur), out);
        if (E.t >= E.dur) this.toIdle(false);
        break;
      }
      case 'stagger': {
        blendPose(E.from, POSES.stagger, ease.outCubic(E.t / 0.16), out);
        const w = Math.sin(this.time * 9) * 0.02 * (1 - E.t / E.dur);
        out.lean += w;
        out.hilt[1] += w;
        if (E.t >= E.dur) {
          this.combo = 0;
          this.setState('recover', 0.42);
        }
        break;
      }
      case 'dead': {
        blendPose(E.from, POSES.kneel, ease.outCubic(E.t / 0.75), out);
        E.dissolve = clamp((E.t - 1.0) / 2.2);
        if (E.t > 1.0 && Math.random() < dt * 14 * (1 - E.dissolve)) {
          this.enemy.chest(_v);
          _v.x += (Math.random() - 0.5) * 0.6;
          _v.z += (Math.random() - 0.5) * 0.5;
          this.ground?.stain(_v.x, _v.z, 0.12 + Math.random() * 0.12, 0.35);
        }
        if (E.t > 3.6 && this.endTimer < 0) {
          this.endTimer = 0;
          this.hooks.end?.(true, this.summary());
        }
        break;
      }
      case 'victor': {
        blendPose(E.from, POSES.rest, ease.inOut(E.t / 1.2), out);
        if (E.t > 1.8 && this.endTimer < 0) {
          this.endTimer = 0;
          this.hooks.end?.(false, this.summary());
        }
        break;
      }
    }

    // living additive layers
    if (E.state !== 'dead') {
      out.crouch += Math.sin(this.time * 2.1) * 0.01;
      out.hilt[1] += Math.sin(this.time * 2.1 + 0.6) * 0.008;
    }
    if (E.hurt > 0) {
      const h = E.hurt;
      out.lean -= 0.22 * h;
      out.twist += 0.28 * h * E.hurtSide;
      out.root[1] -= 0.08 * h;
      out.head[0] -= 0.3 * h;
    }
    if (E.jolt > 0) {
      out.hilt[2] -= 0.06 * E.jolt;
      out.hilt[0] += 0.03 * E.jolt * E.hurtSide;
      out.lean -= 0.05 * E.jolt;
    }
    copyPose(out, this.pose);
    E.glow += (glow - E.glow) * Math.min(1, dt * 18);

    this.updateTelegraph();
  }

  updateTelegraph() {
    const E = this.E, T = this.tel, A = E.attack;
    const live = A && (E.state === 'windup' || E.state === 'strike');
    if (!live) {
      T.alpha = Math.max(0, T.alpha - 0.12);
      this.fx.telegraph = T.alpha > 0 ? T : null;
      this.fx.hint = null;
      return;
    }
    if (T.dir !== A.dir || T.pts.length === 0) {
      T.dir = A.dir;
      T.seed = Math.random() * 100;
      T.pts = [];
      const K = ATTACKS[A.dir];
      const tmp = makePose();
      for (let i = 0; i <= 14; i++) {
        blendPose(K.windup, K.impact, i / 14, tmp);
        T.pts.push(this.view.project(this.enemy.tipFor(tmp, _v)));
      }
      for (let i = 1; i <= 6; i++) {
        blendPose(K.impact, K.follow, i / 6, tmp);
        T.pts.push(this.view.project(this.enemy.tipFor(tmp, _v)));
      }
    }
    const prog = E.state === 'strike' ? 1 : clamp(E.t / (A.W * 0.55));
    T.alpha = 0.25 + 0.65 * prog;
    this.fx.telegraph = T;
    const showHint = this.hintsLeft > 0 || this.hintBoost;
    this.fx.hint = showHint ? { angle: PARRY_ANGLE[A.dir], alpha: prog } : null;
  }

  // ------------------------------------------------------------- exchanges ----
  resolveImpact() {
    const E = this.E, P = this.P, A = E.attack;
    const gap = P.parry ? this.time - P.parry.time : 99;
    const clashW = this.enemy.tipFor(ATTACKS[A.dir].impact, new THREE.Vector3());
    const clash = this.view.project(clashW);
    if (P.parry && P.parry.dir === A.dir && gap <= PARRY_WINDOW) {
      const perfect = gap <= PERFECT_WINDOW;
      const at = P.parry.at ? { x: (clash.x + P.parry.at.x) / 2, y: (clash.y + P.parry.at.y) / 2 } : clash;
      this.fx.burst(at.x, at.y, perfect);
      this.fx.text(perfect ? '完 美 格 挡' : '格 挡', this.fx.w / 2, this.fx.h * 0.24, { size: this.fx.m * (perfect ? 0.075 : 0.055) });
      this.sfx.clang(perfect);
      this.blade.clash(1);
      this.hooks.hitstop(perfect ? 0.15 : 0.08);
      this.hooks.shake(perfect ? 0.55 : 0.3);
      if (perfect) this.hooks.slowmo(0.35, 0.45);
      this.stats.parry++;
      if (perfect) this.stats.perfect++;
      this.hintsLeft = Math.max(0, this.hintsLeft - 1);
      this.hintBoost = false;
      P.parry = null;
      this.combo = 0;
      this.setState('stagger', perfect ? 1.3 : 0.8);
      return;
    }
    if (this.time - P.dodgeAt <= DODGE_WINDOW) {
      this.fx.text('闪', this.fx.w / 2 - P.dodgeSide * this.fx.w * 0.18, this.fx.h * 0.42, { size: this.fx.m * 0.08 });
      P.parry = null;
      E.after = 'dodged';
      this.setState('follow');
      return;
    }
    // the cut lands
    P.hp -= 1;
    const path = this.tel.pts.slice(6);
    this.fx.playerHurt(path);
    this.sfx.hurt();
    this.hooks.hitstop(0.12);
    this.hooks.shake(1);
    if (P.parry) {
      const wrongDir = P.parry.dir !== A.dir;
      this.fx.text(wrongDir ? '方 向 不 对' : '太 早 了', this.fx.w / 2, this.fx.h * 0.24, { size: this.fx.m * 0.045, color: '#6b6359' });
    }
    P.parry = null;
    this.hintBoost = true;
    this.combo = 0;
    if (P.hp <= 0) {
      this.over = true;
      this.fx.flood = 0.01;
      this.sfx.lose();
      this.setState('victor');
      return;
    }
    E.after = E.phase2 && !A.chain && Math.random() < 0.4 ? 'chain' : 'recover';
    this.setState('follow');
  }

  onDodge(side) {
    if (this.over || this.E.state === 'rest' || this.E.state === 'intro') return;
    if (this.time - this.P.dodgeAt < 0.6) return;
    this.P.dodgeAt = this.time;
    this.P.dodgeSide = side;
    this.sfx.dodge();
    this.hooks.dodge(side);
  }

  onSwipe(sw) {
    const E = this.E;
    const ndcA = this.view.toNdc(sw.a), ndcB = this.view.toNdc(sw.b);
    const vx = sw.dx, vy = -sw.dy;
    const len = Math.hypot(vx, vy) || 1;
    const ang = (Math.atan2(vy, vx) * 180) / Math.PI;
    if (this.over || E.state === 'rest' || E.state === 'intro' || E.state === 'dead') {
      this.blade.swing(ndcA, ndcB, 'cut');
      this.sfx.swish(0.8);
      return;
    }
    const incoming = E.state === 'windup' || E.state === 'strike' ? E.attack.dir : null;
    if (incoming && angDiff(ang, PARRY_ANGLE[incoming]) <= PARRY_TOL) {
      this.P.parry = { dir: incoming, time: this.time, at: sw.b };
      this.blade.swing(ndcA, ndcB, 'block');
      this.sfx.swish(0.6);
      return;
    }
    // any other swipe is a cut — one cut at a time, the blade needs to come round
    if (this.time - this.lastCut < 0.13) return;
    this.lastCut = this.time;
    this.blade.swing(ndcA, ndcB, 'cut');
    this.sfx.swish(1);
    const origin = vy < -0.55 * len ? 'H' : vy > 0.55 * len ? 'U' : vx > 0 ? 'L' : 'R';
    if (E.state === 'idle' || E.state === 'flinch') {
      if (E.state === 'flinch' || COVERS[E.guard].includes(origin)) this.blocked(origin, vx);
      else this.hit(sw, { idle: true, origin });
    } else {
      this.hit(sw, { idle: false, origin });
    }
  }

  blocked(origin, vx) {
    const E = this.E;
    this.sfx.block();
    const p = this.view.project(this.enemy.bladeMid(_v));
    this.fx.spark(p.x, p.y);
    this.blade.bounce();
    E.jolt = 1;
    E.hurtSide = vx > 0 ? 1 : -1;
    E.blocks++;
    this.hooks.shake(0.12);
    if (E.state === 'idle' && (E.blocks >= 2 || Math.random() < 0.3)) this.startAttack({ counter: true });
  }

  hit(sw, { idle, origin }) {
    const E = this.E;
    E.hp = Math.max(0, E.hp - 1);
    E.chipDelay = 0.45;
    this.stats.hits++;
    this.combo = idle ? 1 : this.combo + 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    // where the stroke crosses the body
    const c = this.view.project(this.enemy.chest(_v));
    const at = closestOnSegment(sw.a, sw.b, c);
    at.x = clamp(at.x, c.x - this.fx.m * 0.12, c.x + this.fx.m * 0.12);
    at.y = clamp(at.y, c.y - this.fx.m * 0.22, c.y + this.fx.m * 0.18);
    this.fx.cut(sw.a, sw.b, at);
    this.enemy.chest(_v);
    this.ground?.stain(_v.x + (Math.random() - 0.5) * 0.7 + (sw.dx > 0 ? 0.25 : -0.25), _v.z + 0.2 + Math.random() * 0.5, 0.1 + Math.random() * 0.12, 0.5);
    E.flash = 1;
    E.hurt = 1;
    E.hurtSide = sw.dx > 0 ? 1 : -1;
    this.sfx.hit(this.combo);
    this.hooks.hitstop(0.05);
    this.hooks.shake(0.18);
    if (this.combo >= 2) {
      this.fx.text(`${NUM[Math.min(this.combo, 10)]} 连`, this.fx.w * 0.72, this.fx.h * 0.36, { size: this.fx.m * (0.05 + Math.min(this.combo, 8) * 0.005), life: 0.7, hold: 0.3 });
    }
    if (!E.phase2 && E.hp <= E.max / 2) {
      E.phase2 = true;
      this.fx.text('势 变', this.fx.w / 2, this.fx.h * 0.18, { size: this.fx.m * 0.05, color: '#6b6359', life: 1.4, hold: 0.8 });
    }
    if (E.hp <= 0) return this.kill();
    if (idle) {
      E.guard = origin === 'H' ? 'H' : origin === 'L' ? 'L' : 'R';
      E.counterNext = Math.random() < 0.55;
      this.setState('flinch', 0.3);
    }
  }

  kill() {
    this.over = true;
    this.E.attack = null;
    this.sfx.death();
    this.hooks.slowmo(0.3, 1.0);
    this.hooks.hitstop(0.2);
    const c = this.view.project(this.enemy.chest(_v));
    this.fx.burst(c.x, c.y, true);
    this.enemy.chest(_v);
    this.ground?.stain(_v.x, _v.z + 0.2, 0.5, 0.6);
    this.setState('dead');
  }

  summary() {
    return { win: !this.P || this.P.hp > 0, perfect: this.stats.perfect, parry: this.stats.parry, maxCombo: this.stats.maxCombo, time: Math.round(this.time - this.stats.start) };
  }

  hud() {
    return { visible: this.E.state !== 'rest', name: '墨 卫', hp: this.E.hp, chip: this.E.chip, max: this.E.max, php: this.P.hp, pmax: this.P.max };
  }
}

function closestOnSegment(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2);
  return { x: a.x + dx * t, y: a.y + dy * t };
}
