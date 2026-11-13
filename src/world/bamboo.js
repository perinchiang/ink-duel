// Bamboo framing the duel: stalks with nodes, twigs and hanging ink leaves that sway.
import * as THREE from 'three';
import { inkMaterial, outlineMaterial, inkPart, washTexture } from '../render/ink.js';
import { mulberry32 } from '../core/noise.js';

function leafGeometry(len = 0.42, wid = 0.07) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid, len * 0.3, 0, len);
  s.quadraticCurveTo(-wid * 0.8, len * 0.3, 0, 0);
  const a = new THREE.ShapeGeometry(s, 6);
  // a slight fold along the midrib so leaves never vanish edge-on
  const b = a.clone();
  b.rotateY(Math.PI / 2.4);
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export class BambooGrove {
  constructor(seed = 21) {
    this.group = new THREE.Group();
    this.sway = [];
    const rnd = mulberry32(seed);
    const near = { mat: inkMaterial({ light: '#77726a', dark: '#1c1b1f' }), line: outlineMaterial({ thick: 0.0042 }), leaf: new THREE.MeshBasicMaterial({ color: '#19181c', side: THREE.DoubleSide }) };
    const mid = { mat: inkMaterial({ light: '#a49d91', dark: '#4a4640' }), line: outlineMaterial({ color: '#3b3833', thick: 0.0036 }), leaf: new THREE.MeshBasicMaterial({ color: '#4a4640', side: THREE.DoubleSide }) };
    const far = { mat: inkMaterial({ light: '#cdc5b6', dark: '#9b958a' }), line: outlineMaterial({ color: '#8f897e', thick: 0.003 }), leaf: new THREE.MeshBasicMaterial({ color: '#a39c90', side: THREE.DoubleSide }) };
    const stalks = [
      { x: -2.55, z: -4.2, h: 5.2, lean: 0.07, r: 0.05, t: near },
      { x: -2.1, z: -4.9, h: 5.0, lean: -0.03, r: 0.042, t: near },
      { x: -3.2, z: -5.4, h: 5.4, lean: 0.12, r: 0.046, t: mid },
      { x: 2.5, z: -4.5, h: 5.0, lean: -0.06, r: 0.048, t: near },
      { x: 3.05, z: -5.4, h: 5.3, lean: -0.1, r: 0.044, t: mid },
      { x: -5.2, z: -9.5, h: 6.5, lean: 0.04, r: 0.05, t: far },
      { x: -4.4, z: -10.5, h: 6.0, lean: -0.05, r: 0.045, t: far },
      { x: 4.6, z: -9.8, h: 6.4, lean: -0.03, r: 0.05, t: far },
      { x: 5.6, z: -11, h: 6.8, lean: 0.06, r: 0.05, t: far },
    ];
    const leafGeo = leafGeometry();
    const shadowMat = new THREE.MeshBasicMaterial({ map: washTexture(64, 0.1, 0.4), transparent: true, depthWrite: false });
    for (const s of stalks) {
      const stalk = new THREE.Group();
      stalk.position.set(s.x, 0, s.z);
      stalk.rotation.z = s.lean;
      stalk.rotation.y = rnd() * Math.PI;
      const segLen = 0.42 + rnd() * 0.06;
      const n = Math.ceil(s.h / segLen);
      const segGeo = new THREE.CylinderGeometry(s.r, s.r * 1.04, segLen - 0.025, 10);
      const nodeGeo = new THREE.TorusGeometry(s.r * 1.05, s.r * 0.16, 5, 12);
      nodeGeo.rotateX(Math.PI / 2);
      for (let i = 0; i < n; i++) {
        const y = i * segLen + segLen / 2;
        const seg = inkPart(segGeo, s.t.mat, s.t.line);
        seg.position.y = y;
        stalk.add(seg);
        const node = inkPart(nodeGeo, s.t.mat, null);
        node.position.y = (i + 1) * segLen - 0.0125;
        stalk.add(node);
        // twigs and leaf clusters near the top
        if (y > (s.t === far ? 2.6 : 1.7) && rnd() < 0.75) {
          const side = rnd() < 0.5 ? -1 : 1;
          const twig = new THREE.Group();
          twig.position.y = (i + 1) * segLen;
          twig.rotation.y = rnd() * Math.PI * 2;
          const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.42, 5), s.t.leaf);
          tw.rotation.z = side * 1.0;
          tw.position.set(side * 0.18, 0.1, 0);
          twig.add(tw);
          const cluster = new THREE.Group();
          cluster.position.set(side * 0.36, 0.2, 0);
          const k = 3 + Math.floor(rnd() * 4);
          for (let j = 0; j < k; j++) {
            const pivot = new THREE.Group();
            const leaf = new THREE.Mesh(leafGeo, s.t.leaf);
            const sc = 0.75 + rnd() * 0.5;
            leaf.scale.set(sc, sc, sc);
            pivot.add(leaf);
            pivot.rotation.set((rnd() - 0.5) * 0.8, rnd() * Math.PI * 2, Math.PI - side * (0.4 + rnd() * 1.1));
            cluster.add(pivot);
            this.sway.push({ obj: pivot, base: pivot.rotation.z, ph: rnd() * 10, amp: 0.05 + rnd() * 0.08 });
          }
          twig.add(cluster);
          stalk.add(twig);
          this.sway.push({ obj: cluster, base: 0, ph: rnd() * 10, amp: 0.04, axis: 'x' });
        }
      }
      this.group.add(stalk);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), shadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(s.x, 0.003, s.z);
      sh.renderOrder = -1;
      this.group.add(sh);
      this.sway.push({ obj: stalk, base: s.lean, ph: rnd() * 10, amp: 0.006 });
    }
  }

  update(t) {
    for (const s of this.sway) {
      const v = s.base + Math.sin(t * 1.1 + s.ph) * s.amp + Math.sin(t * 2.7 + s.ph * 1.7) * s.amp * 0.35;
      if (s.axis === 'x') s.obj.rotation.x = v;
      else s.obj.rotation.z = v;
    }
  }
}
