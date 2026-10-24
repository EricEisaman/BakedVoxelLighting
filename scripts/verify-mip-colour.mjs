import {readFile} from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=await readFile(new URL('../src/atlas-worker.js',import.meta.url),'utf8');
function bake(record){let result;const self={postMessage:x=>result=x};vm.runInNewContext(code,{self,Uint8Array,Float32Array,Math});self.onmessage({data:{id:1,record}});return result.levels;}
const data=new Uint8Array([255,0,0,255,255,0,0,255,0,0,0,255,0,0,255,0]);const normals=new Uint8Array(16);for(let i=0;i<16;i+=4)normals.set([128,128,255,255],i);
const levels=bake({w:2,h:2,views:1,data,normals,srgb:true});const last=levels.at(-1).data;assert.ok(last[0]>=212&&last[0]<=214);assert.equal(last[1],0);assert.equal(last[2],0);
const atlas=new Uint8Array(4*2*4),normal=new Uint8Array(atlas.length);for(let y=0;y<2;y++)for(let x=0;x<4;x++){atlas.set(x<2?[255,0,0,255]:[0,255,0,255],(y*4+x)*4);normal.set([128,128,255,255],(y*4+x)*4);}
const tail=bake({w:4,h:2,views:2,data:atlas,normals:normal}).at(-1);assert.deepEqual([...tail.data.slice(0,3)],[255,0,0]);assert.deepEqual([...tail.data.slice(4,7)],[0,255,0]);
console.log('Linear-light alpha-weighted mip colours and isolated atlas views pass.');
