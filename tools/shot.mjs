#!/usr/bin/env node
// Screenshot / smoke-test helper. Drives the system Google Chrome through playwright-core.
//
//   node tools/shot.mjs <urlPath> <out.png> [options]
//
// urlPath is relative to the dev server root, e.g. "viewer.html?mod=vehicle/moped&demo=hero".
// The page must set window.__ready = true once its first frames are rendered.
//
// Options:
//   --w=1280 --h=720      viewport size
//   --wait=800            extra ms to wait after __ready before capturing
//   --eval="js"           evaluate JS in the page after ready (before the extra wait)
//   --keys="w:1500,a+w:800"  hold key combos for N ms in sequence before capturing (KeyboardEvent.key names)
//   --shots=3 --every=500 capture several frames (out-0.png, out-1.png ...)
//   --headed              show the browser window
//   --port=5190           dev server port
//   --timeout=60000       ready timeout
//   --print="js expr"     evaluate and print a JSON value after capture
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  }),
);
if (pos.length < 2) {
  console.error('usage: node tools/shot.mjs <urlPath> <out.png> [--w= --h= --wait= --eval= --keys= --shots= --every= --headed --print=]');
  process.exit(2);
}
const [urlPath, outArg] = pos;
const out = resolve(outArg);
mkdirSync(dirname(out), { recursive: true });
const W = +(opt.w ?? 1280), H = +(opt.h ?? 720);
const port = +(opt.port ?? 5190);
const url = /^https?:/.test(urlPath) ? urlPath : `http://127.0.0.1:${port}/${urlPath.replace(/^\//, '')}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !opt.headed,
  args: [
    '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  ],
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') console.log(`[console.${t}] ${m.text()}`);
    else if (opt.verbose) console.log(`[console.${t}] ${m.text()}`);
  });
  page.on('pageerror', (e) => { failed = true; console.log(`[pageerror] ${e.stack || e.message}`); });
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction('window.__ready === true', null, { timeout: +(opt.timeout ?? 60000) });
  } catch {
    failed = true;
    console.log('[shot] timed out waiting for window.__ready');
  }
  if (opt.eval) {
    const r = await page.evaluate(opt.eval);
    if (r !== undefined) console.log('[eval]', JSON.stringify(r));
  }
  if (opt.keys) {
    await page.mouse.click(W / 2, H / 2);
    for (const step of String(opt.keys).split(',')) {
      const [combo, ms] = step.split(':');
      const keys = combo.split('+').filter(Boolean);
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(+ms || 100);
      for (const k of keys) await page.keyboard.up(k);
    }
  }
  await page.waitForTimeout(+(opt.wait ?? 800));
  const shots = +(opt.shots ?? 1);
  for (let i = 0; i < shots; i++) {
    const p = shots > 1 ? out.replace(/\.png$/, `-${i}.png`) : out;
    await page.screenshot({ path: p });
    console.log('[shot] wrote', p);
    if (i < shots - 1) await page.waitForTimeout(+(opt.every ?? 500));
  }
  if (opt.print) console.log('[print]', JSON.stringify(await page.evaluate(opt.print)));
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
