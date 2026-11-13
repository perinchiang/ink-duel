// A swordsman assembled from primitives and posed by placing body parts between solved
// joint points (no skinning, no animation files). The same rig is used for the player
// (seen from behind, hair tied up) and for opponents (straw hat).
//
// Everything is built in the fighter's own frame (see poses.js); `root` carries the
// world position and facing.
import * as THREE from 'three';
import { inkMaterial, outlineMaterial, inkPart, washTexture } from '../render/ink.js';
import { makeSword, TIP } from './sword.js';
import { Ribbon } from './ribbon.js';
import { solveTwoBone, placeSegment } from './ik.js';
import { PoseSpring } from './spring.js';
import { makePose, copyPose } from './poses.js';
import { torsoPattern, skirtPattern, sleevePattern } from './patterns.js';
import { ease } from '../core/noise.js';

const UPPER = 0.29;
const FORE = 0.29;
const HIP_H = 0.95;
const SCAB_LEN = 0.9;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const TORSO = [[0.001, 0], [0.16, 0.02], [0.2, 0.1], [0.21, 0.26], [0.235, 0.4], [0.2, 0.48], [0.08, 0.54], [0.001, 0.55]];
const SKIRT = [[0.001, -0.6], [0.4, -0.91], [0.44, -0.9], [0.36, -0.78], [0.27, -0.45], [0.2, -0.1], [0.17, 0.0], [0.001, 0.02]];

function lathe(points, segs = 18) {
  // phiStart = π puts the UV seam at the back, so the front is u = 0.5
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs, Math.PI);
}

export const PALETTES = {
  dark: { robe: ['#8a847a', '#1f1d21'], trim: '#0e0d10', inner: '#cfc7b8', limb: ['#77716a', '#1c1b1f'] },
  pale: { robe: ['#e1dacb', '#827a6c'], trim: '#1b1a1e', inner: '#f2ece0', limb: ['#d5cdbd', '#6f685c'] },
};

