import * as T from "three";
import { digest } from "./cache.js";
import { terrainGLSL, WORLD_VERSION } from "./world-data.js";
export const volumeMin = new T.Vector3(-100, -5, -100),
  volumeSize = new T.Vector3(200, 40, 200);
const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const common = `precision highp sampler3D;varying vec2 vUv;uniform vec3 dims;uniform vec3 vmin;uniform vec3 extent;
vec3 cell(){float row=floor(gl_FragCoord.y);return vec3(floor(gl_FragCoord.x),floor(row/dims.z),mod(row,dims.z));}
vec3 world(){return vmin+(cell()+.5)/dims*extent;}
${terrainGLSL}`;
const occupancy =
  common +
  `uniform sampler2D trees;uniform int treeCount;
void main(){vec3 p=world();float h=terrain(p.xz);vec3 c=vec3(.25,.19,.105);float a=0.;
if(p.y<h+.35){a=1.;c=mix(vec3(.25,.18,.10),vec3(.21,.29,.08),smoothstep(3.,7.,abs(p.x-7.*sin(p.z*.036)-3.*sin(p.z*.09))));}
for(int i=0;i<160;i++){if(i>=treeCount)break;vec4 t=texelFetch(trees,ivec2(i,0),0);vec3 q=p-t.xyz;float s=t.w;
float canopy=length((q-vec3(0.,8.2*s,0.))/vec3(4.4*s,4.7*s,4.4*s));
if(canopy<1.){a=max(a,.38*smoothstep(1.,.75,canopy));c=vec3(.19,.31,.065);}
if(length(q.xz)<.42*s&&q.y>0.&&q.y<7.*s){a=1.;c=vec3(.24,.16,.085);}}
gl_FragColor=vec4(c,a);}`;
const lighting =
  common +
  `uniform sampler3D field;uniform vec3 sun;
vec4 at(vec3 p){vec3 uv=(p-vmin)/extent;if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return vec4(0.);return texture(field,uv);}
float visibility(vec3 p,vec3 d){float tr=1.;for(int j=1;j<=32;j++){vec3 q=p+d*float(j)*2.1;tr*=1.-at(q).a*.88;if(tr<.015)break;}return tr;}
void main(){vec3 p=world();float direct=visibility(p+sun*1.6,sun);vec3 bounce=vec3(0.);float sky=0.;
for(int i=0;i<8;i++){float phi=float(i)*2.399963;float y=.15+float(i)*.105;vec3 dir=vec3(cos(phi)*sqrt(1.-y*y),y,sin(phi)*sqrt(1.-y*y));float tr=1.;
for(int j=1;j<=18;j++){vec3 q=p+dir*(1.5+float(j)*2.);vec4 hit=at(q);float w=tr*hit.a;if(w>.01)bounce+=w*hit.rgb*(.16+.62*visibility(q+sun*2.,sun))/8.;tr*=1.-hit.a;if(tr<.04)break;}sky+=tr/8.;}
vec3 indirect=vec3(.12,.17,.23)*(.23+sky*.77)+bounce*.9+vec3(.035,.045,.018)*exp(-max(p.y-terrain(p.xz),0.)*.17);
gl_FragColor=vec4(indirect,direct);}`;
export const bakeSignature = occupancy + lighting;
export function dataVolume(data, n) {
  const texture = new T.Data3DTexture(data, n, n / 2, n);
  texture.format = T.RGBAFormat;
  texture.type = T.UnsignedByteType;
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
export const lightUniforms = {
  bakedVolume: { value: dataVolume(new Uint8Array([45, 52, 60, 255]), 1) },
  volumeMin: { value: volumeMin },
  volumeSize: { value: volumeSize },
  bakedEnabled: { value: 0 },
  time: { value: 0 },
  lodTint: { value: 0 },
};
// One-cell fallback has a 1x1x1 extent, independent of normal bake dimensions.
lightUniforms.bakedVolume.value.image.height = 1;
export function decorate(material, { wind = 0, ground = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lightUniforms);
    shader.vertexShader =
      "varying vec3 vBakeWorld;uniform float time;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${wind ? `transformed.x+=sin(time*1.3+position.y*1.8+float(gl_InstanceID)*.7)*${wind.toFixed(3)}*uv.y;` : ""}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>\nvec4 bakeP=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nbakeP=instanceMatrix*bakeP;\n#endif\nvBakeWorld=(modelMatrix*bakeP).xyz;`,
    );
    shader.fragmentShader =
      "precision highp sampler3D;varying vec3 vBakeWorld;uniform sampler3D bakedVolume;uniform vec3 volumeMin;uniform vec3 volumeSize;uniform float bakedEnabled;\n" +
      shader.fragmentShader;
    if (ground)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>\nfloat path=abs(vBakeWorld.x-7.*sin(vBakeWorld.z*.036)-3.*sin(vBakeWorld.z*.09));float meadow=smoothstep(2.8,5.8,path+sin(vBakeWorld.z*1.5)*.3);diffuseColor.rgb*=mix(vec3(1.1,.91,.70),vec3(.43,.69,.24),meadow);`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>\nvec3 wn=inverseTransformDirection(normal,viewMatrix);vec4 baked=texture(bakedVolume,clamp((vBakeWorld+wn*1.1-volumeMin)/volumeSize,vec3(.001),vec3(.999)));reflectedLight.directDiffuse*=mix(1.,baked.a,bakedEnabled);reflectedLight.directSpecular*=mix(1.,baked.a,bakedEnabled);reflectedLight.indirectDiffuse+=diffuseColor.rgb*baked.rgb*2.3*bakedEnabled;`,
    );
  };
  material.customProgramCacheKey = () => `voxel-7-${wind}-${ground}`;
  return material;
}
export async function bakeVolume(
  renderer,
  world,
  cache,
  n,
  sun,
  assetHash,
  onProgress,
  force = false,
) {
  const key =
    "volume:" +
    (await digest(
      JSON.stringify({
        v: WORLD_VERSION,
        trees: world.trees,
        n,
        sun: sun.toArray(),
        assetHash,
        shader: bakeSignature,
      }),
    ));
  let record = force ? null : await cache.get(key);
  const cached = !!record;
  const start = performance.now();
  if (!record) {
    onProgress("Voxelizing terrain & canopy volumes", 0.12);
    const treeData = new Float32Array(160 * 4);
    world.trees.forEach((t, i) =>
      treeData.set([t.x, t.y, t.z, t.scale], i * 4),
    );
    const trees = new T.DataTexture(
      treeData,
      160,
      1,
      T.RGBAFormat,
      T.FloatType,
    );
    trees.needsUpdate = true;
    const dims = new T.Vector3(n, n / 2, n),
      target = new T.WebGLRenderTarget(n, (n * n) / 2, {
        depthBuffer: false,
        minFilter: T.NearestFilter,
        magFilter: T.NearestFilter,
      });
    const quad = new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: occupancy,
        uniforms: {
          dims: { value: dims },
          vmin: { value: volumeMin },
          extent: { value: volumeSize },
          trees: { value: trees },
          treeCount: { value: world.trees.length },
        },
      }),
    );
    const scene = new T.Scene();
    scene.add(quad);
    const camera = new T.Camera();
    const old = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const packed = new Uint8Array(((n * n * n) / 2) * 4);
      await renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        n,
        (n * n) / 2,
        packed,
      );
      // Render atlas is x,z,y; Data3DTexture is x,y,z. Reorder explicitly.
      const voxels = new Uint8Array(packed.length);
      for (let y = 0; y < n / 2; y++)
        for (let z = 0; z < n; z++)
          for (let x = 0; x < n; x++) {
            const a = (x + n * (z + n * y)) * 4,
              b = (x + n * (y + (n / 2) * z)) * 4;
            voxels.set(packed.subarray(a, a + 4), b);
          }
      const field = dataVolume(voxels, n);
      quad.material.dispose();
      quad.material = new T.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: lighting,
        uniforms: {
          dims: { value: dims },
          vmin: { value: volumeMin },
          extent: { value: volumeSize },
          field: { value: field },
          sun: { value: sun },
        },
      });
      onProgress("Tracing sun, sky & diffuse bounce on GPU", 0.29);
      await new Promise(requestAnimationFrame);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      await renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        n,
        (n * n) / 2,
        packed,
      );
      const data = new Uint8Array(packed.length);
      for (let y = 0; y < n / 2; y++)
        for (let z = 0; z < n; z++)
          for (let x = 0; x < n; x++) {
            const a = (x + n * (z + n * y)) * 4,
              b = (x + n * (y + (n / 2) * z)) * 4;
            data.set(packed.subarray(a, a + 4), b);
          }
      field.dispose();
      record = { data, n, key, ms: performance.now() - start };
      await cache.put(key, record);
    } finally {
      renderer.setRenderTarget(old);
      target.dispose();
      quad.geometry.dispose();
      quad.material.dispose();
      trees.dispose();
    }
  }
  const oldTexture = lightUniforms.bakedVolume.value;
  lightUniforms.bakedVolume.value = dataVolume(record.data, n);
  lightUniforms.bakedEnabled.value = 1;
  oldTexture.dispose();
  return {
    key,
    ms: performance.now() - start,
    bytes: record.data.byteLength,
    cached,
  };
}
export async function makeNormal(renderer, texture, strength = 3) {
  const w = texture.image.width,
    h = texture.image.height;
  const target = new T.WebGLRenderTarget(w, h, { depthBuffer: false });
  const material = new T.ShaderMaterial({
    vertexShader: vertex,
    uniforms: {
      map: { value: texture },
      texel: { value: new T.Vector2(1 / w, 1 / h) },
      strength: { value: strength },
    },
    fragmentShader: `varying vec2 vUv;uniform sampler2D map;uniform vec2 texel;uniform float strength;float h(vec2 p){vec4 c=texture2D(map,p);return dot(c.rgb,vec3(.299,.587,.114))*c.a;}void main(){float dx=h(vUv+vec2(texel.x,0.))-h(vUv-vec2(texel.x,0.));float dy=h(vUv+vec2(0.,texel.y))-h(vUv-vec2(0.,texel.y));gl_FragColor=vec4(normalize(vec3(-dx*strength,-dy*strength,1.))*.5+.5,1.);}`,
  });
  const scene = new T.Scene();
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  scene.add(mesh);
  const old = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, new T.Camera());
  const data = new Uint8Array(w * h * 4);
  await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h, data);
  renderer.setRenderTarget(old);
  mesh.geometry.dispose();
  material.dispose();
  target.dispose();
  return { data, w, h };
}
