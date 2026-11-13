import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { solveTwoBone } from './ik.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();

/** Visual-only adapter: never owns the weapon, pose spring, or gameplay queries. */
export class RiggedVisual {
  static async load(driver) {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/swordsman-a.glb`);
    return new RiggedVisual(driver, gltf.scene);
  }

  constructor(driver, model) {
    this.driver = driver;
    this.model = model;
    // Export is Y-up, +Z facing, one metre tall. Keep its bind matrices intact.
    model.scale.setScalar(1.75);
    model.updateMatrixWorld(true);
    this.bones = {};
    this.bind = {};
    model.traverse(o => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = false; // animated bounds, not the A-pose bounds
        // Generated garment surfaces can expose their reverse at the armpit.
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.side = THREE.DoubleSide;
      }
      if (!o.isBone) return;
      // GLTFLoader sanitizes ':' in node names; accept either spelling.
      const name = o.name.replace(/^mixamorig:?/, '');
      this.bones[name] = o;
      this.bind[name] = { p: o.getWorldPosition(V()), q: o.getWorldQuaternion(Q()), localQ: o.quaternion.clone() };
    });
    for (const name of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', ...['Right', 'Left'].flatMap(s => ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase', 'HandMiddle1'].map(n => s + n))]) {
      if (!this.bones[name]) throw new Error(`Missing rig bone: ${name}`);
    }
    driver.root.add(model);
    try {
      this.update(driver.shown);
    } catch (error) {
      model.removeFromParent();
      throw error;
    }
    // Do not hide root, sword, scabbard, shadow, or weapon tassel.
    for (const name of ['torso', 'skirt', 'belt', 'head', 'upperR', 'upperL', 'foreR', 'foreL', 'handR', 'handL', 'footR', 'footL']) driver[name].visible = false;
    for (const ribbon of driver.ribbons) ribbon.mesh.visible = false;
  }

  position(name) {
    return this.driver.root.worldToLocal(this.bones[name].getWorldPosition(V()));
  }

  set(name, rotation, position) {
    const bone = this.bones[name];
    const rootQ = this.driver.root.getWorldQuaternion(Q());
    bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(rootQ.multiply(rotation)));
    if (position) bone.position.copy(bone.parent.worldToLocal(this.driver.root.localToWorld(position.clone())));
    bone.updateMatrixWorld(true);
  }

  orient(name, delta, position) {
    this.set(name, delta.clone().multiply(this.bind[name].q), position);
  }

  aim(name, child, from, to, delta) {
    const rest = this.bind[child].p.clone().sub(this.bind[name].p).normalize().applyQuaternion(delta);
    const swing = Q().setFromUnitVectors(rest, to.clone().sub(from).normalize());
    this.orient(name, swing.multiply(delta), from);
  }

  update(p) {
    const d = this.driver, P = d.pts;
    d.root.updateMatrixWorld(true);
    this.orient('Hips', d.hipQ, P.hips);
    for (const n of ['Spine', 'Spine1', 'Spine2', 'Neck']) this.orient(n, d.chestQ);
    this.orient('Head', d.head.quaternion);
    for (const [i, side, suffix] of [[0, 'Right', 'R'], [1, 'Left', 'L']]) {
      const grip = i === 0 || p.two > 0.5 || p.sheath > 0.5;
      // Hand local X runs across the palm (toward index), Y toward fingers.
      // Mirrored palms curl toward +/-Z. Align across-palm axis to the hilt.
      const weaponQ = i === 1 && p.sheath > 0.5 ? d.scabbard.quaternion : d.sword.quaternion;
      const x = V(0, 1, 0).applyQuaternion(weaponQ);
      const y = V(i === 0 ? 1 : -1, 0, 0).applyQuaternion(weaponQ);
      const z = V().crossVectors(x, y);
      const handQ = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      if (!grip) {
        const restFore = this.bind[side + 'Hand'].p.clone().sub(this.bind[side + 'ForeArm'].p).normalize().applyQuaternion(d.chestQ);
        const posedFore = P['h' + suffix].clone().sub(P['el' + suffix]).normalize();
        handQ.setFromUnitVectors(restFore, posedFore).multiply(d.chestQ).multiply(this.bind[side + 'Hand'].q);
      }
      // Grip centre is inside the palm, not at the wrist joint.
      const offset = V(0, 0.064, i === 0 ? 0.018 : -0.018).applyQuaternion(handQ);
      const wrist = P['h' + suffix].clone().sub(offset);
      const shoulder = P['sh' + suffix];
      const elbow = V(), end = V();
      const reach = shoulder.distanceTo(wrist);
      // The source has shorter arms than the gameplay rig. Fit visual joint
      // translations to its 29cm segments; allow slight extension at full reach
      // rather than moving the authoritative hilt or disconnecting the palm.
      const length = Math.max(0.29, reach / 1.98);
      solveTwoBone(shoulder, wrist, length, length, V(i === 0 ? -0.55 : 0.55, -0.75, -0.35).applyQuaternion(d.chestQ), elbow, end);
      this.aim(side + 'Arm', side + 'ForeArm', shoulder, elbow, d.chestQ);
      this.aim(side + 'ForeArm', side + 'Hand', elbow, wrist, d.chestQ);
      this.set(side + 'Hand', handQ, wrist);
      for (const finger of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
        for (let joint = 1; joint <= 3; joint++) {
          const name = `${side}Hand${finger}${joint}`, bone = this.bones[name];
          if (!bone) continue;
          const angle = (grip ? (finger === 'Thumb' ? 0.45 : joint === 1 ? 0.95 : 1.2) : 0.12) * (i === 0 ? 1 : -1);
          bone.quaternion.copy(this.bind[name].localQ).multiply(Q().setFromAxisAngle(V(1, 0, 0), angle));
        }
      }
      const hip = this.position(side + 'UpLeg');
      const foot = d.feet[i].obj;
      const ankle = foot.position.clone().add(V(0, 0.12, -0.025));
      const knee = V(), endFoot = V();
      const thighLength = this.bind[side + 'UpLeg'].p.distanceTo(this.bind[side + 'Leg'].p);
      const shinLength = this.bind[side + 'Leg'].p.distanceTo(this.bind[side + 'Foot'].p);
      solveTwoBone(hip, ankle, thighLength, shinLength, V(0, 0.1, 1).applyQuaternion(d.hipQ), knee, endFoot);
      this.aim(side + 'UpLeg', side + 'Leg', hip, knee, d.hipQ);
      this.aim(side + 'Leg', side + 'Foot', knee, endFoot, d.hipQ);
      this.orient(side + 'Foot', foot.quaternion, endFoot);
    }
    this.model.updateMatrixWorld(true);
  }
}
