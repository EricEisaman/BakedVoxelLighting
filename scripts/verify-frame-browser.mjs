import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{await p.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.rafProbe={count:0};window.requestAnimationFrame=cb=>raf(t=>{rafProbe.count++;cb(t);});});await p.goto('http://127.0.0.1:5173');await p.waitForFunction(()=>worldDiagnostics.ready&&!worldDiagnostics.baking,null,{timeout:180000});await p.waitForTimeout(8000);
const idle=await p.evaluate(()=>({timing:worldDiagnostics.frameTiming,callbacks:rafProbe.count}));
for(let i=0;i<100;i++){await p.mouse.move(100+(i*13)%800,200+(i*7)%400);await p.waitForTimeout(15);}
const moving=await p.evaluate(()=>({timing:worldDiagnostics.frameTiming,callbacks:rafProbe.count}));assert.ok(idle.timing.samples>10);assert.ok(moving.timing.samples>10);assert.ok(moving.callbacks>idle.callbacks);assert.ok(moving.timing.cpuMs>0);assert.deepEqual(errors,[]);await writeFile('evidence/frame-timing.json',JSON.stringify({idle,moving,errors},null,2));console.log({idle,moving,errors});}finally{await b.close();}
