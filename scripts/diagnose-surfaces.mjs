import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});
page.on('console',m=>{if(m.type()==='error')console.log(m.text().slice(0,500));});
try{await page.goto('http://127.0.0.1:5173/?backend=webgpu');await page.waitForFunction(()=>window.worldDiagnostics?.ready&&!worldDiagnostics.baking,null,{timeout:180000});
const data=await page.evaluate(()=>{const r=worldTest.world.grassBake.templates[0].record;const c=document.createElement('canvas');c.width=r.w;c.height=r.h;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.data),r.w,r.h),0,0);return c.toDataURL().split(',')[1];});await writeFile('evidence/grass-atlas.png',Buffer.from(data,'base64'));
const shader = await page.evaluate(async()=>{let mesh;worldTest.scene.traverse(o=>{if(o.isMesh&&o.material.userData.billboard&&!mesh)mesh=o;});return {code:await worldTest.renderer.debug.getShaderAsync(worldTest.scene,worldTest.camera,mesh),alpha:mesh.material.alphaTest,mask:!!mesh.material.maskNode};});await writeFile('evidence/impostor-shader.json',JSON.stringify(shader,null,2));
}finally{await browser.close();}
