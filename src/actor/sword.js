// A straight double-edged jian built from primitives. Origin is the grip centre; the
// blade runs along +Y and its flat faces ±Z, so its cutting edges point along ±X.
import * as THREE from 'three';
import { inkPart } from '../render/ink.js';

export const GRIP = 0.085;
export const BLADE = 0.84;
export const TIP = GRIP + 0.02 + BLADE;

export function makeSword({ bladeMat, darkMat, lineMat }) {
  const g = new THREE.Group();
  const w = 0.02;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w * 0.82, BLADE - 0.08);
  s.lineTo(0, BLADE);
  s.lineTo(w * 0.82, BLADE - 0.08);
  s.lineTo(w, 0);
  s.lineTo(-w, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0025, bevelSegments: 1, steps: 1 });
  bladeGeo.translate(0, GRIP + 0.02, -0.0025);
  g.add(inkPart(bladeGeo, bladeMat, lineMat));

  const guardGeo = new THREE.BoxGeometry(0.105, 0.022, 0.032);
  guardGeo.translate(0, GRIP + 0.01, 0);
  g.add(inkPart(guardGeo, darkMat, lineMat));

  const gripGeo = new THREE.CylinderGeometry(0.0135, 0.015, GRIP * 2, 8);
  g.add(inkPart(gripGeo, darkMat, lineMat));

  const pommelGeo = new THREE.SphereGeometry(0.02, 10, 8);
  pommelGeo.translate(0, -GRIP - 0.012, 0);
  g.add(inkPart(pommelGeo, darkMat, lineMat));
  return g;
}
