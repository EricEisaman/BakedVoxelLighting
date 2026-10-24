import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto("http://127.0.0.1:5173/scripts/worker-fixture.html");
  const reports = [];
  for (const backend of ["webgpu", "webgl2"])
    reports.push(
      await page.evaluate(async (backend) => {
        const { T, N, readPixels } = await import("/scripts/tsl-fixture.js");
        const { PreparedSunShadow } = await import("/src/prepared-shadows.js");
        const renderer = new T.WebGPURenderer({
          forceWebGL: backend === "webgl2",
        });
        await renderer.init();
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFShadowMap;
        renderer.setSize(256, 256);
        renderer.toneMapping = T.NoToneMapping;
        const texels = new Uint8Array(4 * 4 * 4);
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++)
            texels.set([80, 150, 40, (x + y) % 2 ? 255 : 0], (y * 4 + x) * 4);
        const map = new T.DataTexture(texels, 4, 4);
        map.needsUpdate = true;
        const results = [];
        for (const prepared of [false, true]) {
          const scene = new T.Scene(),
            camera = new T.PerspectiveCamera(45, 1, 0.1, 30);
          camera.position.set(5, 7, 6);
          camera.lookAt(0, 0, 0);
          const sun = new T.DirectionalLight(0xffffff, 2);
          sun.position.set(3, 6, 2);
          sun.castShadow = true;
          sun.shadow.mapSize.set(256, 256);
          Object.assign(sun.shadow.camera, {
            left: -4,
            right: 4,
            top: 4,
            bottom: -4,
            near: 0.1,
            far: 20,
          });
          sun.shadow.normalBias = 0.02;
          const shadow = prepared ? new PreparedSunShadow(sun) : null;
          if (shadow) sun.shadow.shadowNode = shadow;
          scene.add(sun, sun.target, new T.AmbientLight(0xffffff, 0.2));
          const ground = new T.Mesh(
            new T.PlaneGeometry(10, 10),
            new T.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1 }),
          );
          ground.rotation.x = -Math.PI / 2;
          ground.receiveShadow = true;
          scene.add(ground);
          const material = new T.MeshStandardNodeMaterial({
            map,
            alphaTest: 0.4,
            side: T.DoubleSide,
          });
          material.maskNode = N.texture(map)
            .a.greaterThan(0.4)
            .and(N.uv().x.lessThan(0.85));
          material.positionNode = N.positionLocal.add(N.vec3(0.23, 0, 0));
          const card = new T.Mesh(new T.PlaneGeometry(3, 3), material);
          card.rotation.x = -Math.PI / 2;
          card.position.y = 1.8;
          card.castShadow = true;
          scene.add(card);
          const target = new T.RenderTarget(256, 256);
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
          if (shadow) await shadow.prepare(renderer, card, scene);
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
          const pixels = new Uint8Array(256 * 256 * 4);
          await readPixels(renderer, target, 0, 0, 256, 256, pixels);
          results.push(pixels);
          target.dispose();
          ground.geometry.dispose();
          ground.material.dispose();
          card.geometry.dispose();
          material.dispose();
          sun.dispose();
        }
        let maxDelta = 0,
          changed = 0,
          total = 0;
        for (let i = 0; i < results[0].length; i++) {
          const d = Math.abs(results[0][i] - results[1][i]);
          maxDelta = Math.max(maxDelta, d);
          total += d;
          if (d > 2) changed++;
        }
        map.dispose();
        renderer.dispose();
        return {
          backend,
          maxDelta,
          meanDelta: total / results[0].length,
          changed,
        };
      }, backend),
    );
  assert.deepEqual(errors, []);
  for (const r of reports)
    assert.ok(
      r.meanDelta < 0.25 && r.changed < 400,
      `${r.backend} prepared depth changed cutouts/wind shadows: ${JSON.stringify(r)}`,
    );
  await writeFile(
    "evidence/prepared-shadows.json",
    JSON.stringify({ reports, errors }, null, 2),
  );
  console.log(reports);
} finally {
  await browser.close();
}
