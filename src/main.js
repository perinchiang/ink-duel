import * as THREE from 'three';
import { paintBackdrop, paperTextureURL } from './render/backdrop.js';
import { InkFX } from './render/fx.js';
import { Swordsman } from './actor/swordsman.js';
import { POSES, ATTACKS, GUARD_POSE } from './actor/poses.js';
import { Ground } from './world/ground.js';
import { BambooGrove } from './world/bamboo.js';
import { PlayerBlade } from './game/blade.js';
import { SwipeInput } from './game/input.js';
import { Duel, PARRY_ANGLE } from './game/duel.js';
import { Sfx } from './audio/sfx.js';
import { Screens, makeDodgeButtons } from './ui/screens.js';
import { noise1, clamp } from './core/noise.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const app = $('app');
const bgCanvas = $('bg');
const fxCanvas = $('fx');
$('paper').style.backgroundImage = `url(${paperTextureURL()})`;

const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
scene.add(camera);
const CAM = new THREE.Vector3(0, 1.55, 0);
const LOOK = new THREE.Vector3(0, 1.2, -2.8);

const enemy = new Swordsman({ position: new THREE.Vector3(0, 0, -2.8) });
scene.add(enemy.group);
const ground = new Ground(new THREE.Vector3(0, 0, -2.9));
scene.add(ground.mesh);
const bamboo = new BambooGrove();
scene.add(bamboo.group);
const blade = new PlayerBlade(camera);
const fx = new InkFX(fxCanvas);
const sfx = new Sfx();
const screens = new Screens($('ui'));

let W = 1, H = 1;
const _p = new THREE.Vector3();
const view = {
  project(v) {
    _p.copy(v).project(camera);
    return { x: (_p.x + 1) * 0.5 * W, y: (1 - _p.y) * 0.5 * H };
  },
  toNdc(p) {
    return { x: (p.x / W) * 2 - 1, y: 1 - (p.y / H) * 2 };
  },
};

const cam = { shake: 0, dodgeT: 1, dodgeSide: 0, t: 0 };
let hitstop = 0, timeScale = 1, slowT = 0;

const dodgeUI = makeDodgeButtons($('ui'), (s) => duel.onDodge(s));

const duel = new Duel({
  enemy, fx, blade, sfx, ground, view,
  hooks: {
    hitstop: (t) => (hitstop = Math.max(hitstop, t)),
    shake: (a) => (cam.shake = Math.max(cam.shake, a)),
    slowmo: (s, d) => { timeScale = s; slowT = d; },
    dodge: (side) => { cam.dodgeT = 0; cam.dodgeSide = side; },
    end: (win, s) => {
      dodgeUI.show(false);
      screens.result({ ...s, win }, () => startFight());
    },
  },
});

new SwipeInput(app, {
  onSwipe: (sw) => duel.onSwipe(sw),
  onStroke: (id, pts, done) => fx.stroke(id, pts, done),
  onDodge: (s) => duel.onDodge(s),
});

function startFight() {
  screens.hide();
  sfx.init();
  fx.flood = 0;
  duel.reset();
  enemy.setDissolve(0);
  duel.begin();
  dodgeUI.show(true);
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  const aspect = W / H;
  camera.aspect = aspect;
  // keep the duellist framed on tall phones too
  camera.fov = aspect >= 1.25 ? 50 : clamp(50 * Math.pow(1.25 / aspect, 0.85), 50, 88);
  camera.position.copy(CAM);
  camera.lookAt(LOOK);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const horizon = view.project(_p.set(0, CAM.y, -2000));
  paintBackdrop(bgCanvas, W, H, dpr, horizon.y);
  fx.resize(W, H, dpr);
  duel.tel.pts = [];
}
window.addEventListener('resize', resize);
resize();

