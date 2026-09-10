import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});
const report = {
  capturedAt: new Date().toISOString(),
  workload: "30000 instanced shadow quads + simple occluder/ground fixture; raw shell, one sample",
  runs: [],
};
try {
  const backends = ["raw", "typegpu", "vgpu"];
  for (let round = 0; round < 3; round++)
    for (let offset = 0; offset < 3; offset++) {
      const backend = backends[(round + offset) % 3];
      const page = await browser.newPage({
        viewport: { width: 980, height: 1050 },
        deviceScaleFactor: 1,
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (["error", "warning"].includes(m.type())) errors.push(m.text());
      });
      await page.goto(
        `${process.env.SPIKE_URL ?? "http://127.0.0.1:5197"}/?backend=${backend}&mode=raw-msaa1&count=30000`,
      );
      await page.waitForFunction(() => window.spike || window.spikeError, null, { timeout: 30000 });
      assert.ok(
        !(await page.evaluate(() => window.spikeError)),
        await page.evaluate(() => window.spikeError),
      );
      const device = await page.evaluate(() => window.spike.stats().device);
      assert.ok(
        !/swiftshader|software|llvmpipe|unknown/i.test(device),
        "Requires an identified hardware GPU",
      );
      const steady = await page.evaluate(() => window.spike.benchmark(90, false));
      const changingCount = await page.evaluate(() => window.spike.benchmark(90, true));
      const disposal = await page.evaluate(() => window.spike.dispose());
      assert.deepEqual(errors, []);
      assert.deepEqual(disposal.failures, []);
      report.runs.push({ round, backend, device, steady, changingCount });
      console.log(
        `${round + 1}/${backend} CPU median steady=${steady.cpuSubmitMs.median.toFixed(3)} changing=${changingCount.cpuSubmitMs.median.toFixed(3)} GPU=${steady.gpuFrameMs.median?.toFixed(3)}`,
      );
      await page.close();
    }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = String(error.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("./artifacts/benchmark.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
