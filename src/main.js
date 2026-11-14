import * as THREE from 'three';
import { paintBackdrop, paperTextureURL } from './render/backdrop.js';
import { InkFX } from './render/fx.js';
import { Swordsman, PALETTES } from './actor/swordsman.js';
import { RiggedVisual } from './actor/rigged-visual.js';
import { POSES, ATTACKS, GUARD_POSE, PLAYER, cutPoses, dodgePose } from './actor/poses.js';
import { Ground } from './world/ground.js';
import { BambooGrove } from './world/bamboo.js';
import { SwipeInput } from './game/input.js';
import { Duel, ANGLE } from './game/duel.js';
import { Sfx } from './audio/sfx.js';
import { Screens, makeDodgeButtons } from './ui/screens.js';
import { noise1, clamp } from './core/noise.js';
import { studyPose } from './actor/cut-demo.js';
import { makePose } from './actor/poses.js';

const params = new URLSearchParams(location.search);
const fullBody = params.get('demo') === 'cut';
const study = { time: 0, phase: 'idle', pose: makePose() };
const $ = (id) => document.getElementById(id);
const app = $('app');
const bgCanvas = $('bg');
const fxCanvas = $('fx');
$('paper').style.backgroundImage = `url(${paperTextureURL()})`;

const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 200);
scene.add(camera);
// Standard GLTF materials retain Three's skinning path; ink shaders remain on primitives.
scene.add(new THREE.HemisphereLight(0xfff5e3, 0x656775, 2.2));
const keyLight = new THREE.DirectionalLight(0xfff3dc, 2.5);
keyLight.position.set(-3, 6, 4);
scene.add(keyLight);

// Keep both fighters on the same Z combat axis. View the open shoulder from -X,
// rather than looking squarely into the player's turned back.
const GAP = 1.7;
const vec = (s, d) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : d);
const CAM = vec(params.get('cam'), fullBody ? new THREE.Vector3(2.6, 1.9, 3.5) : new THREE.Vector3(-1.9, 1.85, 0.5));
const LOOK = vec(params.get('look'), fullBody ? new THREE.Vector3(0, 0.85, -0.35) : new THREE.Vector3(0.1, 1.3, -0.85));

const player = new Swordsman({ position: new THREE.Vector3(0, 0, 0), yaw: Math.PI, style: 'bun', palette: PALETTES.pale, name: 'you' });
player.addTo(scene);
// Keep the cohesive ink character by default; generated model is opt-in for comparison.
let visualSettled = params.get('character') !== 'rigged';
player.visualStatus = visualSettled ? 'code' : 'loading';
if (!visualSettled) {
  RiggedVisual.load(player).then(visual => {
    player.visual = visual;
    player.visualStatus = 'rigged';
  }).catch(error => {
    player.visualStatus = 'fallback';
    console.warn('Rigged player unavailable; keeping procedural character.', error);
  }).finally(() => { visualSettled = true; });
}
const enemy = new Swordsman({ position: new THREE.Vector3(0, 0, -GAP), yaw: 0, style: 'hat', palette: PALETTES.dark, name: '墨卫' });
enemy.addTo(scene);
const ground = new Ground(new THREE.Vector3(0, 0, -GAP / 2), 8);
scene.add(ground.mesh);
const bamboo = new BambooGrove();
bamboo.group.position.z = 0.9;
scene.add(bamboo.group);
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

const cam = { shake: 0, dodgeT: 1, dodgeSide: 0, t: 0, push: 0, drawT: 1, base: CAM.clone(), look: LOOK.clone() };
let hitstop = 0, timeScale = 1, slowT = 0;

let portraitPaused = false;
const dodgeUI = makeDodgeButtons($('ui'), (s) => { if (!portraitPaused) duel.onDodge(s); });

const duel = new Duel({
  enemy, player, fx, sfx, ground, view,
  hooks: {
    hitstop: (t) => (hitstop = Math.max(hitstop, t)),
    shake: (a) => (cam.shake = Math.max(cam.shake, a)),
    slowmo: (s, d) => { timeScale = s; slowT = d; },
    dodge: (side) => { cam.dodgeT = 0; cam.dodgeSide = side; },
    draw: () => { cam.drawT = 0; },
    end: (win, s) => {
      dodgeUI.show(false);
      screens.result({ ...s, win }, () => startFight());
    },
  },
});

const input = new SwipeInput(app, {
  onSwipe: (sw) => duel.onSwipe(sw),
  onStroke: (id, pts, done, circled) => fx.stroke(id, pts, done, circled),
  onDodge: (s) => duel.onDodge(s),
  onCircle: () => duel.onCircle(),
});

function startFight() {
  screens.hide();
  sfx.init();
  fx.flood = 0;
  duel.reset();
  enemy.setDissolve(0);
  player.snap(POSES.rest);
  player.resetFeet(POSES.rest);
  enemy.snap(POSES.rest);
  enemy.resetFeet(POSES.rest);
  duel.begin();
  dodgeUI.show(true);
}

