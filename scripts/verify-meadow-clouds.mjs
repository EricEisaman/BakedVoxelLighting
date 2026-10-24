import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const backend = process.argv[2] || "webgpu";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("ERROR", e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text());
    console.log("ERROR", m.text().slice(0, 2500));
  }
});
try {
  await page.goto("http://127.0.0.1:5173/?backend=" + backend);
  await page.waitForFunction(
    () =>
      (window.worldDiagnostics?.ready && !worldDiagnostics.baking) ||
      window.worldDiagnostics?.errors.length,
    null,
    { timeout: 240000 },
  );
  assert.deepEqual(errors, []);
  await page.locator("#dayCycle").uncheck();
  await page.locator("#timeOfDay").evaluate((e) => {
    e.value = 10;
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.addStyleTag({
    content:
      "body > :not(canvas):not(script) {visibility:hidden!important} canvas {visibility:visible!important}",
  });
  const report = await page.evaluate(async () => {
    const w = worldTest,
      U = w.lightUniforms;
    const { T, N, fullscreen, readPixels } =
      await import("/scripts/tsl-fixture.js");
    const { texRef } = await import("/src/tsl-baking.js");
    // This formerly returned the old green/grey texture, even after replacing it.
    const slot = {
      map: { value: new T.DataTexture(new Uint8Array([0, 255, 0, 255]), 1, 1) },
    };
    slot.map.value.needsUpdate = true;
    const quad = new T.QuadMesh(
      fullscreen(texRef(slot, "map").sample(N.vec2(0.5))),
    );
    const target = new T.RenderTarget(4, 4, { depthBuffer: false });
    w.renderer.setRenderTarget(target);
    quad.render(w.renderer);
    w.renderer.setRenderTarget(null);
    slot.map.value = new T.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    slot.map.value.needsUpdate = true;
    w.renderer.setRenderTarget(target);
    quad.render(w.renderer);
    w.renderer.setRenderTarget(null);
    const bytes = new Uint8Array(64);
    await readPixels(w.renderer, target, 0, 0, 4, 4, bytes);
    const record = await w.cache.get(worldDiagnostics.grassGround.surface.key);
    const data = record.data;
    let coverage = 0,
      variance = 0;
    let sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      coverage += data[i + 3] > 250 ? 1 : 0;
      variance += Math.abs(data[i + 1] - data[((i + 20) % data.length) + 1]);
    }
    sum = sum.map((v) => v / (data.length / 4));
    return {
      referenceSwap: [...bytes.slice(0, 4)],
      ground: {
        ...worldDiagnostics.grassGround,
        mean: sum,
        coverage: coverage / (data.length / 4),
        detailDifference: variance / (data.length / 4),
      },
      clouds: { ...worldDiagnostics.clouds },
      frame: worldDiagnostics.frameTiming,
    };
  });
  assert.deepEqual(report.referenceSwap, [255, 0, 0, 255]);
  assert.ok(
    report.ground.mean[1] > report.ground.mean[2] * 2,
    "meadow should remain green",
  );
  assert.ok(
    report.ground.coverage > 0.98,
    "terrain canopy must cover the ground",
  );
  assert.ok(
    report.ground.detailDifference > 1,
    "grass surface must retain spatial texture",
  );
  assert.ok(report.ground.surface.mips >= 10);
  assert.equal(report.clouds.maximumAttenuation, 0.22);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `evidence/meadow-${backend}.png` });
  // Broad view across distances beyond the streamed local volume.
  await page.evaluate(() => {
    const w = worldTest;
    w.controls.enableDamping = false;
    w.camera.position.set(25, w.terrainSample(25, 25).height + 17, 25);
    w.controls.target.set(50, w.terrainSample(50, -260).height + 6, -260);
    w.controls.update();
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `evidence/meadow-distance-${backend}.png` });
  // Sky only: this uses camera rotation, which must not rebuild the density volume.
  await page.evaluate(() => {
    const w = worldTest,
      p = w.camera.position;
    w.controls.target.set(p.x - 70, p.y + 70, p.z - 100);
    w.controls.update();
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `evidence/clouds-${backend}.png` });
  report.after = await page.evaluate(() => ({
    clouds: worldDiagnostics.clouds,
    frame: worldDiagnostics.frameTiming,
    errors: worldDiagnostics.errors,
  }));
  assert.equal(
    report.after.clouds.densityBakes,
    report.clouds.densityBakes,
    "rotating or moving must not regenerate cloud density",
  );
  report.solar = [];
  for (const hour of [0, 12]) {
    await page.locator("#timeOfDay").evaluate((e, h) => {
      e.value = h;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, hour);
    await page.waitForTimeout(350);
    const state = await page.evaluate(() => ({
      hour: worldDiagnostics.sun.hour,
      daylight: worldTest.lightUniforms.daylight.value,
      intensity: worldTest.sun.intensity,
      sun: worldDiagnostics.sun.direction,
      light: worldTest.lightUniforms.liveSunDirection.value.toArray(),
    }));
    assert.equal(state.daylight, hour === 0 ? 0 : 1);
    assert.deepEqual(state.sun, state.light);
    report.solar.push(state);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `evidence/meadow-clouds-${backend}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
