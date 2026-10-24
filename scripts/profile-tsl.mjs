import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
page.on('console',m=>{if(m.type()==='error')console.log(m.text().slice(0,800));});
try{
 await page.goto('http://127.0.0.1:5173/?backend=webgpu');
 await page.waitForFunction(()=>window.worldDiagnostics?.ready&&!worldDiagnostics.baking,null,{timeout:180000});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
 await page.waitForTimeout(15000);const {profile}=await cdp.send('Profiler.stop');
 await writeFile('evidence/native-cpu-profile.json',JSON.stringify(profile));
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]);const key=n.callFrame.functionName+' '+n.callFrame.url.split('/').pop()+':'+(n.callFrame.lineNumber+1);counts.set(key,(counts.get(key)||0)+profile.timeDeltas[i]);}
 console.log('SELF',JSON.stringify([...counts].sort((a,b)=>b[1]-a[1]).slice(0,25),null,2));
 console.log('STATE',await page.evaluate(()=>({frame:worldDiagnostics.frameTiming,draws:worldDiagnostics.drawCalls,triangles:worldDiagnostics.triangles,merged:worldDiagnostics.mergedVisibility})));
 await page.screenshot({path:'evidence/native-scene.png'});
 await page.evaluate(()=>{worldTest.scene.traverse(o=>{if(o.isMesh)o.receiveShadow=false;});});
 await page.waitForTimeout(1000);
 await page.screenshot({path:'evidence/native-no-shadow-diagnostic.png'});
}finally{await browser.close();}
