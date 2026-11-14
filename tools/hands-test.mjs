import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { cutPoses, POSES } from '../src/actor/poses.js';
import { TIP } from '../src/actor/sword.js';
for (const p of [POSES.rest, POSES.guardM]) {
  assert.equal(p.two, 1);
  assert.ok(p.lhand[1] > 0.85);
}
for (let i = 0; i < 32; i++) {
  const x = Math.cos(i * Math.PI / 16), y = Math.sin(i * Math.PI / 16);
  const keys = cutPoses(x, y);
  for (const p of keys) {
    assert.ok(Object.values(p).flat().every(Number.isFinite));
    assert.equal(p.two, 1);
    assert.ok(p.lhand[1] > 0.85);
    assert.ok(Math.abs(p.dir.reduce((s, v, j) => s + v * p.edge[j], 0)) < 1e-10);
  }
  const tips = keys.map(p => p.hilt.map((v,j) => v + p.dir[j] * TIP));
  const sweep = (tips[2][0]-tips[0][0]) * -x + (tips[2][1]-tips[0][1]) * y;
  assert.ok(sweep > 1.7, `direction ${i}: lateral sweep ${sweep}`);
  assert.ok(tips[1][2] > Math.max(tips[0][2], tips[2][2]) + 0.3, `direction ${i}: forward contact arc`);
  assert.ok(keys[1].dir[2] > 0.99, `direction ${i}: contact points toward opponent`);
  for (const p of keys) {
    assert.ok(Math.abs(p.dir[0] * y + p.dir[1] * x) < 1e-10, 'blade stays in swipe/forward plane');
  }
  if (Math.abs(y) < 1e-10) assert.ok(Math.max(...tips.map(t=>t[1])) - Math.min(...tips.map(t=>t[1])) < 0.03, 'horizontal cut stays level in XZ');
}
console.log('32 directions: two-handed grip, forward-arc blade sweep and tangent edge PASS');
const browser = await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}), timeout:15000, args:[`--use-angle=${process.env.ANGLE || 'metal'}`, '--enable-webgl']});
const watchdog = setTimeout(() => browser.close(), 110000);
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  page.setDefaultTimeout(15000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  for (const [name,at] of [['idle',0.7],['windup',1.6],['impact',2],['follow',2.55]]) {
    for (const [view,cam] of [['front','-1.1,1.65,-3.6'],['side','3.8,1.65,0.7'],['back','-1,1.7,3.8'],['normal',null]]) {
      await page.goto(`http://127.0.0.1:5190/?demo=cut&at=${at}${cam ? `&cam=${cam}&look=0,0.95,0` : ''}`);
      await page.waitForFunction(()=>window.__ready);
      const result=await page.evaluate(async()=>{
        const p=__game.player;
        const forward=p.pts.hR.clone().set(0,1,0).applyQuaternion(p.handR.quaternion);
        return {low:p.pts.hL.y, wrist:forward.dot(p.pts.hR.clone().sub(p.pts.elR).normalize()), tip:p.pts.tip.distanceTo(p.pts.hR), finite:p.sword.quaternion.toArray().every(Number.isFinite)};
      });
      assert.ok(result.low > 0.85 && result.wrist > 0.999 && result.finite);
      assert.ok(Math.abs(result.tip-TIP)<1e-8);
      await page.screenshot({path:`/tmp/hands-${name}-${view}.png`});
    }
  }
  const motion = await page.evaluate(async () => {
    const {cutPoses, blendPose, makePose}=await import('/src/actor/poses.js');
    const p=__game.player, out=makePose();
    let maxReach=0, tangent=0, axial=0;
    for (let direction=0;direction<32;direction++) {
      const keys=cutPoses(Math.cos(direction*Math.PI/16),Math.sin(direction*Math.PI/16));
      let previous;
      for (let segment=0;segment<2;segment++) for(let i=0;i<=60;i++) {
        blendPose(keys[segment],keys[segment+1],i/60,out);
        p.apply(out,0,__game.camera.position);
        const d=p.pts.tip.clone().sub(p.pts.hR).normalize();
        const b=p.pts.hR.clone().addScaledVector(d,0.7);
        const target=p.pts.hR.clone().set(out.hilt[0]+out.root[0],out.hilt[1],out.hilt[2]+out.root[1]);
        maxReach=Math.max(maxReach,target.distanceTo(p.pts.shR));
        if(previous) {
          const velocity=b.clone().sub(previous);
          const along=velocity.dot(d);
          axial+=Math.abs(along);
          tangent+=velocity.addScaledVector(d,-along).length();
        }
        previous=b;
      }
    }
    return {maxReach,tangent,axial};
  });
  console.log('IK-clamped blade-point travel',motion);
  assert.ok(motion.maxReach <= 0.58 && motion.tangent > motion.axial * 2,JSON.stringify(motion));
  await page.goto('http://127.0.0.1:5190/?skip');
  await page.waitForFunction(()=>window.__ready);
  await page.evaluate(()=>__game.synthSwipe(216.87));
  await page.waitForTimeout(120);
  await page.screenshot({path:'/tmp/hands-live-cut.png'});
  assert.deepEqual(errors,[]);
  console.log('16 phase/views, wrist alignment, tip length, live swipe and no page errors PASS');
} finally {clearTimeout(watchdog); await browser.close();}
