import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(
    () => worldDiagnostics.ready && !worldDiagnostics.baking,
    null,
    { timeout: 180000 },
  );
  const faces = await page.evaluate(async () => {
    const T = await import("/node_modules/three/build/three.module.js"),
      tiles = [];
    worldTest.scene.traverse((o) => {
      if (o.userData.terrainTile && o.visible) tiles.push(o);
    });
    const x = 19,
      z = 43,
      h = worldTest.terrainSample(x, z).height;
    const down = new T.Raycaster(
      new T.Vector3(x, h + 100, z),
      new T.Vector3(0, -1, 0),
    );
    const up = new T.Raycaster(
      new T.Vector3(x, h - 100, z),
      new T.Vector3(0, 1, 0),
    );
    worldTest.scene.updateMatrixWorld(true);
    return {
      singleSided: tiles.every((o) => o.material.side === T.FrontSide),
      aboveHits: down.intersectObjects(tiles, false).length,
      belowHits: up.intersectObjects(tiles, false).length,
    };
  });
  assert.equal(faces.singleSided, true);
  assert.ok(faces.aboveHits > 0);
  assert.equal(faces.belowHits, 0);
  await page.evaluate(() => {
    const w = worldTest;
    w.camera.position.set(19, -50, 43);
    w.controls.target.set(19, -48, 10);
    document.body.classList.add("exploring");
    document.querySelector("aside").style.display = "none";
  });
  await page.waitForTimeout(1300);
  const camera = await page.evaluate(() => {
    const p = worldTest.camera.position;
    return { y: p.y, floor: worldTest.terrainCameraFloor(p.x, p.z) };
  });
  assert.ok(camera.y >= camera.floor - 1e-5);
  await page.screenshot({ path: "evidence/terrain-front-face.png" });
  const streamingFloor = await page.evaluate(async () => {
    const T = await import("/node_modules/three/build/three.module.js"),
      w = worldTest;
    w.controls.update = () => {};
    w.camera.position.set(1450.3, -50, 1350.7);
    await new Promise(requestAnimationFrame);
    const tiles = [];
    w.scene.traverse((o) => {
      if (o.userData.terrainTile && o.visible) tiles.push(o);
    });
    w.scene.updateMatrixWorld(true);
    const p = w.camera.position;
    const ray = new T.Raycaster(
      new T.Vector3(p.x, 500, p.z),
      new T.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObjects(tiles, false)[0];
    return {
      cameraY: p.y,
      floor: w.terrainCameraFloor(p.x, p.z),
      surfaceY: hit.point.y,
      segments: hit.object.geometry.parameters.widthSegments,
    };
  });
  assert.ok(
    streamingFloor.segments < 48,
    "test must cover the coarse mesh retained while pages load",
  );
  assert.ok(streamingFloor.floor >= streamingFloor.surfaceY + 1.85 - 1e-5);
  assert.ok(streamingFloor.cameraY >= streamingFloor.floor - 1e-5);
  assert.deepEqual(errors, []);
  await writeFile(
    "evidence/terrain-faces.json",
    JSON.stringify({ faces, camera, streamingFloor, errors }, null, 2),
  );
  console.log({ faces, camera, streamingFloor, errors });
} finally {
  await browser.close();
}
