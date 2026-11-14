import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { makePose, copyPose, blendPose, cutPoses } from '../src/actor/poses.js';
import { PoseSpring } from '../src/actor/spring.js';
const a = makePose(), b = makePose({ pelvis: 0.6, weight: [-0.06, 0.09] }), out = makePose();
assert.deepEqual(copyPose(b).weight, b.weight);
blendPose(a, b, 0.5, out);
assert.equal(out.pelvis, a.pelvis + (b.pelvis - a.pelvis) * 0.5);
assert.deepEqual(out.weight, a.weight.map((v, i) => v + (b.weight[i] - v) * 0.5));
const spring = new PoseSpring(a);
for (let i = 0; i < 240; i++) spring.update(1 / 120, b, out);
assert.ok(Math.abs(out.pelvis - b.pelvis) < 1e-4);
assert.ok(Math.abs(out.weight[1] - b.weight[1]) < 1e-4);
for (const [x, y] of [[1,0], [-1,0], [0,1], [0,-1], [-0.8,-0.6]]) {
  for (const p of cutPoses(x,y)) assert.ok(Object.values(p).flat().every(Number.isFinite));
}
console.log('Pose copy/blend/spring and cut directions PASS');
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}), timeout: 15000, args: [`--use-angle=${process.env.ANGLE || 'metal'}`, '--enable-unsafe-swiftshader', '--enable-webgl'] });
const watchdog = setTimeout(() => { console.error('Browser test exceeded 90s budget'); browser.close(); }, 90000);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [name, at] of [['idle',0.7], ['windup',1.6], ['impact',2], ['follow',2.55], ['recover',3.1]]) {
    await page.goto(`http://127.0.0.1:5190/?demo=cut&at=${at}`);
    await page.waitForFunction(() => window.__ready);
    const state = await page.evaluate(() => {
      const p = __game.player;
      return { phase: __game.study.phase, finite: p.legs.every(l => [...l.mesh.geometry.attributes.position.array].every(Number.isFinite)),
        support: p.legs.map((l,i) => l.ankle.distanceTo(p.feet[i].obj.position.clone().add({x:0,y:0.075,z:0}))),
        feet: p.feet.map(f => [f.obj.position.x, f.obj.position.y, f.obj.position.z, f.obj.rotation.y]),
        bent: p.legs.map(l => l.hip.distanceTo(l.ankle) / (l.hip.distanceTo(l.knee) + l.knee.distanceTo(l.ankle))), pelvis: p.shown.pelvis, twist: p.shown.twist };
    });
    assert.ok(state.finite);
    assert.ok(state.support.every(d => d < 0.002), JSON.stringify(state));
    // Cloth chains adapt to planted feet; test knee bend, not an obsolete fixed reach.
    assert.ok(state.bent.every(ratio => ratio > 0 && ratio <= 0.995 + 1e-6), JSON.stringify(state));
    assert.ok(state.feet.every(f => Math.abs(f[1]) < 1e-6));
    assert.deepEqual(state.feet.map(f => f[3]), [-0.1,0.45]);
    await page.screenshot({ path: `/tmp/full-body-${name}.png`, timeout: 20000 });
    console.log(name, JSON.stringify(state));
  }
  for (const pose of ['sheathed','drawCut','drawFollow','parryL','parryR','parryO','kneel','dodge1','dodge-1']) {
    await page.goto(`http://127.0.0.1:5190/?ppose=${pose}`);
    await page.waitForFunction(() => window.__ready);
    assert.ok(await page.evaluate(() => __game.player.legs.every(l => [...l.mesh.geometry.attributes.position.array].every(Number.isFinite))));
  }
  const transitions = await page.evaluate(async () => {
    const { cutPoses, dodgePose, PLAYER, POSES } = await import('/src/actor/poses.js');
    const p = __game.player;
    const poses = Array.from({length:8}, (_,i) => cutPoses(Math.cos(i*Math.PI/4), Math.sin(i*Math.PI/4))).flat();
    poses.push(dodgePose(1), dodgePose(-1), PLAYER.sheathed, PLAYER.drawCut, PLAYER.drawFollow, POSES.kneel);
    let error = 0, finite = true;
    for (const pose of poses) for (let frame = 0; frame < 30; frame++) {
      p.drive(pose, 1/120, __game.camera.position);
      for (let i = 0; i < 2; i++) {
        const l = p.legs[i];
        error = Math.max(error, l.ankle.distanceTo(p.feet[i].obj.position.clone().add({x:0,y:0.075,z:0})));
        finite &&= [...l.mesh.geometry.attributes.position.array].every(Number.isFinite);
      }
    }
    const snapshot = () => JSON.stringify(p.feet.map(f => [f.t, f.pos.toArray(), f.to.toArray(), f.obj.position.toArray()]));
    const before = snapshot();
    for (let i=0;i<10;i++) p.drive(PLAYER.drawCut, 0, __game.camera.position);
    return { error, finite, frozen: before === snapshot() };
  });
  assert.ok(transitions.error < 0.002 && transitions.finite && transitions.frozen, JSON.stringify(transitions));
  console.log('Eight cut directions / dodge / draw / kneel transitions and hitstop', transitions);
  await page.goto('http://127.0.0.1:5190/?ppose=guardM&character=code&cam=2.8,2.1,3.8&look=0,0.9,-0.6');
  await page.waitForFunction(() => window.__ready);
  await page.screenshot({ path: '/tmp/ink-duel-after-fullbody.png', timeout: 20000 });
  await page.goto('http://127.0.0.1:5190/?auto=draw');
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(6000);
  assert.ok(await page.evaluate(() => __game.duel.time > 1 && __game.player.visualStatus === 'code'));
  await page.screenshot({ path: '/tmp/full-body-live.png', timeout: 20000 });
  assert.deepEqual(errors, []);
  console.log('Full-body screenshots, foot support, compatibility poses, live auto=draw, page errors PASS');
} finally { clearTimeout(watchdog); await browser.close(); }