export class Swordsman {
  constructor({ position = new THREE.Vector3(), yaw = 0, style = 'hat', palette = PALETTES.dark, name = '' } = {}) {
    this.name = name;
    this.style = style;
    this.root = new THREE.Group();
    this.root.position.copy(position);
    this.root.rotation.y = yaw;
    this.world = new THREE.Group(); // world-space cloth
    const pal = palette;
    const M = (this.mats = {
      torso: inkMaterial({ light: pal.robe[0], dark: pal.robe[1], pattern: torsoPattern(TORSO, { trim: pal.trim, inner: pal.inner }) }),
      skirt: inkMaterial({ light: pal.robe[0], dark: pal.robe[1], pattern: skirtPattern(SKIRT, { trim: pal.trim }) }),
      sleeve: inkMaterial({ light: pal.limb[0], dark: pal.limb[1], pattern: sleevePattern({ trim: pal.trim }) }),
      limb: inkMaterial({ light: pal.limb[0], dark: pal.limb[1] }),
      belt: inkMaterial({ light: '#45423d', dark: '#121114' }),
      skin: inkMaterial({ light: '#cfc5b3', dark: '#5f584e' }),
      hat: inkMaterial({ light: '#d3cab7', dark: '#5a544a' }),
      hair: inkMaterial({ light: '#2c2a28', dark: '#0f0e11' }),
      blade: inkMaterial({ light: '#ebe5d8', dark: '#8a8377' }),
      dark: inkMaterial({ light: '#3e3b37', dark: '#121114' }),
      scab: inkMaterial({ light: '#3a3734', dark: '#100f12' }),
    });
    const line = (this.line = outlineMaterial({ thick: 0.0048 }));
    this.allMats = [...Object.values(M), line];
    const add = (o) => (this.root.add(o), o);

    const torsoGeo = lathe(TORSO);
    torsoGeo.scale(1, 1, 0.72);
    this.torso = add(inkPart(torsoGeo, M.torso, line));

    const skirtGeo = lathe(SKIRT, 20);
    skirtGeo.scale(1, 1, 0.82);
    this.skirt = add(inkPart(skirtGeo, M.skirt, line));

    const beltGeo = new THREE.CylinderGeometry(0.205, 0.2, 0.07, 18);
    beltGeo.scale(1, 1, 0.75);
    this.belt = add(inkPart(beltGeo, M.belt, line));

    // head
    this.head = add(inkPart(new THREE.SphereGeometry(0.1, 16, 12), M.skin, line));
    if (style === 'hat') {
      const veilGeo = new THREE.SphereGeometry(0.104, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
      this.head.add(inkPart(veilGeo, M.hair, null));
      const hatGeo = new THREE.LatheGeometry([[0.001, 0.02], [0.37, -0.024], [0.385, -0.018], [0.36, 0.0], [0.2, 0.065], [0.07, 0.135], [0.001, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 22);
      this.hat = add(inkPart(hatGeo, M.hat, line));
    } else {
      // hair: a cap over the crown and the whole back of the head, a bun, a hair tie
      const cap = new THREE.SphereGeometry(0.106, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.34);
      this.head.add(inkPart(cap, M.hair, null));
      const back = new THREE.SphereGeometry(0.107, 18, 12, Math.PI, Math.PI, 0, Math.PI * 0.74);
      this.head.add(inkPart(back, M.hair, null));
      const bun = inkPart(new THREE.SphereGeometry(0.052, 12, 10), M.hair, line);
      bun.position.set(0, 0.095, -0.045);
      this.head.add(bun);
      const tie = inkPart(new THREE.TorusGeometry(0.04, 0.011, 6, 14), M.blade, null);
      tie.rotation.x = Math.PI / 2 - 0.5;
      tie.position.set(0, 0.075, -0.04);
      this.head.add(tie);
      this.bunAt = new THREE.Vector3(0, 0.08, -0.08);
    }

    // arms: the forearm is the wide sleeve, flaring at the wrist with a dark cuff
    const upperGeo = new THREE.CapsuleGeometry(0.068, UPPER - 0.1, 4, 10);
    const foreGeo = new THREE.CylinderGeometry(0.09, 0.064, FORE - 0.04, 14);
    this.upperR = add(inkPart(upperGeo, M.limb, line));
    this.upperL = add(inkPart(upperGeo, M.limb, line));
    this.foreR = add(inkPart(foreGeo, M.sleeve, line));
    this.foreL = add(inkPart(foreGeo, M.sleeve, line));
    const handGeo = new THREE.SphereGeometry(0.037, 12, 10);
    this.handR = add(inkPart(handGeo, M.skin, line));
    this.handL = add(inkPart(handGeo, M.skin, line));

    const footGeo = new THREE.BoxGeometry(0.1, 0.06, 0.21);
    footGeo.translate(0, 0.03, 0.05);
    this.footR = add(inkPart(footGeo, M.dark, line));
    this.footL = add(inkPart(footGeo, M.dark, line));
    this.feet = [
      { obj: this.footR, off: new THREE.Vector3(-0.13, 0, 0.14), pos: new THREE.Vector3(-0.13, 0, 0.14), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, yaw: -0.1 },
      { obj: this.footL, off: new THREE.Vector3(0.15, 0, -0.12), pos: new THREE.Vector3(0.15, 0, -0.12), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, yaw: 0.45 },
    ];

    // scabbard at the left hip; its mouth faces forward, it runs back and down
    const scabGeo = new THREE.CylinderGeometry(0.026, 0.02, SCAB_LEN, 8);
    scabGeo.scale(1, 1, 0.55);
    scabGeo.translate(0, SCAB_LEN / 2, 0);
    this.scabbard = add(inkPart(scabGeo, M.scab, line));
    const throat = new THREE.CylinderGeometry(0.031, 0.031, 0.05, 8);
    throat.scale(1, 1, 0.6);
    throat.translate(0, 0.03, 0);
    this.scabbard.add(inkPart(throat, M.blade, line));
    const chape = new THREE.CylinderGeometry(0.023, 0.016, 0.07, 8);
    chape.scale(1, 1, 0.6);
    chape.translate(0, SCAB_LEN - 0.03, 0);
    this.scabbard.add(inkPart(chape, M.blade, line));

    this.sword = add(makeSword({ bladeMat: M.blade, darkMat: M.dark, lineMat: line }));

    if (style === 'hat') this.ribbons = [new Ribbon({ count: 10, seg: 0.075, width: 0.04 }), new Ribbon({ count: 8, seg: 0.07, width: 0.03 })];
    else this.ribbons = [new Ribbon({ count: 11, seg: 0.07, width: 0.032 }), new Ribbon({ count: 9, seg: 0.068, width: 0.024 })];
    this.tassel = new Ribbon({ count: 6, seg: 0.035, width: 0.018, gravity: 7 });
    for (const r of [...this.ribbons, this.tassel]) this.world.add(r.mesh);

    const shadowMat = new THREE.MeshBasicMaterial({ map: washTexture(128, 0.1, 0.5), transparent: true, depthWrite: false });
    this.shadow = add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), shadowMat));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = -1;

    this.pts = {
      root: new THREE.Vector3(), hips: new THREE.Vector3(),
      shR: new THREE.Vector3(), shL: new THREE.Vector3(),
      elR: new THREE.Vector3(), elL: new THREE.Vector3(),
      hR: new THREE.Vector3(), hL: new THREE.Vector3(),
      head: new THREE.Vector3(), tip: new THREE.Vector3(),
      mouth: new THREE.Vector3(), axis: new THREE.Vector3(),
    };
    this.chestQ = new THREE.Quaternion();
    this.hipQ = new THREE.Quaternion();
    this.wind = new THREE.Vector3(0.9, 0.15, 0.25);
    this.time = 0;
    this.shown = copyPose(makePose());
    this.spring = null;
    this.boost = 1;
  }

