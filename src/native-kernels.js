import { glslFn, wgslFn, Fn } from 'three/tsl';
import volumeGLSL from './shaders/volume.glsl?raw';
import volumeWGSL from './shaders/volume.wgsl?raw';
let gpu = true;
export function setShaderBackend(value) { gpu = value; }
export function nativeFunction(glsl, wgsl) {
  const g = glslFn(glsl), w = wgslFn(wgsl);
  const textures = new Set([...glsl.matchAll(/sampler[23]D\s+(\w+)/g)].map(m => m[1]));
  return parameters => Fn(() => {
    // GLSL combines texture and sampler. Three's TextureNode treats sampler*
    // outputs as WGSL sampler bindings, so pass the texture property explicitly.
    const bindings = gpu ? parameters : Object.fromEntries(Object.entries(parameters)
      .map(([name,node]) => [name,textures.has(name) ? node.convert('property') : node]));
    return (gpu ? w : g)(bindings);
  })();
}
export const volumeKernel = nativeFunction(volumeGLSL, volumeWGSL);
export const rotatePlant = nativeFunction(
`vec3 rotatePlant(vec3 v,float a){return vec3(v.x*cos(a)+v.z*sin(a),v.y,v.z*cos(a)-v.x*sin(a));}`,
`fn rotatePlant(v:vec3f,a:f32)->vec3f{return vec3f(v.x*cos(a)+v.z*sin(a),v.y,v.z*cos(a)-v.x*sin(a));}`);
export const grassNormal = nativeFunction(
`vec3 grassNormal(vec3 detail,float yaw){vec3 n=normalize(vec3(detail.x*.22,.9,detail.y*.22));return vec3(n.x*cos(yaw)+n.z*sin(yaw),n.y,n.z*cos(yaw)-n.x*sin(yaw));}`,
`fn grassNormal(detail:vec3f,yaw:f32)->vec3f{let n=normalize(vec3f(detail.x*.22,.9,detail.y*.22));return vec3f(n.x*cos(yaw)+n.z*sin(yaw),n.y,n.z*cos(yaw)-n.x*sin(yaw));}`);
export const windPosition = nativeFunction(
`vec3 windPosition(vec3 p,float t,float id,float y,float v,float strength){return p+vec3(sin(t*1.35+id*.73+y)*strength*v*v,0.,0.);}`,
`fn windPosition(p:vec3f,t:f32,id:f32,y:f32,v:f32,strength:f32)->vec3f{return p+vec3f(sin(t*1.35+id*.73+y)*strength*v*v,0.,0.);}`);
export const fadeMask = nativeFunction(
`bool fadeMask(vec2 p,vec2 range){float n=fract(52.9829189*fract(dot(floor(p),vec2(.06711056,.00583715))));return n>=range.x&&n<range.y;}`,
`fn fadeMask(p:vec2f,range:vec2f)->bool{let n=fract(52.9829189*fract(dot(floor(p),vec2f(.06711056,.00583715))));return n>=range.x&&n<range.y;}`);
export const atlasUV = nativeFunction(
`vec2 atlasUV(vec2 uv,float angle,float yaw,float views,float row,float rows){float frame=mod(floor((angle-yaw)/6.28318530718*views+.5)+views,views);return vec2((uv.x+frame)/views,(uv.y+row)/rows);}`,
`fn atlasUV(uv:vec2f,angle:f32,yaw:f32,views:f32,row:f32,rows:f32)->vec2f{let index=floor((angle-yaw)/6.28318530718*views+.5)+views;let frame=index-floor(index/views)*views;return vec2f((uv.x+frame)/views,(uv.y+row)/rows);}`);
export const foliageRadiance = nativeFunction(
`vec3 foliageRadiance(vec3 n,vec3 indirect,vec3 bent,float enabled,vec3 sun,float visibility,vec3 lamp,float power,float thin,float daylight){vec3 result=indirect*2.1*enabled*(.7+.3*max(dot(n,normalize(bent)),0.));float back=pow(max(dot(-n,sun),0.),.65);float sunPass=mix(1.,visibility,enabled);float local=power/(12.+dot(lamp,lamp));return result*(.04+.96*daylight)+thin*(vec3(1.,.86,.56)*(.16+.9*back)*sunPass*daylight+vec3(1.,.42,.12)*local*(.25+.75*max(dot(-n,normalize(lamp)),0.)));}`,
`fn foliageRadiance(n:vec3f,indirect:vec3f,bent:vec3f,enabled:f32,sun:vec3f,visibility:f32,lamp:vec3f,power:f32,thin:f32,daylight:f32)->vec3f{let result=indirect*2.1*enabled*(.7+.3*max(dot(n,normalize(bent)),0.));let back=pow(max(dot(-n,sun),0.),.65);let sunPass=mix(1.,visibility,enabled);let local=power/(12.+dot(lamp,lamp));return result*(.04+.96*daylight)+thin*(vec3f(1.,.86,.56)*(.16+.9*back)*sunPass*daylight+vec3f(1.,.42,.12)*local*(.25+.75*max(dot(-n,normalize(lamp)),0.)));}`);
export const groundBlend = nativeFunction(
`vec3 groundBlend(vec3 p,vec3 camera,vec4 land,vec3 soil,vec3 lush,vec3 dry,vec3 stone,float root,vec4 cover){vec3 meadow=mix(dry,lush,smoothstep(.22,.64,land.b));float wear=max(smoothstep(.08,.72,land.g),smoothstep(.08,.65,root)*.92);float rock=smoothstep(.32,.72,land.a);float macroTint=.90+.10*sin(p.x*.038+sin(p.z*.027)*2.);vec2 block=floor((p.xz+2000.)/24.)*24.-1988.;float far=smoothstep(59.,146.,distance(camera,vec3(block.x,land.r,block.y)));meadow=mix(meadow,cover.rgb,cover.a*far*.85);return mix(mix(meadow*macroTint,soil,wear),stone,rock*(1.-wear))*(1.-land.b*.12);}`,
`fn groundBlend(p:vec3f,camera:vec3f,land:vec4f,soil:vec3f,lush:vec3f,dry:vec3f,stone:vec3f,root:f32,cover:vec4f)->vec3f{var meadow=mix(dry,lush,smoothstep(.22,.64,land.b));let wear=max(smoothstep(.08,.72,land.g),smoothstep(.08,.65,root)*.92);let rock=smoothstep(.32,.72,land.a);let macroTint=.90+.10*sin(p.x*.038+sin(p.z*.027)*2.);let block=floor((p.xz+vec2f(2000.))/24.)*24.-vec2f(1988.);let far=smoothstep(59.,146.,distance(camera,vec3f(block.x,land.r,block.y)));meadow=mix(meadow,cover.rgb,cover.a*far*.85);return mix(mix(meadow*macroTint,soil,wear),stone,rock*(1.-wear))*(1.-land.b*.12);}`);
export const sampleAtlas = nativeFunction(
`vec4 sampleAtlas(sampler2D map,vec3 p,vec3 origin,vec3 extent,vec3 dims,vec4 fallback,float flipY){vec3 local=(p-origin)/extent;if(any(lessThan(local,vec3(0.)))||any(greaterThan(local,vec3(1.))))return fallback;vec3 c=clamp(local*dims-.5,vec3(0.),dims-1.);float y=floor(c.y);vec2 a=vec2((c.x+.5)/dims.x,(c.z+.5+y*dims.z)/(dims.z*dims.y));vec2 b=vec2(a.x,(c.z+.5+min(y+1.,dims.y-1.)*dims.z)/(dims.z*dims.y));vec3 edge=min(local,1.-local)*extent;float weight=smoothstep(0.,24.,min(edge.x,edge.z))*smoothstep(0.,6.,edge.y);return mix(fallback,mix(textureLod(map,a,0.),textureLod(map,b,0.),fract(c.y)),weight);}`,
`fn sampleAtlas(map:texture_2d<f32>,linearSampler:sampler,p:vec3f,origin:vec3f,extent:vec3f,dims:vec3f,fallback:vec4f,flipY:f32)->vec4f{let local=(p-origin)/extent;if(any(local<vec3f(0.))||any(local>vec3f(1.))){return fallback;}let c=clamp(local*dims-vec3f(.5),vec3f(0.),dims-vec3f(1.));let y=floor(c.y);var a=vec2f((c.x+.5)/dims.x,(c.z+.5+y*dims.z)/(dims.z*dims.y));var b=vec2f(a.x,(c.z+.5+min(y+1.,dims.y-1.)*dims.z)/(dims.z*dims.y));if(flipY>.5){a.y=1.-a.y;b.y=1.-b.y;}let edge=min(local,vec3f(1.)-local)*extent;let weight=smoothstep(0.,24.,min(edge.x,edge.z))*smoothstep(0.,6.,edge.y);return mix(fallback,mix(textureSampleLevel(map,linearSampler,a,0.),textureSampleLevel(map,linearSampler,b,0.),fract(c.y)),weight);}`);
export const normalKernel = nativeFunction(
`vec4 normalKernel(sampler2D map,vec2 uv,vec2 texel,float strength){vec4 l=textureLod(map,uv-vec2(texel.x,0.),0.),r=textureLod(map,uv+vec2(texel.x,0.),0.),b=textureLod(map,uv-vec2(0.,texel.y),0.),t=textureLod(map,uv+vec2(0.,texel.y),0.);vec3 weights=vec3(.299,.587,.114);float dx=dot(r.rgb,weights)*r.a-dot(l.rgb,weights)*l.a,dy=dot(t.rgb,weights)*t.a-dot(b.rgb,weights)*b.a;return vec4(normalize(vec3(-dx*strength,-dy*strength,1.))*.5+.5,1.);}`,
`fn normalKernel(map:texture_2d<f32>,linearSampler:sampler,uv:vec2f,texel:vec2f,strength:f32)->vec4f{let l=textureSampleLevel(map,linearSampler,uv-vec2f(texel.x,0.),0.);let r=textureSampleLevel(map,linearSampler,uv+vec2f(texel.x,0.),0.);let b=textureSampleLevel(map,linearSampler,uv-vec2f(0.,texel.y),0.);let t=textureSampleLevel(map,linearSampler,uv+vec2f(0.,texel.y),0.);let weights=vec3f(.299,.587,.114);let dx=dot(r.rgb,weights)*r.a-dot(l.rgb,weights)*l.a;let dy=dot(t.rgb,weights)*t.a-dot(b.rgb,weights)*b.a;return vec4f(normalize(vec3f(-dx*strength,-dy*strength,1.))*.5+vec3f(.5),1.);}`);
export const nativeVolumeSource = volumeGLSL + volumeWGSL;

