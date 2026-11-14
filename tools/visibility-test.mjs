import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const label = process.env.LABEL || 'after';
const dir = `/tmp/ink-duel-visibility-${label}`;
const failures = [];
await fs.mkdir(dir, {recursive:true});
const browser = await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}), timeout:20000, args:['--use-angle=metal','--enable-unsafe-swiftshader']});
const watchdog=setTimeout(()=>browser.close(),110000);
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.setDefaultTimeout(15000);
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 // demo=cut selects its own full-body camera; capture the real gameplay defaults first.
 await page.goto('http://127.0.0.1:5190/?ppose=guardM');
 await page.waitForFunction(()=>window.__ready);
 const normalCamera=await page.evaluate(()=>({
  cam:__game.cam.base.toArray().join(','), look:__game.cam.look.toArray().join(','),
 }));
 console.log('Gameplay camera', normalCamera);
 const results=[];
 for(const [phase,at] of [['idle',0.7],['windup',1.6],['impact',2],['follow',2.55]]) {
  for(const [view,cam] of [['normal',normalCamera.cam],['side','3.8,1.65,0.7'],['front','-1.1,1.65,-3.6']]) {
   await page.goto(`http://127.0.0.1:5190/?demo=cut&at=${at}&cam=${cam}&look=${view==='normal' ? normalCamera.look : '0,0.95,0'}`);
   await page.waitForFunction(()=>window.__ready);
   const metrics=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {player:p,camera:c}=__game; p.root.updateMatrixWorld(true); c.updateMatrixWorld(true);
    // Raycast only opaque body surfaces, excluding ink outline hulls, sword and gripping hand.
    const body=[p.torso,p.head,p.skirt,p.belt,p.upperR,p.foreR,p.upperL,p.foreL,p.handL,...p.legs.map(l=>l.mesh)].map(o=>o.isMesh?o:o.children[0]);
    const blocked=(v)=>{const ray=new THREE.Raycaster(c.position,v.clone().sub(c.position).normalize(),0,c.position.distanceTo(v)-0.012); return ray.intersectObjects(body,false).length>0;};
    const h=p.toWorld(p.pts.hR.clone()), tip=p.tipWorld();
    const samples=Array.from({length:20},(_,i)=>h.clone().lerp(tip,(i+1)/20));
    const ndc=tip.clone().project(c);
    return {handBlocked:blocked(h),bladeVisible:samples.filter(v=>!blocked(v)).length/20,tipNdc:ndc.toArray(),reach:p.pts.hR.distanceTo(p.pts.shR)};
   });
   results.push({phase,view,...metrics});
   if(label!=='before' && view==='normal' && ['impact','follow'].includes(phase)) {
    if (metrics.handBlocked) failures.push(`${phase}: gripping hand behind body`);
    if (metrics.bladeVisible < 0.85) failures.push(`${phase}: blade depth visibility ${metrics.bladeVisible} < 0.85`);
   }
   await page.screenshot({path:`${dir}/${phase}-${view}.png`});
  }
 }
 await fs.writeFile(`${dir}/metrics.json`,JSON.stringify(results,null,2));
 // Freeze the browser clock, then dispatch real pointer input through the game's input handler.
 await page.clock.install();
 await page.goto('http://127.0.0.1:5190/?skip'); await page.waitForFunction(()=>window.__ready);
 await page.clock.pauseAt(new Date(Date.now()+10000));
 await page.mouse.move(800,340); await page.mouse.down();
 await page.mouse.move(560,520,{steps:8}); await page.mouse.up();
 const live=[];
 for(const [phase,ms] of [['windup',32],['impact',64],['follow',128]]) {
  await page.clock.runFor(ms);
  const state=await page.evaluate(async()=>{
   const T=await import('/node_modules/three/build/three.module.js');
   const {player:p,camera:c}=__game;
   p.root.updateMatrixWorld(true); c.updateMatrixWorld(true);
   const body=[p.torso,p.head,p.skirt,p.belt,p.upperR,p.foreR,p.upperL,p.foreL,p.handL,...p.legs.map(l=>l.mesh)].map(o=>o.isMesh?o:o.children[0]);
   const h=p.toWorld(p.pts.hR.clone()),tip=p.tipWorld();
   const blocked=v=>new T.Raycaster(c.position,v.clone().sub(c.position).normalize(),0,c.position.distanceTo(v)-.012).intersectObjects(body,false).length>0;
   return {tag:__game.duel.anim.tag,h:p.pts.hR.toArray(),handBlocked:blocked(h),bladeVisible:Array.from({length:20},(_,i)=>h.clone().lerp(tip,(i+1)/20)).filter(v=>!blocked(v)).length/20};
  });
  assert.equal(state.tag,'cut');
  live.push({phase,...state});
  if(label!=='before' && phase==='follow') {
   if (state.handBlocked) failures.push('live spring follow hand behind body');
   if (state.bladeVisible < 0.85) failures.push(`live spring follow blade ${state.bladeVisible} < 0.85`);
  }
  await page.screenshot({path:`${dir}/live-${phase}.png`});
 }
 await fs.writeFile(`${dir}/live.json`,JSON.stringify(live,null,2));
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${dir}/metrics.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify({normal:results.filter(r=>r.view==='normal'),live,failures},null,2));
 assert.deepEqual(failures, [], 'visibility regressions (screenshots and metrics saved in /tmp)');
} finally {clearTimeout(watchdog);await browser.close();}