  addTo(scene) {
    scene.add(this.root);
    scene.add(this.world);
  }

  setGlow(v) { this.mats.blade.uniforms.uGlow.value = v; this.mats.dark.uniforms.uGlow.value = v * 0.6; }

  setFlash(v) { for (const m of Object.values(this.mats)) m.uniforms.uFlash.value = v; }

  setDissolve(v) {
    for (const m of this.allMats) m.uniforms.uDissolve.value = v;
    for (const r of [...this.ribbons, this.tassel]) r.material.opacity = 1 - Math.min(1, v * 1.6);
    this.shadow.material.opacity = 1 - v;
  }

  toWorld(v) {
    this.root.updateMatrixWorld();
    return v.applyMatrix4(this.root.matrixWorld);
  }

  /** World position near the tip for a raw key pose — used for telegraphs. */
  tipFor(pose, out = new THREE.Vector3()) {
    const d = pose.dir;
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    out.set(pose.root[0] + pose.hilt[0] + (d[0] / l) * TIP * 0.88, pose.hilt[1] + (d[1] / l) * TIP * 0.88, pose.root[1] + pose.hilt[2] + (d[2] / l) * TIP * 0.88);
    return this.toWorld(out);
  }

  bladeMid(out = new THREE.Vector3()) {
    return this.toWorld(out.copy(this.pts.hR).lerp(this.pts.tip, 0.55));
  }

  tipWorld(out = new THREE.Vector3()) {
    return this.toWorld(out.copy(this.pts.tip));
  }

  chest(out = new THREE.Vector3()) {
    return this.toWorld(out.copy(this.pts.hips).add(_v.set(0, 0.3, 0).applyQuaternion(this.chestQ)));
  }

  headWorld(out = new THREE.Vector3()) {
    return this.toWorld(out.copy(this.pts.head));
  }

  /** Drive the rig toward a key pose (with weight), then place every part. */
  drive(target, dt, camPos) {
    if (!this.spring) this.spring = new PoseSpring(target);
    this.spring.update(dt, target, this.shown, this.boost);
    this.apply(this.shown, dt, camPos);
  }

  snap(pose) {
    if (!this.spring) this.spring = new PoseSpring(pose);
    this.spring.reset(pose);
  }

  apply(p, dt, camPos) {
    this.time += dt;
    const P = this.pts;
    P.root.set(p.root[0], 0, p.root[1]);
    const hipsY = HIP_H - p.crouch;
    P.hips.set(P.root.x, hipsY, P.root.z);
    const q = this.chestQ.setFromEuler(_e.set(p.lean, p.twist, p.tilt, 'YXZ'));
    const hq = this.hipQ.setFromEuler(_e.set(p.lean * 0.35, p.twist * 0.45, p.tilt * 0.5, 'YXZ'));

    this.torso.position.copy(P.hips);
    this.torso.quaternion.copy(q);
    this.belt.position.copy(P.hips).y += 0.01;
    this.belt.quaternion.copy(_q.copy(hq).slerp(q, 0.5));
    this.skirt.position.copy(P.hips);
    this.skirt.quaternion.copy(hq);
    this.skirt.scale.set(1, Math.max(0.45, hipsY / HIP_H), 1);

    P.shR.copy(P.hips).add(_v.set(-0.19, 0.44, 0).applyQuaternion(q));
    P.shL.copy(P.hips).add(_v.set(0.19, 0.44, 0).applyQuaternion(q));

    P.head.copy(P.hips).add(_v.set(0, 0.64, 0.015).applyQuaternion(q));
    _q2.setFromEuler(_e.set(p.head[0] - p.lean * 0.5, p.head[1] - p.twist * 0.6, 0, 'YXZ'));
    _q.copy(q).multiply(_q2);
    this.head.position.copy(P.head);
    this.head.quaternion.copy(_q);
    const headQ = _q.clone();
    if (this.hat) {
      this.hat.position.copy(P.head).add(_v.set(0, 0.06, 0).applyQuaternion(headQ));
      this.hat.quaternion.copy(headQ);
    }

    // scabbard hangs from the left of the belt
    P.mouth.copy(P.hips).add(_v.set(0.2, 0.0, 0.1).applyQuaternion(hq));
    P.axis.set(0.16, -0.62, -0.77).applyQuaternion(hq).normalize();
    this.scabbard.position.copy(P.mouth);
    this.scabbard.quaternion.setFromUnitVectors(UP, P.axis);

    // sword: blend the key pose toward the scabbard by `sheath`
    const sh = p.sheath;
    _a.set(P.root.x + p.hilt[0], p.hilt[1], P.root.z + p.hilt[2]);
    _y.set(p.dir[0], p.dir[1], p.dir[2]).normalize();
    _x.set(p.edge[0], p.edge[1], p.edge[2]);
    if (sh > 0) {
      _b.copy(P.mouth).addScaledVector(P.axis, -0.11); // grip just outside the throat
      _a.lerp(_b, sh);
      _y.lerp(P.axis, sh).normalize();
      _c.set(0, 1, 0).applyQuaternion(hq);
      _x.lerp(_c, sh);
    }
    solveTwoBone(P.shR, _a, UPPER, FORE, _b.set(-0.55, -0.75, -0.35).applyQuaternion(q), P.elR, P.hR);
    placeSegment(this.upperR, P.shR, P.elR);
    placeSegment(this.foreR, P.elR, P.hR);
    this.handR.position.copy(P.hR);

    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-5) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
    _x.normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    this.sword.quaternion.setFromRotationMatrix(_m);
    this.sword.position.copy(P.hR);
    P.tip.copy(P.hR).addScaledVector(_y, TIP);
    const swordY = _y.clone();

