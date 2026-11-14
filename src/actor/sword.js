// A compact uchigatana built from primitives. Origin is the grip centre; the
// slightly curved blade runs along +Y and its single cutting edge faces +X.
import * as THREE from 'three';
import { inkPart } from '../render/ink.js';

export const GRIP = 0.085;
export const GRIP_BOTTOM = -0.205; // accommodates the lower palm at -0.145
export const BLADE = 0.96;
export const TIP = GRIP + 0.02 + BLADE;

export function makeSword({ bladeMat, darkMat, lineMat }) {
  const g = new THREE.Group();
  const w = 0.022;
  const s = new THREE.Shape();
  // A shallow sori: the cutting edge bows forward instead of reading as a jian.
  s.moveTo(-w * 0.7, 0);
  s.lineTo(-w * 0.58, BLADE * 0.34);
  s.lineTo(-w * 0.28, BLADE * 0.72);
  s.lineTo(0.002, BLADE - 0.07);
  s.lineTo(0, BLADE);
  s.lineTo(w * 0.78, BLADE - 0.07);
  s.lineTo(w * 1.08, BLADE * 0.72);
  s.lineTo(w * 1.22, BLADE * 0.34);
  s.lineTo(w * 1.15, 0);
  s.lineTo(-w * 0.7, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0025, bevelSegments: 1, steps: 1 });
  bladeGeo.translate(0, GRIP + 0.02, -0.0025);
  g.add(inkPart(bladeGeo, bladeMat, lineMat));

  const guardGeo = new THREE.TorusGeometry(0.055, 0.012, 6, 14);
  const guard = inkPart(guardGeo, darkMat, lineMat);
  guard.position.y = GRIP + 0.01;
  guard.rotation.x = Math.PI / 2;
  g.add(guard);

  const gripGeo = new THREE.CylinderGeometry(0.018, 0.02, GRIP - GRIP_BOTTOM, 8);
  gripGeo.translate(0, (GRIP + GRIP_BOTTOM) / 2, 0);
  g.add(inkPart(gripGeo, darkMat, lineMat));

  const pommelGeo = new THREE.SphereGeometry(0.02, 10, 8);
  pommelGeo.translate(0, GRIP_BOTTOM - 0.012, 0);
  g.add(inkPart(pommelGeo, darkMat, lineMat));
  return g;
}
