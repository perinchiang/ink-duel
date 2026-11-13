// The player's own sword, held in front of the camera. Its tip follows the swipe path,
// so every stroke you draw is also the blade's arc.
import * as THREE from 'three';
import { inkMaterial, outlineMaterial } from '../render/ink.js';
import { makeSword } from '../actor/sword.js';
import { ease } from '../core/noise.js';

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _t = new THREE.Vector3();

export class PlayerBlade {
  constructor(camera) {
    this.camera = camera;
    const bladeMat = inkMaterial({ light: '#efe9dc', dark: '#958e81' });
    const darkMat = inkMaterial({ light: '#4a4641', dark: '#141317' });
    this.group = makeSword({ bladeMat, darkMat, lineMat: outlineMaterial({ thick: 0.004 }) });
    this.group.renderOrder = 5;
    camera.add(this.group);
    this.restHilt = new THREE.Vector3(0.38, -0.44, -0.58);
    this.restTip = new THREE.Vector3(0.3, 0.0, -1.35);
    this.restEdge = new THREE.Vector3(-1, 0.25, 0);
    this.hilt = this.restHilt.clone();
    this.tip = this.restTip.clone();
    this.edge = this.restEdge.clone();
    this.anim = null;
    this.recoil = 0;
    this.time = 0;
    this.visible = true;
  }

  /** Camera-space point under a screen position (ndc -1..1) at a fixed depth. */
  pointAt(ndc, depth = 1.4, out = new THREE.Vector3()) {
    const c = this.camera;
    const th = Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
    return out.set(ndc.x * th * c.aspect * depth, ndc.y * th * depth, -depth);
  }

  swing(ndcA, ndcB, kind = 'cut') {
    const a = this.pointAt(ndcA);
    const b = this.pointAt(ndcB);
    if (kind === 'cut') {
      // carry the cut through past where the finger stopped
      b.sub(a).multiplyScalar(1.5).add(a);
    }
    this.anim = {
      kind,
      t: 0,
      from: this.tip.clone(),
      a,
      b,
      dur: kind === 'block' ? 0.09 : 0.12,
      hold: kind === 'block' ? 0.4 : 0.03,
      back: kind === 'block' ? 0.26 : 0.22,
      motion: b.clone().sub(a).normalize(),
    };
  }

  clash(strength = 1) {
    this.recoil = Math.max(this.recoil, strength);
    if (this.anim && this.anim.kind === 'block') this.anim.hold = Math.min(this.anim.hold, this.anim.t - this.anim.dur + 0.18);
  }

  bounce() {
    // a blocked cut: snap back early
    this.recoil = Math.max(this.recoil, 0.7);
    if (this.anim) this.anim.t = Math.max(this.anim.t, this.anim.dur + this.anim.hold);
  }

  update(dt) {
    this.time += dt;
    let tip = _t;
    let edge = this.restEdge;
    const A = this.anim;
    if (A) {
      A.t += dt;
      if (A.t < A.dur) {
        const u = ease.outCubic(A.t / A.dur);
        // quadratic path: current → swipe start → swipe end
        const i = 1 - u;
        tip.copy(A.from).multiplyScalar(i * i).addScaledVector(A.a, 2 * u * i).addScaledVector(A.b, u * u);
        edge = A.motion;
      } else if (A.t < A.dur + A.hold) {
        tip.copy(A.b);
        edge = A.motion;
      } else if (A.t < A.dur + A.hold + A.back) {
        const u = ease.inOut((A.t - A.dur - A.hold) / A.back);
        tip.copy(A.b).lerp(this.restTip, u);
        edge = _z.copy(A.motion).lerp(this.restEdge, u);
      } else {
        this.anim = null;
        tip.copy(this.restTip);
      }
    } else {
      tip.copy(this.restTip);
      tip.x += Math.sin(this.time * 1.7) * 0.012;
      tip.y += Math.sin(this.time * 2.1) * 0.01;
    }
    this.recoil = Math.max(0, this.recoil - dt * 5);
    if (this.recoil > 0) {
      tip.x += (Math.random() - 0.5) * 0.06 * this.recoil;
      tip.y += (Math.random() - 0.5) * 0.06 * this.recoil + 0.03 * this.recoil;
    }
    this.tip.lerp(tip, 1 - Math.exp(-dt * 60));
    this.hilt.copy(this.restHilt).addScaledVector(_y.subVectors(this.tip, this.restTip), 0.24);
    this.hilt.y = Math.min(this.hilt.y, -0.18);

    _y.subVectors(this.tip, this.hilt).normalize();
    _x.copy(edge).addScaledVector(_y, -edge.dot(_y));
    if (_x.lengthSq() < 1e-5) _x.set(-1, 0, 0);
    _x.normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    _q.setFromRotationMatrix(_m);
    this.group.quaternion.slerp(_q, 1 - Math.exp(-dt * 40));
    this.group.position.copy(this.hilt);
    this.group.visible = this.visible;
  }
}
