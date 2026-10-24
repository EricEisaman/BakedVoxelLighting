import assert from 'node:assert/strict';
import {AreaIndex} from '../src/area-index.js';
import {advanceHour,solarState} from '../src/day-cycle.js';
const index=new AreaIndex(64),items=[];
for(let i=0;i<1000;i++){const x=Math.sin(i*12.7)*1900,z=Math.cos(i*17.3)*1900,r=i%19;const e={i,x0:x-r,z0:z-r,x1:x+r,z1:z+r};items.push(e);index.insert(e,e.x0,e.z0,e.x1,e.z1);}
for(let i=0;i<100;i++){const x=-2000+i*40,z=-1900+i*31;const expected=items.filter(e=>e.x1>=x&&e.x0<=x+256&&e.z1>=z&&e.z0<=z+256);assert.deepEqual(index.query(x,z,x+256,z+256),expected);}
assert.equal(advanceHour(8,60),9);assert.equal(advanceHour(8,1440),8);assert.equal(advanceHour(23,120),1);
assert.equal(solarState(0).daylight,0);assert.equal(solarState(12).daylight,1);
console.log('Indexed queries match exhaustive bounds checks; 24-minute cycle and midnight/noon states pass.');
