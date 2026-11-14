import assert from 'node:assert/strict';
import { Duel, ANGLE } from '../src/game/duel.js';
import * as THREE from 'three';
const noop=()=>{};
const actor={chest:()=>new THREE.Vector3(),bladeMid:()=>new THREE.Vector3(),bladeClosestTo:()=>new THREE.Vector3()};
const calls=[];
const fx=new Proxy({w:844,h:390,m:390},{get:(o,k)=>k in o?o[k]:noop});
const duel=new Duel({enemy:actor,player:actor,fx,sfx:new Proxy({},{get:()=>noop}),ground:null,view:{project:()=>({x:400,y:200})},hooks:{hitstop:t=>calls.push(['stop',t]),shake:noop,slowmo:noop}});
for(const dir of ['L','R','O','D']) {
 duel.reset();duel.E.state='strike';duel.E.attack={dir,S:.13,angle:ANGLE[dir]};duel.P.parry={dir,time:0};
 duel.resolveImpact();assert.equal(duel.P.hp,5);assert.equal(duel.stats.parry,1);assert.equal(duel.E.state,'stagger');
}
duel.reset();duel.E.state='windup';calls.length=0;
const sw={a:{x:0,y:0},b:{x:100,y:0},dx:100,dy:0};
duel.drawStrike(sw);assert.equal(calls.length,0,'iai must not freeze inside saya');assert.equal(duel.E.hp,30);
duel.update(.08);assert.equal(duel.E.hp,30);
duel.update(.01);assert.equal(duel.E.hp,25);assert.equal(calls[0][0],'stop');
duel.reset();duel.E.state='recover';duel.E.dur=10;
duel.onSwipe(sw);duel.update(.10);assert.equal(duel.E.hp,30,'no damage during windup');duel.update(.02);assert.equal(duel.E.hp,29);
console.log('Four-way parries, delayed draw hit-stop and normal contact timing PASS');
