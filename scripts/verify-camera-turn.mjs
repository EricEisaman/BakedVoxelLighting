import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1280,height:800}});const errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{await p.addInitScript(()=>{const raf=requestAnimationFrame;window.turnSamples=[];window.measuring=false;window.requestAnimationFrame=cb=>raf(t=>{if(measuring){if(window.lastMeasured && t>lastMeasured)turnSamples.push(t-lastMeasured);window.lastMeasured=t;}cb(t);});});
await p.goto('http://127.0.0.1:5173/?backend='+ (process.argv[2]||'webgpu'));await p.waitForFunction(()=>window.worldDiagnostics?.ready&&!worldDiagnostics.baking,null,{timeout:180000});await p.waitForTimeout(2000);
const cdp=await p.context().newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
const reports=[];
for(let pass=0;pass<2;pass++){
await p.evaluate(()=>{turnSamples=[];lastMeasured=0;measuring=true;});
await p.mouse.move(800,550);await p.mouse.down();
for(let i=0;i<100;i++){await p.mouse.move(800-i*6,550+30*Math.sin(i*.05));await p.waitForTimeout(16);}await p.mouse.up();await p.waitForTimeout(1000);
reports.push(await p.evaluate(()=>{measuring=false;const sorted=turnSamples.slice().sort((a,b)=>a-b);return {frames:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),over50ms:sorted.filter(t=>t>50).length,draws:worldDiagnostics.drawCalls,triangles:worldDiagnostics.triangles};}));}
await p.waitForFunction(()=>!worldDiagnostics.baking,null,{timeout:120000});
const rebuild=await p.evaluate(async()=>{
  turnSamples=[];lastMeasured=0;measuring=true;
  worldTest.camera.position.x+=140;worldTest.controls.target.x+=140;
  const started=performance.now();await worldTest.rebake();measuring=false;
  const samples=turnSamples.filter(t=>t>0).sort((a,b)=>a-b);
  return {durationMs:performance.now()-started,frames:samples.length,p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1)};
});
const {profile}=await cdp.send('Profiler.stop');await writeFile('evidence/moving-cpu-profile.json',JSON.stringify(profile));
assert.ok(rebuild.frames>5,'background voxel rebuild must keep presenting frames');
await p.screenshot({path:'evidence/native-camera-turn.png'});await writeFile('evidence/camera-turn.json',JSON.stringify({reports,rebuild,errors},null,2));console.log({reports,rebuild,errors});assert.deepEqual(errors,[]);
}finally{await b.close();}
