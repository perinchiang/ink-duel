// Plays short sequences of key poses on top of an idle pose (used for the player,
// whose moves are triggered by input rather than by a behaviour state machine).
import { copyPose, blendPose, makePose } from './poses.js';
import { ease, clamp } from '../core/noise.js';

export class Animator {
  constructor(idle) {
    this.idle = idle;
    this.out = copyPose(idle);
    this.from = copyPose(idle);
    this.seq = null;
    this.k = 0;
    this.t = 0;
    this.holdT = 0;
    this.tag = 'idle';
  }

  /**
   * keys: [{ pose, dur, ease?, hold? }]
   * then: 'idle' to blend back to the idle pose afterwards, 'hold' to stay on the last key
   */
  play(keys, { then = 'idle', back = 0.28, tag = 'move', onKey = null } = {}) {
    copyPose(this.out, this.from);
    this.seq = { keys, then, back, onKey };
    this.k = 0;
    this.t = 0;
    this.holdT = 0;
    this.tag = tag;
  }

  setIdle(pose, dur = 0.3) {
    if (this.idle === pose) return;
    this.idle = pose;
    if (!this.seq) this.play([{ pose, dur, ease: 'inOut' }], { then: 'idle', tag: 'idle' });
  }

  get busy() {
    return !!this.seq && this.tag !== 'idle';
  }

  /** Shorten whatever is held right now (a blocked cut, a parry that has clashed). */
  release() {
    if (!this.seq) return;
    const key = this.seq.keys[this.k];
    if (key && key.hold) this.holdT = key.hold;
  }

  update(dt) {
    const S = this.seq;
    if (!S) {
      copyPose(this.idle, this.out);
      return this.out;
    }
    let left = dt;
    while (this.seq === S && left >= 0) {
      const key = S.keys[this.k];
      const u = key.dur > 0 ? clamp((this.t + left) / key.dur) : 1;
      blendPose(this.from, key.pose, ease[key.ease || 'outCubic'](u), this.out);
      if (u < 1) {
        this.t += left;
        break;
      }
      left -= Math.max(0, key.dur - this.t);
      this.t = key.dur;
      if (key.hold) {
        if (this.holdT < key.hold) {
          const h = Math.min(left, key.hold - this.holdT);
          this.holdT += h;
          left -= h;
          if (this.holdT < key.hold) break;
        }
      }
      if (S.onKey) S.onKey(this.k);
      copyPose(key.pose, this.from);
      this.k++;
      this.t = 0;
      this.holdT = 0;
      if (this.k >= S.keys.length) {
        if (S.then === 'hold') {
          this.k = S.keys.length - 1;
          this.t = key.dur;
          S.keys = [{ pose: key.pose, dur: 0, hold: Infinity }];
          this.k = 0;
          this.holdT = 0;
          break;
        }
        if (S.then === 'idle' && this.tag !== 'idle') {
          this.seq = { keys: [{ pose: this.idle, dur: S.back, ease: 'inOut' }], then: 'done', back: 0 };
          this.k = 0;
          this.t = 0;
          this.tag = 'idle';
          // continue blending with the remaining time on the next frame
          break;
        }
        this.seq = null;
        copyPose(this.idle, this.out);
        break;
      }
    }
    return this.out;
  }
}

export { makePose };
