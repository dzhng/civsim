// Bake-off probe shot/stat harness. Usage:
//   node shot-probe.mjs <mode:swiftshader|hardware> <outDir> <name=url> [name=url...]
// Loads each URL, waits for __rendererLabReady, optionally settles (SETTLE_MS),
// screenshots, and dumps __probeStats (or __rendererLabStats) JSON.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from './renderer-probe-lib.mjs';

const [mode, outDir, ...pairs] = process.argv.slice(2);
const settle = Number(process.env.SETTLE_MS ?? 1200);
mkdirSync(outDir, { recursive: true });

const launch = {
  args: [
    ...(mode === 'hardware' ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS),
    // UNCAP=1: remove the vsync ceiling so rAF deltas measure real frame cost
    // (a 120 Hz display pins every sub-8.3ms renderer to identical medians).
    ...(process.env.UNCAP === '1' ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
  ],
};
if (mode === 'hardware') {
  launch.headless = false;
  launch.channel = 'chrome';
}
const browser = await chromium.launch(launch);
const results = {};
for (const pair of pairs) {
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq);
  const url = pair.slice(eq + 1);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error(`[${name}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${name}] console: ${m.text()}`); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__rendererLabReady === true, null, { timeout: 90000 });
    await page.waitForTimeout(settle);
    const stats = await page.evaluate(() => window.__probeStats ?? window.__rendererLabStats ?? null);
    await page.screenshot({ path: `${outDir}/${name}.png` });
    results[name] = stats;
    console.log(`OK ${name}`);
  } catch (err) {
    results[name] = { error: String(err) };
    try { await page.screenshot({ path: `${outDir}/${name}-error.png` }); } catch {}
    console.log(`FAIL ${name}: ${err}`);
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
