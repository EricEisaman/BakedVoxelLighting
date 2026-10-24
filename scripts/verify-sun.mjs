import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
 await page.goto('http://127.0.0.1:5173/?backend=webgpu');
 await page.waitForFunction(()=>window.worldDiagnostics?.ready&&!worldDiagnostics.baking,null,{timeout:180000});
 await page.waitForTimeout(12000);
 const initial=await page.evaluate(()=>({frames:worldDiagnostics.frameTiming,grass:worldDiagnostics.grassLevels,sun:worldDiagnostics.sun}));
 await page.evaluate(()=>{const {camera,controls}=worldTest; const d=worldDiagnostics.sun.direction;controls.enableDamping=false;controls.target.copy(camera.position).add({x:d[0]*100,y:d[1]*100,z:d[2]*100});controls.update();});
 await page.waitForTimeout(4000);await page.screenshot({path:'evidence/visible-sun.png'});
 await page.locator('#sun').evaluate(e=>{e.value='55';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForTimeout(1000);
 const changed=await page.evaluate(()=>({sun:worldDiagnostics.sun,live:worldTest.lightUniforms.liveSunDirection.value.toArray()}));
 assert.notDeepEqual(initial.sun.direction,changed.sun.direction);
 assert.deepEqual(changed.sun.direction,changed.live);
 assert.ok(initial.grass[0]+initial.grass[1]+initial.grass[2]>1);
 assert.deepEqual(errors,[]);
 await writeFile('evidence/sun-check.json',JSON.stringify({initial,changed,errors},null,2));
 console.log({initial,changed,errors});
}finally{await browser.close();}
