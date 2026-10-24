// Static X/Z grid. Entries are stored in every cell their bounds overlap, so
// queries inspect only intersecting cells and retain boundary-crossing objects.
export class AreaIndex {
  constructor(cellSize=64){this.cellSize=cellSize;this.cells=new Map();this.count=0;}
  insert(value,x0,z0,x1=x0,z1=z0){
    const entry={value,x0,z0,x1,z1,id:this.count++},s=this.cellSize;
    for(let z=Math.floor(z0/s);z<=Math.floor(z1/s);z++)for(let x=Math.floor(x0/s);x<=Math.floor(x1/s);x++){
      const key=`${x}:${z}`;let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(entry);
    }
  }
  query(x0,z0,x1,z1){const result=[],seen=new Set(),s=this.cellSize;
    for(let z=Math.floor(z0/s);z<=Math.floor(z1/s);z++)for(let x=Math.floor(x0/s);x<=Math.floor(x1/s);x++)for(const e of this.cells.get(`${x}:${z}`)||[]){
      if(seen.has(e.id)||e.x1<x0||e.x0>x1||e.z1<z0||e.z0>z1)continue;seen.add(e.id);result.push(e);
    }
    // Stable source order keeps composited voxel opacity deterministic.
    result.sort((a,b)=>a.id-b.id);return result.map(e=>e.value);
  }
}