function placeCamera() {
  camera.position.copy(cam.base);
  camera.lookAt(cam.look);
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  const aspect = W / H;
  portraitPaused = H > W;
  $('rotate-prompt').hidden = !portraitPaused;
  $('ui').inert = portraitPaused;
  input.setEnabled(!portraitPaused);
  camera.aspect = aspect;
  // Preserve the close shoulder framing on wide phones; only widen for compact
  // landscape windows, never pull the camera away into a full-body view.
  camera.fov = 46 + clamp((1.7 - aspect) / 0.7, 0, 1) * 16;
  cam.base.copy(CAM);
  cam.look.copy(LOOK);
  placeCamera();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const horizon = view.project(_p.set(cam.look.x, camera.position.y, -2000));
  paintBackdrop(bgCanvas, W, H, dpr, horizon.y);
  fx.resize(W, H, dpr);
  duel.tel.pts = [];
}
window.addEventListener('resize', resize);
resize();

// ---- dev hooks: ?pose=windupL&ppose=parryL  ?skip  ?auto[=parry|none|dodge|draw] ----
const posePick = params.get('pose');
const pposePick = params.get('ppose');
const auto = params.has('auto');
const autoMode = params.get('auto') || 'parry';
let autoNext = 0;
function pickPose(name, isPlayer) {
  if (!name) return null;
  if (name.startsWith('guard')) return GUARD_POSE[name.slice(5)] || POSES[name];
  if (name.startsWith('parry')) return PLAYER.parry[name.slice(5)];
  if (PLAYER[name]) return PLAYER[name];
  const m = name.match(/^cut([wif]):(.+)$/);
  if (m) {
    const [w, i, f] = cutPoses(...m[2].split(',').map(Number));
    return { w, i, f }[m[1]];
  }
  if (name.startsWith('dodge')) return dodgePose(+name.slice(5) || 1);
  return POSES[name] || ATTACKS[name.slice(-1)]?.[name.slice(0, -1)];
}

function autopilot() {
  const E = duel.E, P = duel.P;
  if (duel.over) return;
  if (E.state === 'windup' || E.state === 'strike') {
    const A = E.attack;
    const tti = duel.timeToImpact();
    const feintPending = A.feint && !A.feinted;
    if (autoMode === 'draw' && P.sheathed) {
      if (!feintPending && tti < 0.14) synthSwipe(A.angle);
    } else if ((autoMode === 'parry' || autoMode === 'draw') && !P.parry && tti < 0.08 && !feintPending) synthSwipe(A.angle);
    if (autoMode === 'dodge' && tti < 0.25 && duel.time - P.dodgeAt > 0.6) duel.onDodge(Math.random() < 0.5 ? -1 : 1);
  } else if (E.state === 'stagger' && autoMode === 'draw' && !P.sheathed && !P.sheathing && E.t > 0.1) {
    duel.onCircle();
  } else if ((E.state === 'stagger' || E.state === 'recover') && duel.time > autoNext && !P.sheathed && !P.sheathing) {
    autoNext = duel.time + 0.17;
    synthSwipe(Math.random() < 0.5 ? -30 : 210 + Math.random() * 20, 0.45);
  }
}
let synthId = 1e6;
function synthSwipe(angleDeg, cy = 0.5) {
  if (portraitPaused) return;
  const a = (angleDeg * Math.PI) / 180;
  const L = Math.min(W, H) * 0.3;
  const c = { x: W * 0.55, y: H * cy };
  const p0 = { x: c.x - Math.cos(a) * L * 0.5, y: c.y + Math.sin(a) * L * 0.5 };
  const p1 = { x: c.x + Math.cos(a) * L * 0.5, y: c.y - Math.sin(a) * L * 0.5 };
  const pts = [];
  for (let i = 0; i <= 12; i++) pts.push({ x: p0.x + (p1.x - p0.x) * (i / 12) + Math.sin(i * 0.8) * 3, y: p0.y + (p1.y - p0.y) * (i / 12) });
  const id = ++synthId;
  fx.stroke(id, pts, true);
  duel.onSwipe({ a: p0, b: p1, dx: p1.x - p0.x, dy: p1.y - p0.y, id });
}

window.__game = { duel, fx, enemy, player, camera, synthSwipe, startFight, screens, ground, cam, study };

