import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});
const results = [];
try {
  for (const shared of [true, false]) {
    const page = await browser.newPage();
    await page.goto(
      `${process.env.SPIKE_URL ?? "http://127.0.0.1:5197"}/repro.html?shared=${shared ? 1 : 0}`,
    );
    await page.waitForFunction(() => window.repro || window.spikeError, null, { timeout: 30000 });
    const result = await page.evaluate(
      () => window.repro ?? { unexpectedError: window.spikeError },
    );
    results.push(result);
    assert.ok(!result.unexpectedError, JSON.stringify(result));
    if (shared) assert.match(result.validationError ?? "", /does not match layout/);
    else assert.equal(result.validationError, null);
    await page.close();
  }
  console.log(
    "REPRODUCED vgpu 0.4.1 shared-uniform draw/compute bind-group collision; separate-uniform control passes.",
  );
} finally {
  await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("./artifacts/vgpu-repro.json", import.meta.url),
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser.close();
}
