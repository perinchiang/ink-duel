// Integration checks against the running Vite server (npm run dev).
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-webgl'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = 'http://127.0.0.1:5190/';
  for (const pose of ['rest', 'parryL', 'parryR', 'parryO', 'sheathed', 'drawCut', 'dodge1', 'dodge-1']) {
    await page.goto(`${base}?character=rigged&ppose=${pose}`);
    await page.waitForFunction(() => window.__ready);
    const result = await page.evaluate(() => {
      const d = __game.player, v = d.visual;
      const hand = v.bones.RightHand;
      const centre = hand.position.clone().set(0, 0.064 / 1.75, 0.018 / 1.75);
      d.root.worldToLocal(hand.localToWorld(centre));
      return { status: d.visualStatus, gripError: centre.distanceTo(d.pts.hR), finite: Object.values(v.bones).every(b => b.matrixWorld.elements.every(Number.isFinite)), hidden: !d.torso.visible, sword: d.sword.visible, enemy: __game.enemy.torso.visible };
    });
    assert.equal(result.status, 'rigged');
    assert.ok(result.gripError < 1e-5, JSON.stringify(result));
    assert.ok(result.finite && result.hidden && result.sword && result.enemy);
    console.log(pose, result);
  }
  await page.goto(`${base}?ppose=rest`);
  await page.waitForFunction(() => window.__ready);
  assert.equal(await page.evaluate(() => __game.player.visualStatus), 'code');
  await page.goto(`${base}?character=code&ppose=rest`);
  await page.waitForFunction(() => window.__ready);
  assert.equal(await page.evaluate(() => __game.player.visualStatus), 'code');
  await page.route('**/models/swordsman-a.glb', route => route.abort());
  await page.goto(`${base}?character=rigged&ppose=rest`);
  await page.waitForFunction(() => window.__ready);
  assert.ok(await page.evaluate(() => __game.player.visualStatus === 'fallback' && __game.player.torso.visible && __game.player.sword.visible));
  await page.unroute('**/models/swordsman-a.glb');
  await page.goto(`${base}?character=rigged&auto=draw`);
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(8000);
  assert.ok(await page.evaluate(() => __game.duel.time > 1 && __game.player.visualStatus === 'rigged'));
  assert.deepEqual(errors, []);
  console.log('Code comparison, failed-load fallback, live combat, and page errors: PASS');
} finally {
  await browser.close();
}
