import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }), args: [`--use-angle=${process.env.ANGLE || 'metal'}`, '--enable-webgl'] });
const watchdog = setTimeout(() => browser.close(), 110000);
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto('http://127.0.0.1:5190/');
  await page.waitForFunction(() => window.__ready);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x,y]) => ({ x,y })) });
  async function swipe() {
    await touch('touchStart', [[280,180]]);
    for (let x = 300; x <= 540; x += 40) await touch('touchMove', [[x,180]]);
    await touch('touchEnd', []);
  }
  async function rotate(portrait) {
    await page.setViewportSize(portrait ? { width: 390, height: 844 } : { width: 844, height: 390 });
    // With the virtual clock paused, Chromium may defer its native resize event.
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.clock.runFor(32);
    assert.equal(await page.locator('#rotate-prompt').isVisible(), portrait);
    assert.equal(await page.locator('#ui').evaluate(el => el.inert), portrait);
  }
  const snapshot = () => page.evaluate(() => {
    const { duel:d, cam, player:p } = __game;
    return { time:d.time, P:JSON.stringify(d.P), E:JSON.stringify(d.E), tag:d.anim.tag, lastCut:d.lastCut, over:d.over, pending:d.pending.length, cam:JSON.stringify(cam), pose:JSON.stringify(p.shown) };
  });
  // Title must survive blocked taps and both orientation changes.
  assert.equal(await page.locator('.title').count(), 1);
  await rotate(true);
  await page.touchscreen.tap(195,422);
  await page.clock.runFor(500);
  assert.equal(await page.locator('.title').count(), 1);
  await rotate(false);
  assert.equal(await page.locator('.title').count(), 1);
  await page.touchscreen.tap(422,195);
  await page.clock.runFor(1500);
  assert.equal(await page.locator('.title').count(), 0);

  // A release-only short swipe must commit; a cancelled gesture must not.
  const edge = await page.evaluate(() => {
    const d = __game.duel, app = document.querySelector('#app');
    let calls = 0;
    const original = d.onSwipe;
    d.onSwipe = () => calls++;
    const send = (target, type, x) => target.dispatchEvent(new PointerEvent(type, {pointerId:91, clientX:x, clientY:180, bubbles:true}));
    send(app,'pointerdown',280); send(window,'pointerup',310);
    const released = calls;
    send(app,'pointerdown',280); send(window,'pointermove',300); send(window,'pointercancel',310);
    d.onSwipe = original;
    return {released,cancelled:calls-released};
  });
  assert.deepEqual(edge,{released:1,cancelled:0});

  // Real Chromium touch events traverse SwipeInput, not the synthetic swipe hook.
  await swipe();
  assert.equal(await page.evaluate(() => __game.duel.anim.tag), 'cut');
  await page.clock.runFor(32);
  await page.screenshot({ path:'/tmp/ink-duel-mobile-cut.png' });
  console.log('844x390 touch horizontal cut PASS');
  for (const [selector,side] of [['.dodge.l',-1],['.dodge.r',1]]) {
    await page.clock.runFor(700);
    await page.locator(selector).tap();
    const state = await page.evaluate(() => ({ tag:__game.duel.anim.tag, side:__game.duel.P.dodgeSide }));
    assert.deepEqual(state, { tag:'dodge', side });
  }
  console.log('Left/right touch dodge buttons PASS');

  // Rotate during a held gesture: disabling input must discard it.
  await touch('touchStart', [[280,180]]);
  await rotate(true);
  const before = await snapshot();
  await touch('touchMove', [[350,180]]);
  await touch('touchEnd', []);
  await page.touchscreen.tap(195,422);
  await page.keyboard.press('a');
  await page.keyboard.press('d');
  await page.clock.runFor(2000);
  assert.deepEqual(await snapshot(), before, 'portrait freezes time, HP, combat/animation/camera state and rejects input');
  await page.screenshot({ path:'/tmp/ink-duel-mobile-portrait.png' });
  await rotate(false);
  const resumed = await snapshot();
  assert.ok(resumed.time > before.time && resumed.time - before.time < 0.1, 'resume without accumulated portrait time');
  await page.clock.runFor(700);
  await page.locator('.dodge.l').tap();
  assert.equal(await page.evaluate(() => __game.duel.anim.tag), 'dodge');
  console.log('390x844 overlay, frozen state/input and landscape resume PASS');

  // Seed a completed match through its production end hook to test result UI deterministically.
  await page.evaluate(() => {
    const d = __game.duel;
    d.over = true;
    d.hooks.end(true, { perfect:2, draws:1, maxCombo:3, time:12 });
  });
  const result = await page.locator('.result').innerText();
  await rotate(true);
  const ended = await snapshot();
  await page.clock.runFor(1000);
  await page.touchscreen.tap(195,422);
  assert.deepEqual(await snapshot(), ended);
  assert.equal(await page.locator('.result').innerText(), result);
  await rotate(false);
  assert.equal(await page.locator('.result').innerText(), result);
  assert.equal(await page.evaluate(() => __game.duel.over), true);
  await page.screenshot({ path:'/tmp/ink-duel-mobile-result.png' });
  await page.touchscreen.tap(422,195);
  await page.clock.runFor(550);
  assert.equal(await page.locator('.result').count(), 0);
  assert.equal(await page.evaluate(() => __game.duel.over), false);
  assert.deepEqual(errors, []);
  console.log('Title/result rotation preservation, retry and no page errors PASS');
} finally {
  clearTimeout(watchdog);
  await browser.close();
}