// ---- loop -------------------------------------------------------------------------
let last = performance.now();
let frames = 0;
function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Freeze the whole simulation, including autopilot, hitstop and camera timers.
  // Keep RAF alive so orientation changes resume without accumulating elapsed time.
  if (portraitPaused) {
    renderer.render(scene, camera);
    if (visualSettled) window.__ready = true;
    requestAnimationFrame(frame);
    return;
  }
  let dt = realDt * timeScale;
  if (slowT > 0) {
    slowT -= realDt;
    if (slowT <= 0) timeScale = 1;
  }
  if (hitstop > 0) {
    hitstop -= realDt;
    dt = 0;
  }

  if (fullBody) {
    // Fixed-step simulation makes both the loop and ?at= phase captures repeatable.
    const fixedAt = Number(params.get('at'));
    const targetTime = params.has('at') && Number.isFinite(fixedAt) ? Math.max(0, Math.min(4.2, fixedAt)) : study.time + realDt;
    while (study.time <= targetTime) {
      study.phase = studyPose(study.time, study.pose);
      if (study.time === 0) { player.snap(study.pose); player.resetFeet(study.pose); }
      player.boost = 2.4;
      player.drive(study.pose, 1 / 120, camera.position);
      enemy.drive(POSES.guardM, 1 / 120, camera.position);
      study.time += 1 / 120;
    }
  } else if (posePick || pposePick) {
    const ep = pickPose(posePick) || POSES.guardL;
    const pp = pickPose(pposePick, true) || POSES.guardM;
    if (frames === 0) {
      enemy.snap(ep);
      player.snap(pp);
      enemy.resetFeet(ep);
      player.resetFeet(pp);
    }
    enemy.setGlow(posePick?.startsWith('windup') ? 0.7 : 0);
    enemy.drive(ep, realDt, camera.position);
    player.drive(pp, realDt, camera.position);
    fx.gather = pp === PLAYER.sheathed ? 1 : 0;
  } else {
    if (auto) autopilot();
    duel.update(dt);
    enemy.setGlow(duel.E.glow);
    enemy.setFlash(duel.E.flash * 0.9);
    enemy.setDissolve(duel.E.dissolve);
    if (fx.flood > 0 && fx.flood < 1) fx.flood = Math.min(1, fx.flood + realDt * 0.5);
    fx.gather = duel.P.sheathed ? 1 : duel.P.sheathing ? 0.4 : 0;
    enemy.boost = duel.enemyBoost;
    const tag = duel.anim.tag;
    player.boost = tag === 'cut' || tag === 'draw' || tag === 'parry' ? 2.4 : tag === 'dodge' ? 1.6 : 1;
    enemy.drive(duel.pose, dt, camera.position);
    player.drive(duel.playerPose, dt, camera.position);
  }
  bamboo.update(now / 1000);

  // camera: shake, dodge sidestep, a push-in on the draw, a faint handheld drift
  cam.t += realDt;
  cam.shake = Math.max(0, cam.shake - realDt * 3.2);
  const s = cam.shake * cam.shake;
  cam.dodgeT = Math.min(1, cam.dodgeT + realDt / 0.55);
  const d = cam.dodgeT < 1 ? Math.sin(Math.PI * cam.dodgeT) : 0;
  cam.drawT = Math.min(1, cam.drawT + realDt / 1.1);
  const dr = cam.drawT < 1 ? Math.sin(Math.PI * Math.pow(cam.drawT, 0.6)) : 0;
  const wantPush = duel.E.state === 'windup' ? 0.025 : duel.E.state === 'strike' ? 0.04 : 0;
  cam.push += (wantPush - cam.push) * Math.min(1, realDt * 6);
  const sx = (noise1(cam.t * 31) - 0.5) * s * 0.08 + Math.sin(cam.t * 0.6) * 0.006;
  const sy = (noise1(cam.t * 29 + 7) - 0.5) * s * 0.06 + Math.sin(cam.t * 0.9) * 0.004;
  camera.position.copy(cam.base).lerp(cam.look, cam.push + dr * 0.03);
  camera.position.x += sx + cam.dodgeSide * d * 0.42;
  camera.position.y += sy - d * 0.05;
  camera.lookAt(cam.look.x + cam.dodgeSide * d * 0.15, cam.look.y, cam.look.z);
  camera.rotateZ(-cam.dodgeSide * d * 0.04 + dr * 0.05 + (noise1(cam.t * 23 + 3) - 0.5) * s * 0.035);

  if (fullBody) placeCamera();
  renderer.render(scene, camera);
  fx.hud = duel.hud();
  fx.render(realDt);

  frames++;
  if (frames >= 3 && visualSettled) window.__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('skip') || auto) startFight();
else if (!fullBody && !posePick && !pposePick) screens.title(() => startFight());
if (params.get('demo') === 'draw') {
  // dev: start already sheathed, opponent about to cut
  const D = duel;
  D.E.state = 'idle'; D.E.t = 0; D.E.dur = 0.4; D.E.guard = 'L';
  D.P.sheathed = true;
  D.anim.idle = PLAYER.sheathed;
  D.anim.play([{ pose: PLAYER.sheathed, dur: 0.01 }], { then: 'hold', tag: 'sheathe' });
  player.snap(PLAYER.sheathed);
}
