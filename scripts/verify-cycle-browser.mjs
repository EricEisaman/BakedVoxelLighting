import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text());
    console.log(m.text().slice(0, 1500));
  }
});
try {
  await page.goto(
    "http://127.0.0.1:5173/?backend=" + (process.argv[2] || "webgpu"),
  );
  await page.waitForFunction(
    () =>
      (worldDiagnostics?.ready && !worldDiagnostics.baking) ||
      worldDiagnostics?.errors.length,
    null,
    { timeout: 240000 },
  );
  assert.deepEqual(errors, []);
  await page.locator("#dayCycle").uncheck();
  const areaReuse = await page.evaluate(async () => {
    const key = worldTest.lightingState.geometryKey;
    worldTest.camera.position.x += 1;
    worldTest.controls.target.x += 1;
    await worldTest.rebake();
    return {
      before: key,
      after: worldTest.lightingState.geometryKey,
      grass: worldDiagnostics.grassBake,
    };
  });
  assert.equal(
    areaReuse.before,
    areaReuse.after,
    "moving inside a bake cell must retain its occupancy key",
  );

  await page.evaluate(async () => {
    const target = worldTest.getCloudTarget(),
      w = target.width,
      h = target.height;
    const bytes = await worldTest.renderer.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      w,
      h,
    );
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d"),
      im = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const b = bytes[i * 4],
        e = (b >> 10) & 31,
        m = b & 1023;
      const v = e
        ? Math.pow(2, e - 15) * (1 + m / 1024)
        : (Math.pow(2, -14) * m) / 1024;
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v * 255;
      im.data[i * 4 + 3] = 255;
    }
    let rowDifference = 0;
    for (let x = 0; x < w; x++)
      rowDifference += Math.abs(
        im.data[x * 4] - im.data[(Math.floor(h / 2) * w + x) * 4],
      );
    if (rowDifference < 1000)
      throw Error("Cloud field lost its second spatial dimension");
    ctx.putImageData(im, 0, 0);
    window.cloudImage = canvas.toDataURL();
  });
  await writeFile(
    "evidence/cloud-field.png",
    Buffer.from(
      (await page.evaluate(() => cloudImage)).split(",")[1],
      "base64",
    ),
  );
  const report = {};
  for (const hour of [8, 12, 18, 0]) {
    await page.locator("#timeOfDay").evaluate((e, h) => {
      e.value = h;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, hour);
    await page.waitForTimeout(2500);
    report[hour] = await page.evaluate(() => ({
      sun: worldDiagnostics.sun,
      index: worldDiagnostics.areaIndexes,
      grass: worldDiagnostics.grassLevels,
    }));
    await page.screenshot({ path: `evidence/cycle-${hour}.png` });
  }
  assert.equal(report[0].sun.daylight, 0);
  assert.equal(report[12].sun.daylight, 1);
  await page.locator("#timeOfDay").evaluate((e) => {
    e.value = 10;
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    const { camera, controls } = worldTest;
    controls.enableDamping = false;
    const p = camera.position.clone();
    const d = worldDiagnostics.sun.direction;
    controls.target
      .copy(p)
      .add({ x: d[0] * 100, y: d[1] * 100, z: d[2] * 100 });
    controls.update();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "evidence/cycle-sun-clouds.png" });
  await page.locator("#dayCycle").check();
  const start = await page.evaluate(() => worldDiagnostics.sun.hour);
  await page.waitForTimeout(3000);
  const end = await page.evaluate(() => worldDiagnostics.sun.hour);
  assert.ok(end - start > 0.04 && end - start < 0.065);
  await writeFile(
    "evidence/cycle-check.json",
    JSON.stringify({ report, elapsedHours: end - start, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log("Cycle, indexed scene, and sun/cloud screenshots passed");
} finally {
  await browser.close();
}
