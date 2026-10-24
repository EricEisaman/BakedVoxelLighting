import {BakeCache} from './cache.js';
const cache=new BakeCache('BakedGrassBlocks-v1'),ready=cache.open();
import {Color} from 'three';
const smooth=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
self.onmessage=async ({data:{id,x,z,seed,land,level,identity}})=>{
 await ready;const key=`${identity}:${x}:${z}:${seed}:${level}`;
 const cached=await cache.get(key);
 if(cached){self.postMessage({id,batches:cached,cacheHit:true},cached.flatMap(b=>[b.matrices.buffer,b.colours.buffer]));return;}
 const rng=()=>{seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
 const sample=(xx,zz,c)=>{const gx=(xx-x+12)/2,gz=(zz-z+12)/2,ix=Math.min(11,Math.floor(gx)),iz=Math.min(11,Math.floor(gz)),u=gx-ix,v=gz-iz;const at=(a,b)=>land[((iz+b)*13+ix+a)*6+c];return (at(0,0)*(1-u)+at(1,0)*u)*(1-v)+(at(0,1)*(1-u)+at(1,1)*u)*v;};
 const groups=[[],[],[]],colours=[[],[],[]],counts=[0,0,0],colour=new Color();
 if(level===2){
  const sourceTint=new Color().setHSL(.21,.20,.74);
  for(let i=0;i<110;i++){
   const xx=x+(rng()-.5)*24,zz=z+(rng()-.5)*24,h=sample(xx,zz,0),traffic=sample(xx,zz,1),moist=sample(xx,zz,2),slope=sample(xx,zz,3),root=sample(xx,zz,4),river=sample(xx,zz,5);
   if(traffic>.15||slope>.62||river<10||rng()<smooth(root,.08,.65)*.98)continue;
   const patch=.5+.25*Math.sin(xx*.073+Math.sin(zz*.047)*2.8)+.25*Math.sin(zz*.119+xx*.031);
   if(rng()>.58+patch*.4)continue;
   const type=rng()<.06+moist*patch*.36?2:rng()<.07+(1-moist)*(1-patch)*.42?1:0;
   const scale=(.65+rng()*.55)*(.42+patch*.8),a=rng()*6.283,c=Math.cos(a)*scale,s=Math.sin(a)*scale;
   groups[type].push(c,0,-s,0,0,scale,0,0,s,0,c,0,xx,h+.5*scale,zz,1);
   colour.setHSL(.21,.20,.65+patch*.18);
   colours[type].push(colour.r/sourceTint.r,colour.g/sourceTint.g,colour.b/sourceTint.b);
  }
 }else
 for(let i=0;i<3400;i++){
  const xx=x+(rng()-.5)*24,zz=z+(rng()-.5)*24,h=sample(xx,zz,0),traffic=sample(xx,zz,1),moist=sample(xx,zz,2),slope=sample(xx,zz,3),root=sample(xx,zz,4),river=sample(xx,zz,5);
  if(traffic>.12+rng()*.25||slope>.62||river<10)continue;
  if(rng()<smooth(root,.08,.65)*.98)continue;
  const patch=.5+.25*Math.sin(xx*.073+Math.sin(zz*.047)*2.8)+.25*Math.sin(zz*.119+xx*.031);
  if(rng()>.58+patch*.4)continue;
  const type=rng()<.06+moist*patch*.36?2:rng()<.07+(1-moist)*(1-patch)*.42?1:0;
  const scale=(type===2?.26+rng()*.28:.32+rng()*.52)*(.42+patch*.8),angle=rng()*Math.PI*.55+Math.sin(xx*.018+zz*.011)*1.2,keep=counts[type]++%(level===0?1:3)===0;
  for(let k=0;k<2;k++){
   colour.setHSL(.19+rng()*.04,.20,.59+patch*.18+rng()*.12);colour.setHex(colour.getHex());
   if(!keep)continue;
   const a=angle+k*Math.PI/2,c=Math.cos(a),s=Math.sin(a),sx=scale*(type===2?1.3:1.1);
   groups[type].push(c*sx,0,-s*sx,0,0,scale,0,0,s*scale,0,c*scale,0,xx,h-.025,zz,1);
   colours[type].push(colour.r,colour.g,colour.b);
  }
 }
 const batches=groups.map((g,k)=>({matrices:new Float32Array(g),colours:new Float32Array(colours[k])}));
 await cache.put(key,batches);
 self.postMessage({id,batches,cacheHit:false},batches.flatMap(b=>[b.matrices.buffer,b.colours.buffer]));
};
