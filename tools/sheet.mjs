#!/usr/bin/env node
// Contact sheet: node tools/sheet.mjs out.png a.png b.png ... [--cols=2 --w=640]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const files = args.filter((a) => !a.startsWith('--'));
const out = resolve(files.shift());
const cols = +(opt.cols ?? 2), w = +(opt.w ?? 640);
const imgs = files.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()}</figcaption></figure>`).join('');
const html = `<style>body{margin:0;display:grid;grid-template-columns:repeat(${cols},${w}px);background:#222}figure{margin:0;position:relative}img{width:${w}px;display:block}figcaption{position:absolute;left:4px;top:2px;color:#f33;font:14px monospace}</style>${imgs}`;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: cols * w, height: 400 } });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log('wrote', out);
