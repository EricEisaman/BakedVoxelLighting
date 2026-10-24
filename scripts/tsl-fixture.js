import * as T from "three/webgpu";
import * as N from "three/tsl";
import { fullscreen, readPixels } from "../src/tsl-baking.js";
// Imported only by browser verification, using the same Vite-resolved Three.js instance.
export { T, N, fullscreen, readPixels };
export async function billboardNormalCheck(renderer) {
  const { surfaceBillboards } = await import("../src/impostors.js");
  const pixels = new Uint8Array(8 * 4 * 4),
    normals = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels.set([60, 170, 40, 255], i);
    normals.set([204, 230, 128, 255], i);
  }
  const map = new T.DataTexture(pixels, 8, 4),
    normal = new T.DataTexture(normals, 8, 4);
  map.needsUpdate = normal.needsUpdate = true;
  const atlas = {
    texture: map,
    normal,
    record: { views: 2, width: 2, height: 2 },
  };
  const mesh = surfaceBillboards(
      atlas,
      [{ p: [0, 0, 0], r: [0, 0.7, 0], s: [1, 1, 1] }],
      0.48,
    ),
    m = mesh.material;
  m.fragmentNode = N.vec4(
    N.normalize(N.cameraWorldMatrix.mul(N.vec4(m.normalNode, 0)).xyz)
      .mul(0.5)
      .add(0.5),
    1,
  );
  m.toneMapped = false;
  const scene = new T.Scene();
  scene.add(mesh);
  const camera = new T.PerspectiveCamera(35, 1, 0.1, 20),
    target = new T.RenderTarget(16, 16),
    old = renderer.getRenderTarget(),
    out = [];
  try {
    for (const a of [0, 1.2, 2.8]) {
      camera.position.set(Math.sin(a) * 5, 0, Math.cos(a) * 5);
      camera.lookAt(0, 0, 0);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(old);
      const data = new Uint8Array(16 * 16 * 4);
      await readPixels(renderer, target, 0, 0, 16, 16, data);
      out.push([...data.slice((8 + 8 * 16) * 4, (8 + 8 * 16) * 4 + 4)]);
    }
    return out;
  } finally {
    renderer.setRenderTarget(old);
    target.dispose();
    mesh.geometry.dispose();
    m.dispose();
    map.dispose();
    normal.dispose();
  }
}