    // left hand: sword-finger, the pommel for two-handed cuts, or the scabbard
    _a.set(P.root.x + p.lhand[0], p.lhand[1], P.root.z + p.lhand[2]);
    if (p.two > 0) {
      _b.copy(P.hR).addScaledVector(swordY, -0.1);
      _a.lerp(_b, p.two);
    }
    if (sh > 0) {
      _b.copy(P.mouth).addScaledVector(P.axis, 0.07);
      _a.lerp(_b, sh);
    }
    solveTwoBone(P.shL, _a, UPPER, FORE, _b.set(0.55, -0.75, -0.35).applyQuaternion(q), P.elL, P.hL);
    placeSegment(this.upperL, P.shL, P.elL);
    placeSegment(this.foreL, P.elL, P.hL);
    this.handL.position.copy(P.hL);

    this.stepFeet(dt, P, p);
    this.visual?.update(p);
    this.shadow.position.set(P.hips.x, 0.004, P.hips.z + 0.04);
    const ss = 1 + p.crouch * 0.6;
    this.shadow.scale.set(ss, ss, 1);

    // cloth, simulated in world space
    const t = this.time;
    this.wind.set(1.2 + Math.sin(t * 0.7) * 0.8, 0.2, 0.3 + Math.sin(t * 1.3) * 0.4);
    this.root.updateMatrixWorld();
    const W = this.root.matrixWorld;
    if (this.hat) {
      _a.copy(P.head).add(_v.set(-0.06, 0.03, -0.11).applyQuaternion(headQ)).applyMatrix4(W);
      this.ribbons[0].update(_a, dt, camPos, this.wind);
      _a.copy(P.head).add(_v.set(0.05, 0.02, -0.12).applyQuaternion(headQ)).applyMatrix4(W);
      this.ribbons[1].update(_a, dt, camPos, this.wind);
    } else {
      _a.copy(this.bunAt).add(_v.set(-0.02, 0, 0)).applyQuaternion(headQ).add(P.head).applyMatrix4(W);
      this.ribbons[0].update(_a, dt, camPos, this.wind);
      _a.copy(this.bunAt).add(_v.set(0.02, -0.01, 0)).applyQuaternion(headQ).add(P.head).applyMatrix4(W);
      this.ribbons[1].update(_a, dt, camPos, this.wind);
    }
    _a.copy(P.hR).addScaledVector(swordY, -0.1).applyMatrix4(W);
    this.tassel.update(_a, dt, camPos, this.wind);
  }

  stepFeet(dt, P, p) {
    // each foot stays planted until the body has moved away from it, then steps
    const stepping = this.feet.some((f) => f.t < 1);
    for (const f of this.feet) {
      _a.copy(f.off).applyAxisAngle(UP, p.twist * 0.35).add(P.root);
      if (f.t >= 1 && !stepping && f.pos.distanceTo(_a) > 0.15) {
        f.from.copy(f.pos);
        f.to.copy(_a);
        f.t = 0;
      }
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / 0.13);
        f.to.lerp(_a, 0.5);
        f.pos.lerpVectors(f.from, f.to, ease.outCubic(f.t));
        f.lift = Math.sin(Math.PI * f.t) * 0.06;
      } else f.lift = 0;
      f.obj.position.set(f.pos.x, f.lift, f.pos.z);
      f.obj.rotation.y = f.yaw + p.twist * 0.3;
    }
  }

  resetFeet(p) {
    for (const f of this.feet) {
      f.pos.copy(f.off).add(_a.set(p.root[0], 0, p.root[1]));
      f.t = 1;
    }
  }
}
