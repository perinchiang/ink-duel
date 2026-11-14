// The duel: the opponent's behaviour, how swipes become cuts / parries / draws, and the
// outcome of every exchange. Rendering and input are owned elsewhere; this decides.
import { POSES, ATTACKS, GUARD_POSE, PLAYER, blendPose, copyPose, makePose, cutPoses, dodgePose, hurtPose } from '../actor/poses.js';
import { Animator } from '../actor/animator.js';
import { ease, angDiff, clamp, noise1 } from '../core/noise.js';
import * as THREE from 'three';

const DIRS = ['L', 'R', 'O', 'D'];
const PARRY_TOL = 38;
// Each attack reads as one clear stroke on screen; the parry swipe points back along it.
export const ANGLE = { L: 135, O: 90, R: 45, D: -90 };
const PARRY_WINDOW = 0.36; // how early before impact a parry may be drawn
const PERFECT_WINDOW = 0.12;
const DRAW_TOL = 40;
const DRAW_WINDOW = 0.24; // 出鞘 must be drawn this close to the blade arriving
const DODGE_WINDOW = 0.42;
const SHEATHE_TIME = 0.55;
const DRAW_DAMAGE = 5;
// Includes the fast arm spring's visual lag: contact now occurs as the blade
// crosses the opponent, rather than while it is still leaving the windup.
const CUT_CONTACT = 0.117;
const COVERS = { L: ['L', 'H'], R: ['R', 'H'], H: ['H'], D: ['D'] };
const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Duel {
  constructor({ enemy, player, fx, sfx, ground, view, hooks }) {
    this.enemy = enemy;
    this.player = player;
    this.fx = fx;
    this.sfx = sfx;
    this.ground = ground;
    this.view = view;
    this.hooks = hooks;
    this.pose = copyPose(POSES.rest);
    this.work = makePose();
    this.anim = new Animator(POSES.rest);
    this.tel = { pts: [], alpha: 0, seed: 1 };
    this.reset();
  }

  reset() {
    this.time = 0;
    this.lastCut = -9;
    this.over = false;
    this.pending = [];
    this.E = {
      state: 'rest', t: 0, dur: 0, from: copyPose(POSES.rest),
      hp: 30, max: 30, chip: 30, chipDelay: 0,
      guard: 'L', blocks: 0, attack: null, after: null,
      hurt: 0, hurtSide: 1, jolt: 0, flash: 0, glow: 0, dissolve: 0,
      lastDirs: [], phase2: false, counterNext: false,
    };
    copyPose(POSES.rest, this.pose);
    this.P = { hp: 5, max: 5, parry: null, dodgeAt: -9, dodgeSide: 0, sheathed: false, sheathing: false, invuln: 0, jolt: 0, joltSide: 1 };
    this.combo = 0;
    this.stats = { perfect: 0, parry: 0, maxCombo: 0, hits: 0, draws: 0, sheaths: 0, start: 0 };
    this.hints = { parry: 3, sheathe: 2, draw: 2 };
    this.hintBoost = false;
    this.endTimer = -1;
    this.anim = new Animator(POSES.rest);
    this.ground?.reset();
  }

  begin() {
    this.stats.start = this.time;
    this.setState('intro', 1.4);
    this.E.guard = 'L';
    this.anim.setIdle(POSES.guardM, 0.9);
  }

  later(delay, fn) {
    this.pending.push({ at: this.time + delay, fn });
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
      const options = ['L', 'R', 'H', 'D'].filter((g) => g !== E.guard || Math.random() < 0.3);
      E.guard = pick(options);
    }
    // a sheathed opponent makes him wary: he waits, then tests you
    const wary = this.P.sheathed ? rand(0.3, 0.9) : 0;
    this.setState('idle', (E.phase2 ? rand(0.55, 1.1) : rand(0.9, 1.6)) + wary);
    E.blocks = 0;
  }

  /** Screen angle (math degrees, y up) of the swipe that meets an attack: back toward where the blade comes from. */
  attackAngle(dir) {
    return ANGLE[dir];
  }

  /** Where the blades meet on screen: just in front of the player, toward the opponent. */
  clashPoint() {
    const p = this.view.project(this.player.chest(_v));
    const e = this.view.project(this.enemy.chest(_w));
    return { x: p.x + (e.x - p.x) * 0.55, y: p.y + (e.y - p.y) * 0.55 - this.fx.m * 0.13 };
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
    const feintChance = (E.phase2 ? 0.28 : 0) + (this.P.sheathed ? 0.3 : 0);
    const feint = !counter && !chain && Math.random() < feintChance ? pick(DIRS.filter((d) => d !== dir)) : null;
    E.attack = { dir, W, S: 0.13, feint, feintAt: W * 0.55, feinted: false, chain, angle: this.attackAngle(dir) };
    this.setState('windup');
    this.sfx.windup();
  }

  timeToImpact() {
    const E = this.E, A = E.attack;
    if (!A) return 99;
    if (E.state === 'windup') return A.W - E.t + A.S;
    if (E.state === 'strike') return A.S - E.t;
    return 99;
  }

  // ---------------------------------------------------------------- update ----
  update(dt) {
    const E = this.E;
    this.time += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at <= this.time) {
        const p = this.pending.splice(i, 1)[0];
        p.fn();
      }
    }
    E.t += dt;
    E.hurt = Math.max(0, E.hurt - dt * 5);
    E.jolt = Math.max(0, E.jolt - dt * 7);
    this.P.jolt = Math.max(0, this.P.jolt - dt * 8);
    E.flash = Math.max(0, E.flash - dt * 9);
    this.P.invuln = Math.max(0, this.P.invuln - dt);
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
          A.angle = this.attackAngle(A.dir);
          A.W = E.phase2 ? 0.42 : 0.5;
          copyPose(this.pose, E.from);
          E.t = 0;
          this.sfx.windup();
        }
        const k = E.t / (A.W * 0.6);
        blendPose(E.from, ATTACKS[A.dir].windup, ease.outCubic(k), out);
        if (k >= 1) {
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
    this.enemyBoost = E.state === 'strike' || E.state === 'follow' ? 2.4 : E.state === 'windup' ? 1.3 : 1;

    // player body: breathing on top of whatever the animator is playing
    this.playerPose = this.anim.update(dt);
    if (!this.over || this.P.hp > 0) {
      this.playerPose.crouch += Math.sin(this.time * 1.9 + 1) * 0.008;
    }
    if (this.P.jolt > 0) {
      const j = this.P.jolt;
      this.playerPose.root[1] -= 0.07 * j;
      this.playerPose.lean -= 0.12 * j;
      this.playerPose.twist += 0.16 * j * this.P.joltSide;
      this.playerPose.crouch += 0.06 * j;
    }

    this.updateTelegraph();
  }

  updateTelegraph() {
    const E = this.E, T = this.tel, A = E.attack;
    const live = A && (E.state === 'windup' || E.state === 'strike');
    this.fx.hint = null;
    if (!live) {
      T.alpha = Math.max(0, T.alpha - 0.12);
      this.fx.telegraph = T.alpha > 0 ? T : null;
      this.sheatheHint();
      return;
    }
    if (T.dir !== A.dir || T.pts.length === 0 || T.attack !== A) {
      T.dir = A.dir;
      T.attack = A;
      T.seed = Math.random() * 100;
      T.pts = arcPoints(this.clashPoint(), ANGLE[A.dir], this.fx.m * 0.24);
      T.center = this.clashPoint();
    }
    const prog = E.state === 'strike' ? 1 : clamp(E.t / (A.W * 0.55));
    T.alpha = 0.25 + 0.65 * prog;
    this.fx.telegraph = T;
    const at = T.center;
    if (this.P.sheathed && this.hints.draw > 0) this.fx.hint = { kind: 'arrow', angle: A.angle, alpha: prog, label: '刀 落 前 · 迎 刀 出 鞘', at };
    else if (!this.P.sheathed && (this.hints.parry > 0 || this.hintBoost)) this.fx.hint = { kind: 'arrow', angle: A.angle, alpha: prog, label: '迎 刀 而 上', at };
  }

  sheatheHint() {
    const E = this.E;
    if (this.hints.sheathe <= 0 || this.P.sheathed || this.P.sheathing || this.over) return;
    if (E.state === 'stagger' && E.dur >= 1.2 && this.stats.parry >= 1) {
      this.fx.hint = { kind: 'circle', alpha: clamp(E.t / 0.3), label: '逆 时 针 画 圈 · 归 鞘' };
    }
  }

  // ------------------------------------------------------------- exchanges ----
  resolveImpact() {
    const E = this.E, P = this.P, A = E.attack;
    const gap = P.parry ? this.time - P.parry.time : 99;
    const clash = this.tel.center || this.clashPoint();
    if (P.parry && P.parry.dir === A.dir && gap <= PARRY_WINDOW) {
      const perfect = gap <= PERFECT_WINDOW;
      P.jolt = 1;
      P.joltSide = A.dir === 'L' ? -1 : 1;
      const mine = this.view.project(this.player.bladeMid(_w));
      const at = { x: clash.x * 0.6 + mine.x * 0.4, y: clash.y * 0.6 + mine.y * 0.4 };
      this.fx.burst(at.x, at.y, perfect);
      this.fx.text(perfect ? '完 美 格 挡' : '格 挡', this.fx.w / 2, this.fx.h * 0.24, { size: this.fx.m * (perfect ? 0.075 : 0.055) });
      this.sfx.clang(perfect);
      this.anim.release();
      this.hooks.hitstop(perfect ? 0.15 : 0.08);
      this.hooks.shake(perfect ? 0.55 : 0.3);
      if (perfect) this.hooks.slowmo(0.35, 0.45);
      this.stats.parry++;
      if (perfect) this.stats.perfect++;
      this.hints.parry = Math.max(0, this.hints.parry - 1);
      this.hintBoost = false;
      P.parry = null;
      this.combo = 0;
      this.setState('stagger', perfect ? 1.35 : 0.8);
      return;
    }
    if (this.time - P.dodgeAt <= DODGE_WINDOW || P.invuln > 0) {
      if (P.invuln <= 0) this.fx.text('闪', this.fx.w / 2 + P.dodgeSide * this.fx.w * 0.18, this.fx.h * 0.42, { size: this.fx.m * 0.08 });
      P.parry = null;
      E.after = 'dodged';
      this.setState('follow');
      return;
    }
    // the cut lands
    P.hp -= 1;
    const path = this.tel.pts.slice(4);
    this.fx.playerHurt(path, this.view.project(this.player.chest(_w)));
    this.sfx.hurt();
    this.hooks.hitstop(0.12);
    this.hooks.shake(1);
    if (P.parry) {
      const wrongDir = P.parry.dir !== A.dir;
      this.fx.text(wrongDir ? '方 向 不 对' : '太 早 了', this.fx.w / 2, this.fx.h * 0.24, { size: this.fx.m * 0.045, color: '#6b6359' });
    } else if (P.sheathed) {
      this.fx.text('出 鞘 晚 了', this.fx.w / 2, this.fx.h * 0.24, { size: this.fx.m * 0.045, color: '#6b6359' });
    }
    P.parry = null;
    P.sheathed = false;
    P.sheathing = false;
    this.fx.gather = 0;
    this.hintBoost = true;
    this.combo = 0;
    this.anim.idle = POSES.guardM;
    if (P.hp <= 0) {
      this.over = true;
      this.fx.flood = 0.01;
      this.sfx.lose();
      this.anim.play([{ pose: hurtPose(), dur: 0.1 }, { pose: POSES.kneel, dur: 0.6 }], { then: 'hold', tag: 'dead' });
      this.setState('victor');
      return;
    }
    this.anim.play([{ pose: hurtPose(), dur: 0.08, hold: 0.14 }], { back: 0.36, tag: 'hurt' });
    E.after = E.phase2 && !A.chain && Math.random() < 0.4 ? 'chain' : 'recover';
    this.setState('follow');
  }

  onDodge(side) {
    if (this.over || this.E.state === 'rest' || this.E.state === 'intro') return;
    if (this.time - this.P.dodgeAt < 0.6 || this.P.sheathing) return;
    this.P.dodgeAt = this.time;
    this.P.dodgeSide = side;
    this.sfx.dodge();
    const pose = dodgePose(side);
    if (this.P.sheathed) pose.sheath = 1;
    this.anim.play([{ pose, dur: 0.12, hold: 0.24 }], { back: 0.3, tag: 'dodge' });
    this.hooks.dodge(side);
  }

  onCircle() {
    const P = this.P, E = this.E;
    if (this.over || P.sheathed || P.sheathing) return;
    if (E.state === 'rest' || E.state === 'intro' || E.state === 'dead') return;
    P.sheathing = true;
    P.parry = null;
    // the blade sweeps up and round to the left hip, then slides home
    const sweep = makePose({ two: 1, hilt: [0.1, 1.5, 0.3], dir: [0.6, 0.5, -0.62], edge: [0, 1, 0], crouch: 0.2, twist: 0.35 });
    this.anim.play([{ pose: sweep, dur: 0.2, ease: 'inOut' }, { pose: PLAYER.sheathed, dur: 0.3, ease: 'inOut' }], { then: 'hold', tag: 'sheathe' });
    this.sfx.swish(0.5);
    this.later(SHEATHE_TIME, () => {
      if (!P.sheathing) return;
      P.sheathing = false;
      P.sheathed = true;
      this.anim.idle = PLAYER.sheathed;
      this.stats.sheaths++;
      this.hints.sheathe = 0;
      this.sfx.sheathe();
      this.fx.text('归 鞘', this.fx.w * 0.3, this.fx.h * 0.62, { size: this.fx.m * 0.05, life: 1, hold: 0.5 });
    });
  }

  onSwipe(sw) {
    const E = this.E, P = this.P;
    const vx = sw.dx, vy = -sw.dy;
    const len = Math.hypot(vx, vy) || 1;
    const ang = (Math.atan2(vy, vx) * 180) / Math.PI;
    if (this.over || E.state === 'rest' || E.state === 'intro' || E.state === 'dead') {
      if (!P.sheathed) this.playCut(vx / len, vy / len);
      return;
    }
    if (P.sheathing) return; // committed to the sheath: no guard until it is home
    const incoming = E.state === 'windup' || E.state === 'strike' ? E.attack : null;

    if (P.sheathed) {
      P.sheathed = false;
      this.fx.gather = 0;
      this.anim.idle = POSES.guardM;
      const tti = this.timeToImpact();
      const feintPending = incoming && incoming.feint && !incoming.feinted;
      if (incoming && !feintPending && angDiff(ang, incoming.angle) <= DRAW_TOL && tti <= DRAW_WINDOW) return this.drawStrike(sw);
      // drawn at the wrong moment: an ordinary cut, and the guard is open again
      this.anim.play([{ pose: PLAYER.drawCut, dur: 0.08 }, { pose: PLAYER.drawFollow, dur: 0.12 }], { back: 0.3, tag: 'cut' });
      this.sfx.draw(false);
      this.later(0.07, () => this.resolveCut(sw, 1));
      return;
    }

    if (incoming && angDiff(ang, incoming.angle) <= PARRY_TOL) {
      P.parry = { dir: incoming.dir, time: this.time, at: sw.b };
      this.anim.play([{ pose: PLAYER.parry[incoming.dir], dur: 0.08, hold: 0.42 }], { back: 0.3, tag: 'parry' });
      this.sfx.swish(0.6);
      return;
    }
    if (this.time - this.lastCut < 0.13) return;
    this.lastCut = this.time;
    this.playCut(vx / len, vy / len);
    this.later(CUT_CONTACT, () => this.resolveCut(sw, 1));
  }

  playCut(ux, uy) {
    const [w, i, f] = cutPoses(ux, uy);
    this.anim.play([{ pose: w, dur: 0.05 }, { pose: i, dur: 0.06, ease: 'inQuad' }, { pose: f, dur: 0.12 }], { back: 0.26, tag: 'cut' });
    this.sfx.swish(1);
  }

  resolveCut(sw, dmg) {
    const E = this.E;
    if (this.over || E.state === 'dead') return;
    const vx = sw.dx, vy = -sw.dy;
    const len = Math.hypot(vx, vy) || 1;
    // Screen-up cuts read as high (上段); screen-down cuts read as low (下段).
    const origin = vy > 0.55 * len ? 'H' : vy < -0.55 * len ? 'D' : vx > 0 ? 'L' : 'R';
    if (E.state === 'idle' || E.state === 'flinch' || E.state === 'intro') {
      if (E.state !== 'idle' || COVERS[E.guard].includes(origin)) return this.blocked(vx);
      return this.hit(sw, { idle: true, origin, dmg });
    }
    this.hit(sw, { idle: false, origin, dmg });
  }

  blocked(vx) {
    const E = this.E;
    this.sfx.block();
    const p = this.view.project(this.enemy.bladeMid(_v));
    this.fx.spark(p.x, p.y);
    this.anim.play([{ pose: POSES.guardM, dur: 0.12 }], { back: 0.1, tag: 'bounce' });
    E.jolt = 1;
    E.hurtSide = vx > 0 ? 1 : -1;
    E.blocks++;
    this.hooks.shake(0.12);
    if (E.state === 'idle' && (E.blocks >= 2 || Math.random() < 0.3)) this.startAttack({ counter: true });
  }

  hit(sw, { idle, origin, dmg = 1, big = false }) {
    const E = this.E;
    E.hp = Math.max(0, E.hp - dmg);
    E.chipDelay = 0.45;
    this.stats.hits++;
    this.combo = idle ? 1 : this.combo + 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    const chest = this.enemy.chest(_v);
    const c = this.view.project(chest);
    // Anchor the mark to the rendered weapon near the opponent, not to wherever
    // the user's finger happened to be on the screen. Combat remains gesture-based.
    const at = this.view.project(this.player.bladeClosestTo(chest, _w));
    at.x = clamp(at.x, c.x - this.fx.m * 0.1, c.x + this.fx.m * 0.1);
    at.y = clamp(at.y, c.y - this.fx.m * 0.18, c.y + this.fx.m * 0.14);
    this.fx.cut(sw.a, sw.b, at, big);
    this.enemy.chest(_v);
    this.ground?.stain(_v.x + (Math.random() - 0.5) * 0.7, _v.z - 0.2 - Math.random() * 0.5, (big ? 0.25 : 0.1) + Math.random() * 0.12, 0.5);
    E.flash = 1;
    E.hurt = 1;
    E.hurtSide = sw.dx > 0 ? 1 : -1;
    if (!big) {
      this.sfx.hit(this.combo);
      this.hooks.hitstop(0.05);
      this.hooks.shake(0.18);
    }
    if (this.combo >= 2 && !big) {
      this.fx.text(`${NUM[Math.min(this.combo, 10)]} 连`, this.fx.w * 0.74, this.fx.h * 0.36, { size: this.fx.m * (0.05 + Math.min(this.combo, 8) * 0.005), life: 0.7, hold: 0.3 });
    }
    if (!E.phase2 && E.hp <= E.max / 2) {
      E.phase2 = true;
      this.fx.text('势 变', this.fx.w / 2, this.fx.h * 0.18, { size: this.fx.m * 0.05, color: '#6b6359', life: 1.4, hold: 0.8 });
    }
    if (E.hp <= 0) return this.kill();
    if (idle) {
      E.guard = origin === 'H' || origin === 'D' ? origin : origin === 'L' ? 'L' : 'R';
      E.counterNext = Math.random() < 0.55;
      this.setState('flinch', 0.3);
    }
  }

  /** 出鞘斩: drawn as his blade arrives — you pass through it untouched and cut him down. */
  drawStrike(sw) {
    const E = this.E, P = this.P;
    P.invuln = 0.45;
    E.attack = null;
    this.stats.draws++;
    this.hints.draw = 0;
    this.anim.play([{ pose: PLAYER.drawCut, dur: 0.07 }, { pose: PLAYER.drawFollow, dur: 0.16, hold: 0.2 }], { back: 0.45, tag: 'draw' });
    this.sfx.draw(true);
    this.hooks.draw?.();
    this.combo = 0;
    this.setState('stagger', 1.0);
    // Let the sword actually leave the saya before freezing the impact frame.
    this.later(0.085, () => {
      if (this.over) return;
      this.hooks.hitstop(0.14);
      this.hooks.slowmo(0.25, 0.7);
      this.hooks.shake(0.7);
      const c = this.view.project(this.enemy.chest(_v));
      this.fx.slash(c, Math.cos(0.2), Math.sin(0.2));
      this.fx.text('出 鞘', this.fx.w / 2, this.fx.h * 0.22, { size: this.fx.m * 0.09, life: 1.3, hold: 0.7 });
      this.hit(sw, { idle: false, origin: 'L', dmg: DRAW_DAMAGE, big: true });
    });
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
    this.ground?.stain(_v.x, _v.z - 0.2, 0.5, 0.6);
    this.anim.setIdle(POSES.rest, 1.2);
    this.setState('dead');
  }

  summary() {
    return { win: this.P.hp > 0, perfect: this.stats.perfect, parry: this.stats.parry, draws: this.stats.draws, maxCombo: this.stats.maxCombo, time: Math.round(this.time - this.stats.start) };
  }

  hud() {
    return { visible: this.E.state !== 'rest', name: '墨 卫', hp: this.E.hp, chip: this.E.chip, max: this.E.max, php: this.P.hp, pmax: this.P.max };
  }
}

/** A swing stroke through c, arriving from `angle` (math degrees, screen y up). */
function arcPoints(c, angle, R) {
  const a = (angle * Math.PI) / 180;
  const fx = Math.cos(a), fy = -Math.sin(a); // screen-space unit pointing to where it comes from
  let nx = -fy, ny = fx; // bulge: the swing curves over the top (or to the right when vertical)
  if (ny > 0 || (Math.abs(ny) < 0.2 && nx < 0)) { nx = -nx; ny = -ny; }
  const p0 = { x: c.x + fx * R, y: c.y + fy * R };
  const p2 = { x: c.x - fx * R * 0.9, y: c.y - fy * R * 0.9 };
  const p1 = { x: c.x + nx * R * 0.2, y: c.y + ny * R * 0.2 };
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18, u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y });
  }
  return pts;
}

function closestOnSegment(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2);
  return { x: a.x + dx * t, y: a.y + dy * t };
}
