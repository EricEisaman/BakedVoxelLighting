import * as T from 'three/webgpu';
import * as N from 'three/tsl';
import {cloudDensity} from './native-kernels.js';
import {ref} from './tsl-baking.js';
let target,quad,lastUpdate=-Infinity;
// A single explicit bake avoids attaching a render-to-texture dependency to
// every tree material. Only this small pass evaluates procedural cloud noise.
export function cloudAt(U,p,direction) {
  if(!target) {
    target=new T.RenderTarget(1024,1024,{type:T.HalfFloatType,depthBuffer:false});
    target.texture.generateMipmaps=true;target.texture.minFilter=T.LinearMipmapLinearFilter;
    target.texture.wrapS=target.texture.wrapT=T.RepeatWrapping;
    const q=N.uv().sub(.5).mul(20000);
    const density=cloudDensity({p:N.vec3(q.x,650,q.y),direction:N.vec3(0,1,0),t:N.float(0)});
    const material=new T.MeshBasicNodeMaterial();
    material.fragmentNode=N.vec4(density,density,density,1);
    material.depthTest=false;material.depthWrite=false;
    quad=new T.QuadMesh(material);
  }
  const distance=N.max(N.float(650).sub(p.y),0).div(N.max(direction.y,.015));
  const uv=p.xz.add(direction.xz.mul(distance)).add(N.vec2(2,.6).mul(ref(U,'time'))).div(20000).add(.5);
  return N.texture(target.texture,uv).r.mul(N.smoothstep(.03,.18,direction.y));
}
export function updateClouds(renderer,now) {
  if(!quad || lastUpdate!==-Infinity)return;
  lastUpdate=now;
  const previous=renderer.getRenderTarget();
  renderer.setRenderTarget(target);quad.render(renderer);renderer.setRenderTarget(previous);
}
export const getCloudTarget=()=>target;
