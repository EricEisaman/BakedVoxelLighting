import {BakeCache} from './cache.js';
import {terrainSample} from './terrain-field.js';
const worker=new Worker(new URL('./grass-worker.js',import.meta.url),{type:'module'});
export const grassBakeStats={hits:0,bakes:0};
let id=0;const pending=new Map(),resident=new Map();
worker.onmessage=({data})=>{grassBakeStats[data.cacheHit?"hits":"bakes"]++;pending.get(data.id)?.resolve(data.batches);pending.delete(data.id);};
worker.onerror=e=>{for(const job of pending.values())job.reject(new Error(e.message));pending.clear();};
export function buildGrassBatches(x,z,seed,level,identity){
 const address=`${identity}:${x}:${z}:${seed}:${level}`;
 if(resident.has(address)){grassBakeStats.hits++;return resident.get(address);}
 const land=new Float32Array(13*13*6);
 for(let j=0;j<13;j++)for(let i=0;i<13;i++){const s=terrainSample(x-12+i*2,z-12+j*2);land.set([s.height,s.traffic,s.moisture,s.slope,s.root,s.riverDistance],(j*13+i)*6);}
 const job=new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});worker.postMessage({id:key,x,z,seed,level,land,identity},[land.buffer]);});
 resident.set(address,job);if(resident.size>96)resident.delete(resident.keys().next().value);job.catch(()=>resident.delete(address));return job;
}

export async function clearGrassBakes(){
 resident.clear();const cache=new BakeCache('BakedGrassBlocks-v1');await cache.open();await cache.clear();cache.db?.close();grassBakeStats.hits=grassBakeStats.bakes=0;
}
