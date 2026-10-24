import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const backend = process.argv[2] || "webgpu";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
  errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log(e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text());
    console.log(m.text());
  }
});
try {
  await page.goto(
    "http://127.0.0.1:5173/scripts/cloud-fixture.html?backend=" + backend,
  );
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await page.screenshot({ path: `evidence/cloud-isolated-${backend}.png` });
  const volume = await page.evaluate(() => {
    const data = [...cloudTest.records.values()][0].data,
      means = [],
      diff = [];
    const sample = (x, y, z) =>
      data[((Math.floor(y / 8) * 256 + z) * 2048 + (y % 8) * 256 + x) * 4];
    for (let y = 0; y < 48; y++) {
      let sum = 0,
        d = 0;
      for (let z = 0; z < 256; z += 4)
        for (let x = 0; x < 256; x += 4) {
          sum += sample(x, y, z);
          if (y) d += Math.abs(sample(x, y, z) - sample(x, y - 1, z));
        }
      means.push(sum / 4096);
      if (y) diff.push(d / 4096);
    }
    return { means, diff };
  });
  const internal = volume.diff.filter((_, i) => (i + 1) % 8 !== 0),
    boundary = volume.diff.filter((_, i) => (i + 1) % 8 === 0);
  assert.ok(
    Math.max(...boundary) < Math.max(...internal) * 1.8,
    "packed volume must stay continuous across slice-row boundaries",
  );
  const sample = () =>
    page.evaluate(async () => {
      const w = cloudTest,
        t = new w.T.RenderTarget(64, 64, { depthBuffer: false });
      w.renderer.setRenderTarget(t);
      w.renderer.render(w.scene, w.camera);
      w.renderer.setRenderTarget(null);
      const bytes = new Uint8Array(64 * 64 * 4);
      await w.readPixels(w.renderer, t, 0, 0, 64, 64, bytes);
      t.dispose();
      return [...bytes];
    });
  const before = await sample();
  await page.waitForTimeout(4200);
  const after = await sample();
  let maxDifference = 0;
  for (let i = 0; i < before.length; i++)
    maxDifference = Math.max(maxDifference, Math.abs(before[i] - after[i]));
  assert.ok(
    maxDifference <= 1,
    "incremental cloud slices must reproduce the full bake",
  );
  await writeFile(
    `evidence/cloud-volume-${backend}.json`,
    JSON.stringify({ volume, maxDifference, errors }, null, 2),
  );
  const data = await page.evaluate(() => {
    const r = [...cloudTest.records.values()][0].data;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d"),
      image = ctx.createImageData(1024, 512);
    const sample = (x, y, z) =>
      r[((Math.floor(y / 8) * 256 + z) * 2048 + (y % 8) * 256 + x) * 4];
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 1024; x++) {
        let d;
        if (y < 256) d = sample(x % 256, 6 + Math.floor(x / 256) * 8, y);
        else
          d = sample(
            x % 256,
            Math.floor(((y - 256) / 256) * 48),
            40 + Math.floor(x / 256) * 50,
          );
        const i = (y * 1024 + x) * 4;
        image.data.set([d, d, d, 255], i);
      }
    ctx.putImageData(image, 0, 0);
    return c.toDataURL();
  });
  await writeFile(
    "evidence/cloud-density-sections.png",
    Buffer.from(data.split(",")[1], "base64"),
  );
  assert.deepEqual(errors, []);
  console.log("Cloud fixture passed", backend);
} finally {
  await browser.close();
}
