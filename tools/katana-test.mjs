import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { HAND_SPACING, cutPoses } from '../src/actor/poses.js';
import { GRIP_BOTTOM } from '../src/actor/sword.js';
assert.ok(-HAND_SPACING - 0.035 > GRIP_BOTTOM, 'lower palm must fit on tsuka');
for (const x of [-1, 1]) for (const p of cutPoses(x, 0)) assert.ok(Math.abs(p.dir[1]) < 1e-8, 'horizontal cut stays horizontal');
const browser = await chromium.launch({ channel:'chrome', args:['--use-angle=metal','--enable-webgl'] });
try {
 const page = await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5190/?ppose=guardM&pose=guardM');
 await page.waitForFunction(()=>window.__ready);
 const result=await page.evaluate(async()=>{
  const {cutPoses,POSES,ATTACKS,PLAYER,HAND_SPACING}=await import('/src/actor/poses.js');
  const {Animator}=await import('/src/actor/animator.js');
  const {armClearance}=await import('/src/actor/grip.js');
  const p=__game.player,e=__game.enemy,cam=__game.camera.position;
  let grip=0,clearance=10,worst=null,contact=99;
  const check=(actor,label)=>{const P=actor.pts;const d=P.tip.clone().sub(P.hR).normalize();
   grip=Math.max(grip,P.hL.distanceTo(P.hR.clone().addScaledVector(d,-HAND_SPACING)));
   for(const side of ['R','L']) {const c=armClearance(P['el'+side],P['h'+side],P.hips,actor.chestQ);if(c<clearance){clearance=c;worst={label,side};}}
   if(!Object.values(P).every(v=>v.toArray().every(Number.isFinite)))throw Error('non-finite joints');};
  e.apply(POSES.guardM,0,cam);const chest=e.chest();
  for(let dir=0;dir<16;dir++) {
   const k=cutPoses(Math.cos(dir*Math.PI/8),Math.sin(dir*Math.PI/8));const anim=new Animator(POSES.guardM);
   anim.play([{pose:k[0],dur:.05},{pose:k[1],dur:.06,ease:'inQuad'},{pose:k[2],dur:.12}],{back:.26,tag:'cut'});
   p.snap(POSES.guardM);p.boost=2.4;
   for(let frame=0;frame<90;frame++){p.drive(anim.update(1/120),1/120,cam);check(p,`direction ${dir} frame ${frame}`);
    if(dir===8){const a=p.toWorld(p.pts.hR.clone()),b=p.tipWorld(),ab=b.clone().sub(a);const t=Math.max(0,Math.min(1,chest.clone().sub(a).dot(ab)/ab.lengthSq()));contact=Math.min(contact,a.addScaledVector(ab,t).distanceTo(chest));}}
  }
  for(const actor of [p,e]) for(const pose of [...Object.values(ATTACKS).flatMap(Object.values),...Object.values(PLAYER.parry)]) {actor.apply(pose,0,cam);check(actor,`${actor.name} keyframe ${JSON.stringify(pose.hilt)}`);}
  return {grip,clearance,worst,contact};
 });
 console.log(result);
 assert.ok(result.grip<0.002,'both hands must stay on tsuka');
 assert.ok(result.clearance>=1,'forearms and sleeve allowance must clear torso');
 assert.ok(result.contact<0.3,'horizontal cut reaches opponent');
 assert.deepEqual(errors,[]);
 console.log('Katana grip, continuous arm clearance, swipe plane and contact PASS');
} finally {await browser.close();}
