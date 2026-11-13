// The opponent: a straw-hatted swordsman assembled from primitives and posed by
// placing body parts between solved joint points (no skinning, no animation files).
import * as THREE from 'three';
import { inkMaterial, outlineMaterial, inkPart, washTexture } from '../render/ink.js';
import { makeSword, TIP } from './sword.js';
import { Ribbon } from './ribbon.js';
import { solveTwoBone, placeSegment } from './ik.js';

const UPPER = 0.29;
const FORE = 0.29;
const HIP_H = 0.95;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

function lathe(points, segs = 18) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

export class Swordsman {
  constructor({ position = new THREE.Vector3(0, 0, -3.3) } = {}) {
    this.base = position.clone();
    this.group = new THREE.Group();
    const M = (this.mats = {
      robe: inkMaterial({ light: '#8a847a', dark: '#1f1d21' }),
      inner: inkMaterial({ light: '#c2baab', dark: '#3b3834' }),
      belt: inkMaterial({ light: '#45423d', dark: '#121114' }),
      skin: inkMaterial({ light: '#cfc5b3', dark: '#5f584e' }),
      hat: inkMaterial({ light: '#d3cab7', dark: '#5a544a' }),
      shade: inkMaterial({ light: '#2c2a28', dark: '#121114' }),
      blade: inkMaterial({ light: '#ebe5d8', dark: '#8a8377' }),
      dark: inkMaterial({ light: '#3e3b37', dark: '#121114' }),
    });
    const line = (this.line = outlineMaterial({ thick: 0.0052 }));
    this.allMats = [...Object.values(M), line];

    const torsoGeo = lathe([[0.001, 0], [0.16, 0.02], [0.2, 0.1], [0.21, 0.26], [0.235, 0.4], [0.2, 0.48], [0.08, 0.54], [0.001, 0.55]]);
    torsoGeo.scale(1, 1, 0.72);
    this.torso = inkPart(torsoGeo, M.robe, line);
    // a pale inner collar wedge at the chest
    const collarGeo = new THREE.ConeGeometry(0.07, 0.2, 3, 1, false);
    collarGeo.rotateX(Math.PI);
    collarGeo.translate(0, 0.42, 0.155);
    this.torso.add(inkPart(collarGeo, M.inner, null));
    const lapelGeo = new THREE.BoxGeometry(0.035, 0.42, 0.02);
    const lapel = inkPart(lapelGeo, M.belt, null);
    lapel.position.set(0.035, 0.27, 0.158);
    lapel.rotation.z = -0.42;
    this.torso.add(lapel);

    const robeGeo = lathe([[0.001, -0.6], [0.4, -0.91], [0.44, -0.9], [0.36, -0.78], [0.27, -0.45], [0.2, -0.1], [0.17, 0.0], [0.001, 0.02]], 20);
    robeGeo.scale(1, 1, 0.82);
    this.robe = inkPart(robeGeo, M.robe, line);

    const beltGeo = new THREE.CylinderGeometry(0.205, 0.2, 0.07, 18);
    beltGeo.scale(1, 1, 0.75);
    this.belt = inkPart(beltGeo, M.belt, line);

    this.head = inkPart(new THREE.SphereGeometry(0.1, 16, 12), M.skin, line);
    // the brim's shadow across the eyes: only chin and mouth catch the light
    const veilGeo = new THREE.SphereGeometry(0.104, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    this.head.add(inkPart(veilGeo, M.shade, null));
    const hatGeo = lathe([[0.001, 0.02], [0.37, -0.024], [0.385, -0.018], [0.36, 0.0], [0.2, 0.065], [0.07, 0.135], [0.001, 0.17]], 22);
    this.hat = inkPart(hatGeo, M.hat, line);

    const upperGeo = new THREE.CapsuleGeometry(0.068, UPPER - 0.1, 4, 10);
    const foreGeo = new THREE.CylinderGeometry(0.088, 0.064, FORE - 0.04, 12);
    this.upperR = inkPart(upperGeo, M.robe, line);
    this.upperL = inkPart(upperGeo, M.robe, line);
    this.foreR = inkPart(foreGeo, M.robe, line);
    this.foreL = inkPart(foreGeo, M.robe, line);
    const handGeo = new THREE.SphereGeometry(0.037, 12, 10);
    this.handR = inkPart(handGeo, M.skin, line);
    this.handL = inkPart(handGeo, M.skin, line);

    const footGeo = new THREE.BoxGeometry(0.1, 0.06, 0.2);
    footGeo.translate(0, 0.03, 0.04);
    this.footR = inkPart(footGeo, M.dark, line);
    this.footL = inkPart(footGeo, M.dark, line);

    this.sword = makeSword({ bladeMat: M.blade, darkMat: M.dark, lineMat: line });

    for (const p of [this.robe, this.torso, this.belt, this.head, this.hat, this.upperR, this.upperL, this.foreR, this.foreL, this.handR, this.handL, this.footR, this.footL, this.sword]) {
      this.group.add(p);
    }

    this.ribbons = [new Ribbon({ count: 10, seg: 0.075, width: 0.04 }), new Ribbon({ count: 8, seg: 0.07, width: 0.03 })];
    this.tassel = new Ribbon({ count: 6, seg: 0.035, width: 0.018, gravity: 7 });
    for (const r of [...this.ribbons, this.tassel]) this.group.add(r.mesh);

    const shadowMat = new THREE.MeshBasicMaterial({ map: washTexture(128, 0.1, 0.5), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = -1;
    this.group.add(this.shadow);

    this.pts = {
      root: new THREE.Vector3(), hips: new THREE.Vector3(),
      shR: new THREE.Vector3(), shL: new THREE.Vector3(),
      elR: new THREE.Vector3(), elL: new THREE.Vector3(),
      hR: new THREE.Vector3(), hL: new THREE.Vector3(),
      head: new THREE.Vector3(), tip: new THREE.Vector3(),
    };
    this.chestQ = new THREE.Quaternion();
    this.wind = new THREE.Vector3(0.9, 0.15, 0.25);
    this.time = 0;
  }

  setGlow(v) { this.mats.blade.uniforms.uGlow.value = v; this.mats.dark.uniforms.uGlow.value = v * 0.6; }

  setFlash(v) { for (const m of Object.values(this.mats)) m.uniforms.uFlash.value = v; }

  setDissolve(v) {
    for (const m of this.allMats) m.uniforms.uDissolve.value = v;
    for (const r of [...this.ribbons, this.tassel]) r.material.opacity = 1 - Math.min(1, v * 1.6);
    this.shadow.material.opacity = 1 - v;
  }

  /** World position of the blade (near the tip) for a given pose — used for telegraphs. */
  tipFor(pose, out = new THREE.Vector3()) {
    const d = pose.dir;
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return out.set(
      this.base.x + pose.root[0] + pose.hilt[0] + (d[0] / l) * TIP * 0.88,
      pose.hilt[1] + (d[1] / l) * TIP * 0.88,
      this.base.z + pose.root[1] + pose.hilt[2] + (d[2] / l) * TIP * 0.88,
    );
  }

  bladeMid(out = new THREE.Vector3()) {
    return out.copy(this.pts.hR).lerp(this.pts.tip, 0.55);
  }

  chest(out = new THREE.Vector3()) {
    return out.copy(this.pts.hips).add(_v.set(0, 0.3, 0).applyQuaternion(this.chestQ));
  }

  apply(p, dt, camPos) {
    this.time += dt;
    const P = this.pts;
    P.root.set(this.base.x + p.root[0], 0, this.base.z + p.root[1]);
    const hipsY = HIP_H - p.crouch;
    P.hips.set(P.root.x, hipsY, P.root.z);
    const q = this.chestQ.setFromEuler(_e.set(p.lean, p.twist, p.tilt, 'YXZ'));

    this.torso.position.copy(P.hips);
    this.torso.quaternion.copy(q);
    this.belt.position.copy(P.hips).y += 0.01;
    this.belt.quaternion.copy(q);
    this.robe.position.copy(P.hips);
    this.robe.quaternion.setFromEuler(_e.set(p.lean * 0.35, p.twist * 0.5, p.tilt * 0.5, 'YXZ'));
    this.robe.scale.set(1, Math.max(0.45, hipsY / HIP_H), 1);

    P.shR.copy(P.hips).add(_v.set(-0.19, 0.44, 0).applyQuaternion(q));
    P.shL.copy(P.hips).add(_v.set(0.19, 0.44, 0).applyQuaternion(q));

    // head looks a little toward the player, plus the pose's head offset
    P.head.copy(P.hips).add(_v.set(0, 0.64, 0.015).applyQuaternion(q));
    _q2.setFromEuler(_e.set(p.head[0] - p.lean * 0.5, p.head[1] - p.twist * 0.6, 0, 'YXZ'));
    _q.copy(q).multiply(_q2);
    this.head.position.copy(P.head);
    this.head.quaternion.copy(_q);
    this.hat.position.copy(P.head).add(_v.set(0, 0.06, 0).applyQuaternion(_q));
    this.hat.quaternion.copy(_q);

    // right arm reaches the hilt
    _a.set(P.root.x + p.hilt[0], p.hilt[1], P.root.z + p.hilt[2]);
    solveTwoBone(P.shR, _a, UPPER, FORE, _b.set(-0.55, -0.75, -0.35).applyQuaternion(q), P.elR, P.hR);
    placeSegment(this.upperR, P.shR, P.elR);
    placeSegment(this.foreR, P.elR, P.hR);
    this.handR.position.copy(P.hR);

    // sword basis from blade direction + edge facing
    _y.set(p.dir[0], p.dir[1], p.dir[2]).normalize();
    _x.set(p.edge[0], p.edge[1], p.edge[2]);
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-5) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
    _x.normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    this.sword.quaternion.setFromRotationMatrix(_m);
    this.sword.position.copy(P.hR);
    P.tip.copy(P.hR).addScaledVector(_y, TIP);

    // left arm: sword-finger gesture, or on the pommel for two-handed cuts
    _a.set(P.root.x + p.lhand[0], p.lhand[1], P.root.z + p.lhand[2]);
    if (p.two > 0) {
      _b.copy(P.hR).addScaledVector(_y, -0.1);
      _a.lerp(_b, p.two);
    }
    solveTwoBone(P.shL, _a, UPPER, FORE, _b.set(0.55, -0.75, -0.35).applyQuaternion(q), P.elL, P.hL);
    placeSegment(this.upperL, P.shL, P.elL);
    placeSegment(this.foreL, P.elL, P.hL);
    this.handL.position.copy(P.hL);

    // feet stay planted-ish: front foot follows the lunge, back foot lags
    this.footR.position.set(this.base.x - 0.12 + p.root[0] * 0.5, 0, this.base.z + p.root[1] * 0.85 + 0.12);
    this.footL.position.set(this.base.x + 0.15 + p.root[0] * 0.3, 0, this.base.z + p.root[1] * 0.25 - 0.1);
    this.footL.rotation.y = 0.35;

    this.shadow.position.set(P.hips.x, 0.004, P.hips.z + 0.05);
    const sh = 1 + p.crouch * 0.6;
    this.shadow.scale.set(sh, sh, 1);

    // cloth
    const t = this.time;
    this.wind.set(1.2 + Math.sin(t * 0.7) * 0.8, 0.2, 0.3 + Math.sin(t * 1.3) * 0.4);
    _a.copy(P.head).add(_v.set(-0.06, 0.03, -0.11).applyQuaternion(_q));
    this.ribbons[0].update(_a, dt, camPos, this.wind);
    _a.copy(P.head).add(_v.set(0.05, 0.02, -0.12).applyQuaternion(_q));
    this.ribbons[1].update(_a, dt, camPos, this.wind);
    _a.copy(P.hR).addScaledVector(_y, -0.1);
    this.tassel.update(_a, dt, camPos, this.wind);
  }
}