// ---- dev hooks: ?pose=windupL  ?skip  ?auto  ----------------------------------
const posePick = params.get('pose');
const auto = params.has('auto');
const autoMode = params.get('auto') || 'parry';
let autoNext = 0;
function autopilot() {
  const E = duel.E;
  if (duel.over) return;
  if (E.state === 'windup' || E.state === 'strike') {
    const A = E.attack;
    const toImpact = E.state === 'windup' ? A.W - E.t + A.S : A.S - E.t;
    if (autoMode === 'parry' && !duel.P.parry && toImpact < 0.08 && !(A.feint && !A.feinted)) synthSwipe(PARRY_ANGLE[A.dir], 0.62);
    if (autoMode === 'dodge' && toImpact < 0.25 && duel.time - duel.P.dodgeAt > 0.6) duel.onDodge(Math.random() < 0.5 ? -1 : 1);
  } else if ((E.state === 'stagger' || E.state === 'recover') && duel.time > autoNext) {
    autoNext = duel.time + 0.17;
    synthSwipe(Math.random() < 0.5 ? -30 : 210 + Math.random() * 20, 0.45);
  }
}
let synthId = 1e6;
function synthSwipe(angleDeg, cy = 0.5) {
  const a = (angleDeg * Math.PI) / 180;
  const L = Math.min(W, H) * 0.3;
  const c = { x: W / 2, y: H * cy };
  const p0 = { x: c.x - Math.cos(a) * L * 0.5, y: c.y + Math.sin(a) * L * 0.5 };
  const p1 = { x: c.x + Math.cos(a) * L * 0.5, y: c.y - Math.sin(a) * L * 0.5 };
  const pts = [];
  for (let i = 0; i <= 12; i++) pts.push({ x: p0.x + (p1.x - p0.x) * (i / 12) + Math.sin(i * 0.8) * 3, y: p0.y + (p1.y - p0.y) * (i / 12) });
  const id = ++synthId;
  fx.stroke(id, pts, true);
  duel.onSwipe({ a: p0, b: p1, dx: p1.x - p0.x, dy: p1.y - p0.y, id });
}

window.__game = { duel, fx, enemy, camera, blade, synthSwipe, startFight, screens, ground };

// ---- loop -------------------------------------------------------------------------
let last = performance.now();
let frames = 0;
function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let dt = realDt * timeScale;
  if (slowT > 0) {
    slowT -= realDt;
    if (slowT <= 0) timeScale = 1;
  }
  if (hitstop > 0) {
    hitstop -= realDt;
    dt = 0;
  }

  if (posePick) {
    const p = posePick.startsWith('guard') ? GUARD_POSE[posePick.slice(5)] : POSES[posePick] || ATTACKS[posePick.slice(-1)]?.[posePick.slice(0, -1)];
    if (p) duel.pose = p;
    enemy.setGlow(posePick.startsWith('windup') ? 0.7 : 0);
  } else {
    if (auto) autopilot();
    duel.update(dt);
    enemy.setGlow(duel.E.glow);
    enemy.setFlash(duel.E.flash * 0.9);
    enemy.setDissolve(duel.E.dissolve);
    if (fx.flood > 0 && fx.flood < 1) fx.flood = Math.min(1, fx.flood + realDt * 0.5);
  }
  enemy.apply(duel.pose, dt, camera.position);
  blade.update(realDt);
  bamboo.update(now / 1000);

  // camera: shake, dodge sidestep, a faint handheld drift
  cam.t += realDt;
  cam.shake = Math.max(0, cam.shake - realDt * 3.2);
  const s = cam.shake * cam.shake;
  cam.dodgeT = Math.min(1, cam.dodgeT + realDt / 0.5);
  const d = Math.sin(Math.PI * cam.dodgeT) * (cam.dodgeT < 1 ? 1 : 0);
  const sx = (noise1(cam.t * 31) - 0.5) * s * 0.09 + Math.sin(cam.t * 0.6) * 0.006;
  const sy = (noise1(cam.t * 29 + 7) - 0.5) * s * 0.07 + Math.sin(cam.t * 0.9) * 0.004;
  camera.position.set(CAM.x + sx + cam.dodgeSide * d * 0.7, CAM.y + sy - d * 0.08, CAM.z);
  camera.lookAt(LOOK.x + cam.dodgeSide * d * 0.3, LOOK.y, LOOK.z);
  camera.rotateZ(-cam.dodgeSide * d * 0.07 + (noise1(cam.t * 23 + 3) - 0.5) * s * 0.04);

  renderer.render(scene, camera);
  fx.hud = duel.hud();
  fx.render(realDt);

  frames++;
  if (frames === 3) window.__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('skip') || auto) startFight();
else if (!posePick) screens.title(() => startFight());