// One world-space cloud field for visible sky and surface sunlight.
export const cloudDensity = nativeFunction(
`float cloudDensity(vec3 p,vec3 direction,float t){
 if(direction.y<=.015)return 0.;
 vec2 q=(p.xz+direction.xz*max(0.,(650.-p.y)/direction.y)+vec2(t*2.,t*.6))*.0045;
 float sum=0.,amplitude=.57;
 for(int octave=0;octave<4;octave++){
  vec2 cell=floor(q),f=fract(q);f=f*f*(3.-2.*f);
  vec4 dots=vec4(dot(cell,vec2(127.1,311.7)),dot(cell+vec2(1,0),vec2(127.1,311.7)),dot(cell+vec2(0,1),vec2(127.1,311.7)),dot(cell+vec2(1,1),vec2(127.1,311.7)));
  vec4 h=fract(sin(dots)*43758.5453);
  sum+=amplitude*mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
  q=q*2.07+vec2(17.1,9.2);amplitude*=.48;
 }
 return smoothstep(.43,.69,sum);
}`,
`fn cloudDensity(p:vec3f,direction:vec3f,t:f32)->f32{
 if(direction.y<=.015){return 0.;}
 var q=(p.xz+direction.xz*max(0.,(650.-p.y)/direction.y)+vec2f(t*2.,t*.6))*.0045;
 var sum=0.;var amplitude=.57;
 for(var octave=0;octave<4;octave++){
  let cell=floor(q);var f=fract(q);f=f*f*(vec2f(3.)-2.*f);
  let dots=vec4f(dot(cell,vec2f(127.1,311.7)),dot(cell+vec2f(1,0),vec2f(127.1,311.7)),dot(cell+vec2f(0,1),vec2f(127.1,311.7)),dot(cell+vec2f(1,1),vec2f(127.1,311.7)));
  let h=fract(sin(dots)*43758.5453);
  sum+=amplitude*mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
  q=q*2.07+vec2f(17.1,9.2);amplitude*=.48;
 }
 return smoothstep(.43,.69,sum);
}`);
