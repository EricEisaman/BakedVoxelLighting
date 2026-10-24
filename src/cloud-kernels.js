import { nativeFunction } from "./native-kernels.js";
import densityGLSL from "./shaders/cloud-density.glsl?raw";
import densityWGSL from "./shaders/cloud-density.wgsl?raw";
export const cloudShape = nativeFunction(densityGLSL, densityWGSL);
export const cloudSample = nativeFunction(
  `vec4 cloudSample(sampler2D map,vec3 p,float flipY){
    if(p.y<0.||p.y>1.)return vec4(0.);
    float y=clamp(p.y*48.-.5,0.,47.),a=floor(y),b=min(a+1.,47.);
    vec2 pixel=fract(p.xz)*255.+.5;
    vec2 ua=(pixel+vec2(mod(a,8.),floor(a/8.))*256.)/vec2(2048.,1536.);
    vec2 ub=(pixel+vec2(mod(b,8.),floor(b/8.))*256.)/vec2(2048.,1536.);
    return mix(textureLod(map,ua,0.),textureLod(map,ub,0.),fract(y));
  }`,
  `fn cloudSample(map:texture_2d<f32>,linearSampler:sampler,p:vec3f,flipY:f32)->vec4f{
    if(p.y<0.||p.y>1.){return vec4f(0.);}
    let y=clamp(p.y*48.-.5,0.,47.);let a=floor(y);let b=min(a+1.,47.);
    let pixel=fract(p.xz)*255.+vec2f(.5);
    var ua=(pixel+vec2f(a-floor(a/8.)*8.,floor(a/8.))*256.)/vec2f(2048.,1536.);
    var ub=(pixel+vec2f(b-floor(b/8.)*8.,floor(b/8.))*256.)/vec2f(2048.,1536.);
    if(flipY>.5){ua.y=1.-ua.y;ub.y=1.-ub.y;}
    return mix(textureSampleLevel(map,linearSampler,ua,0.),textureSampleLevel(map,linearSampler,ub,0.),fract(y));
  }`,
);
export const cloudLighting = nativeFunction(
  `vec4 cloudLighting(sampler2D map,vec3 p,vec3 sun,float flipY){
    float density=cloudSample(map,p,flipY).r,depth=0.;
    if(density<.002)return vec4(0.,1.,p.y,1.);
    for(int i=1;i<=7;i++)depth+=cloudSample(map,p+sun*float(i)*75./vec3(6000.,620.,6000.),flipY).r;
    return vec4(density,exp(-depth*.64),p.y,1.);
  }`,
  `fn cloudLighting(map:texture_2d<f32>,linearSampler:sampler,p:vec3f,sun:vec3f,flipY:f32)->vec4f{
    let density=cloudSample(map,linearSampler,p,flipY).r;var depth=0.;
    if(density<.002){return vec4f(0.,1.,p.y,1.);}
    for(var i:i32=1;i<=7;i++){depth+=cloudSample(map,linearSampler,p+sun*f32(i)*75./vec3f(6000.,620.,6000.),flipY).r;}
    return vec4f(density,exp(-depth*.64),p.y,1.);
  }`,
  [cloudSample],
);
export const cloudTrace = nativeFunction(
  `vec4 cloudTrace(sampler2D map,vec3 eye,vec3 ray,vec3 sun,float time,float flipY){
    if(ray.y<.025)return vec4(0.);
    float start=max(0.,(650.-eye.y)/ray.y),end=min(11000.,(1270.-eye.y)/ray.y);
    if(end<=start)return vec4(0.);
    float stepSize=(end-start)/64.,tr=1.;vec3 colour=vec3(0.);
    float forward=pow(max(dot(ray,sun),0.),12.);float jitter=fract(sin(dot(ray.xz,vec2(127.1,311.7)))*43758.5453);
    for(int i=0;i<64;i++){
      vec3 p=eye+ray*(start+(float(i)+fract(jitter+float(i)*.618))*stepSize);
      p.xz+=vec2(2.,.6)*time;
      vec4 c=cloudSample(map,(p-vec3(0.,650.,0.))/vec3(6000.,620.,6000.),flipY);
      float a=1.-exp(-c.r*stepSize*.008);
      vec3 light=vec3(.30,.38,.50)*(.72+.38*c.b)+vec3(1.,.96,.88)*c.g*(.82+forward*.34);
      colour+=tr*a*light;tr*=1.-a;if(tr<.015)break;
    }
    float fade=smoothstep(.025,.075,ray.y);
    return vec4(colour*fade,(1.-tr)*fade);
  }`,
  `fn cloudTrace(map:texture_2d<f32>,linearSampler:sampler,eye:vec3f,ray:vec3f,sun:vec3f,time:f32,flipY:f32)->vec4f{
    if(ray.y<.025){return vec4f(0.);}
    let start=max(0.,(650.-eye.y)/ray.y);let end=min(11000.,(1270.-eye.y)/ray.y);
    if(end<=start){return vec4f(0.);}
    let stepSize=(end-start)/64.;var tr=1.;var colour=vec3f(0.);
    let forward=pow(max(dot(ray,sun),0.),12.);let jitter=fract(sin(dot(ray.xz,vec2f(127.1,311.7)))*43758.5453);
    for(var i:i32=0;i<64;i++){
      var p=eye+ray*(start+(f32(i)+fract(jitter+f32(i)*.618))*stepSize);
      p+=vec3f(2.,0.,.6)*time;
      let c=cloudSample(map,linearSampler,(p-vec3f(0.,650.,0.))/vec3f(6000.,620.,6000.),flipY);
      let a=1.-exp(-c.r*stepSize*.008);
      let light=vec3f(.30,.38,.50)*(.72+.38*c.b)+vec3f(1.,.96,.88)*c.g*(.82+forward*.34);
      colour+=tr*a*light;tr*=1.-a;if(tr<.015){break;}
    }
    let fade=smoothstep(.025,.075,ray.y);
    return vec4f(colour*fade,(1.-tr)*fade);
  }`,
  [cloudSample],
);
export const cloudShadow = nativeFunction(
  `float cloudShadow(sampler2D map,vec2 world,vec3 sun,float time,float flipY){
    if(sun.y<.035)return 0.;float depth=0.;
    for(int i=0;i<16;i++){
      float h=(float(i)+.5)/16.;vec2 xz=world+sun.xz*(650.+h*620.)/sun.y+vec2(2.,.6)*time;
      depth+=cloudSample(map,vec3(xz.x/6000.,h,xz.y/6000.),flipY).r;
    }
    return 1.-exp(-depth*.18/max(sun.y,.2));
  }`,
  `fn cloudShadow(map:texture_2d<f32>,linearSampler:sampler,world:vec2f,sun:vec3f,time:f32,flipY:f32)->f32{
    if(sun.y<.035){return 0.;}var depth=0.;
    for(var i:i32=0;i<16;i++){
      let h=(f32(i)+.5)/16.;let xz=world+sun.xz*(650.+h*620.)/sun.y+vec2f(2.,.6)*time;
      depth+=cloudSample(map,linearSampler,vec3f(xz.x/6000.,h,xz.y/6000.),flipY).r;
    }
    return 1.-exp(-depth*.18/max(sun.y,.2));
  }`,
  [cloudSample],
);
