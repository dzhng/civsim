import { createServer } from "node:http";
import { once } from "node:events";
import { PNG } from "pngjs";
import { chromium } from "playwright";
import { GPU_FLAGS, GPU_PROBE_HTML, gpuPixelLooksCleared } from "./renderer-probe-lib.mjs";

function serveProbe() {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(GPU_PROBE_HTML);
  });
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => server);
}

function pixelAt(png, x, y) {
  const o = (y * png.width + x) * 4;
  return [png.data[o], png.data[o + 1], png.data[o + 2], png.data[o + 3]];
}

const server = await serveProbe();
const { port } = server.address();
const browser = await chromium.launch({ args: GPU_FLAGS });
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__gpuProbe !== undefined, undefined, { timeout: 10000 });
  await page.waitForTimeout(120);
  const probe = await page.evaluate(() => window.__gpuProbe);
  const shot = await page.screenshot();
  const png = PNG.sync.read(shot);
  const center = pixelAt(png, 128, 128);
  const clearVisible = gpuPixelLooksCleared(center);
  const ok =
    probe.hasNavigatorGpu && probe.adapter && probe.device && probe.rendered && clearVisible;
  console.log(JSON.stringify({ ok, probe, centerPixel: center, flags: GPU_FLAGS }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
