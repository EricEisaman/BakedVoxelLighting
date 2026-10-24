import assert from 'node:assert/strict';
import {FrameClock,dampingAtDelta} from '../src/frame-clock.js';
const clock=new FrameClock();let now=0;
for(const hz of [60,180,90,60]){for(let i=0;i<hz*2;i++){clock.begin(now);clock.end(2);now+=1000/hz;}assert.ok(Math.abs(clock.read().fps-hz)<.01);assert.ok(Math.abs(clock.read().cpuMs-2)<.01);}
clock.begin(now+10000,true);assert.equal(clock.read().samples,0);assert.equal(clock.begin(now+11000),0);
for(const hz of [60,180]){let remaining=1;for(let i=0;i<hz;i++)remaining*=1-dampingAtDelta(.045,1/hz);assert.ok(Math.abs(remaining-Math.pow(.955,60))<1e-10);}
console.log('PASS: 60 -> 180 -> 90 -> 60 Hz, bake reset, resume delta, equal camera damping per second');
