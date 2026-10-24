import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const backend = process.argv[2] || "webgpu";
const evidencePrefix = process.argv[3] || "worker-streaming";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text());
    console.log(m.text());
  }
});
try {
  await page.goto("http://127.0.0.1:5173/?backend=" + backend);
  let checking = false;
  const progress = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      console.log(
        "initialization",
        await page.evaluate(() => ({
          text: document.getElementById("status")?.textContent,
          ready: worldDiagnostics?.ready,
          renderer: worldDiagnostics?.preparation?.renderer,
          uploads: worldDiagnostics?.preparation?.uploads,
          errors: worldDiagnostics?.errors,
        })),
      );
    } catch {
    } finally {
      checking = false;
    }
  }, 20000);
  progress.unref();
  await page.waitForFunction(
    () => window.worldDiagnostics?.ready && !worldDiagnostics.baking,
    null,
    { timeout: 240000 },
  );
  console.log("ready", backend);
  clearInterval(progress);
  await page.waitForTimeout(1500);
  const report = await page.evaluate(async () => {
    const w = worldTest,
      d = worldDiagnostics,
      origin = w.camera.position.clone();
    const update = w.controls.update,
      originalTarget = w.controls.target.clone();
    w.controls.update = () => {};
    const nodes = w.renderer._nodes,
      get = nodes.getForRender,
      slowBuilds = [];
    nodes.getForRender = function (object, async) {
      const started = performance.now(),
        result = get.call(this, object, async),
        ms = performance.now() - started;
      if (!async && ms > 8)
        slowBuilds.push({
          ms,
          material: object.material.name,
          shadow: !!object.material.isShadowPassMaterial,
          grass: !!object.object.userData.grassCard,
          terrain: !!object.object.userData.terrainTile,
        });
      return result;
    };
    const stats = () => structuredClone(d.preparation);
    const summarize = (samples) => {
      const s = samples.slice().sort((a, b) => a - b);
      return {
        frames: s.length,
        p50: s[Math.floor(s.length * 0.5)],
        p95: s[Math.floor(s.length * 0.95)],
        max: s.at(-1),
        over50ms: s.filter((t) => t > 50).length,
      };
    };
    const before = stats(),
      sweeps = [];
    try {
      for (let pass = 0; pass < 2; pass++) {
        const samples = [];
        let last = 0;
        await new Promise((resolve) => {
          let i = 0;
          function turn(now) {
            if (last) samples.push(now - last);
            last = now;
            w.camera.position.copy(origin);
            w.camera.rotation.set(0, (i * Math.PI * 2) / 180, 0);
            w.camera.updateMatrixWorld();
            if (++i <= 180) requestAnimationFrame(turn);
            else resolve();
          }
          requestAnimationFrame(turn);
        });
        sweeps.push(summarize(samples));
      }
      const afterRotation = stats();
      w.camera.position.x += 140;
      const oldOrigin = w.lightUniforms.volumeMin.value.toArray();
      const started = performance.now(),
        job = w.rebake(),
        samples = [];
      let running = true,
        last = 0;
      function frame(t) {
        if (!running) return;
        if (last) samples.push(t - last);
        last = t;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const retainedOldVolume = w.lightUniforms.volumeMin.value
        .toArray()
        .every((v, i) => v === oldOrigin[i]);
      await job;
      running = false;
      const rebuild = {
        ...summarize(samples),
        durationMs: performance.now() - started,
        retainedOldVolume,
        newOrigin: w.lightUniforms.volumeMin.value.toArray(),
      };
      return {
        before,
        afterRotation,
        afterRebuild: stats(),
        sweeps,
        rebuild,
        slowBuilds,
        errors: d.errors,
      };
    } finally {
      nodes.getForRender = get;
      w.controls.update = update;
      w.camera.position.copy(origin);
      w.controls.target.copy(originalTarget);
      w.controls.update();
    }
  });
  assert.equal(
    report.before.voxel.completed,
    report.afterRotation.voxel.completed,
    "turning in place must not rebuild voxel geometry",
  );
  assert.ok(
    report.before.voxel.completed > 0,
    "cold startup must use the voxel worker",
  );
  assert.ok(
    report.before.merged.completed > 0,
    "cold startup must use the mesh merge worker",
  );
  assert.ok(
    report.afterRebuild.voxel.completed > report.afterRotation.voxel.completed,
    "new area must use the voxel worker",
  );
  assert.ok(report.rebuild.frames > 5, "streaming must keep presenting frames");
  assert.equal(
    report.rebuild.retainedOldVolume,
    true,
    "old lighting must remain valid while replacement prepares",
  );
  const uploads = report.afterRebuild.uploads;
  assert.equal(
    report.before.uploads.uploadedBytes,
    report.afterRotation.uploads.uploadedBytes,
    "rotation must not submit missing resource pages",
  );
  assert.ok(
    uploads.uploadedBytes > report.afterRotation.uploads.uploadedBytes,
    "new area must use the page queue",
  );
  assert.ok(uploads.maxPageBytes <= uploads.pageBytes);
  assert.ok(uploads.maxInteractiveFrameBytes <= uploads.frameBytes);
  assert.ok(
    uploads.peakInteractiveInFlightBytes <=
      uploads.frameBytes * uploads.framesInFlight,
  );
  assert.equal(
    uploads.unpagedTextureBytes,
    report.afterRotation.uploads.unpagedTextureBytes,
    "streamed textures must not bypass paging",
  );
  assert.equal(
    uploads.unpagedBufferBytes,
    report.afterRotation.uploads.unpagedBufferBytes,
    "streamed LOD geometry must not bypass paging",
  );
  assert.deepEqual(uploads.errors, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(report.errors, []);
  await page.screenshot({ path: `evidence/${evidencePrefix}-${backend}.png` });
  await writeFile(
    `evidence/${evidencePrefix}-${backend}.json`,
    JSON.stringify({ report, errors }, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
