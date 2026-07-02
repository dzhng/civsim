// Slice-11 evidence shots: /renderer/photoreal-battle on the HARDWARE adapter
// (headless Chrome channel) at fixed time, per query framing. Usage:
//   node shots-slice11/shot.mjs <name> "<query>" [waitMs]
import { chromium } from "playwright";

const [, , name, query, waitMsArg] = process.argv;
const target = process.env.VERIFY_URL ?? "http://localhost:5199";
const waitMs = Number(waitMsArg ?? 1500);

const browser = await chromium.launch({
  channel: process.env.VERIFY_BROWSER_CHANNEL ?? "chrome",
  headless: true,
  args: ["--headless=new"],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: Number(process.env.SHOT_DSF ?? 1),
});
page.on("pageerror", (err) => console.error("pageerror:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("console:", msg.text());
});
await page.goto(`${target}/renderer/photoreal-battle?${query}`);
await page.waitForFunction(
  () => window.__rendererLabReady === true && window.__rendererLabStats?.ok === true,
  undefined,
  { timeout: 120000 },
);
await page.waitForTimeout(waitMs);
const stats = await page.evaluate(() => {
  const s = window.__rendererLabStats;
  return {
    environment: s.environment,
    shadows: s.stats?.renderStats?.shadows,
    device: s.stats?.device,
    gpuTimeMs: s.stats?.gpuTimeMs,
    drawCalls: s.stats?.drawCalls,
    soldiers: s.stats?.renderStats?.soldiers,
  };
});
console.log(JSON.stringify(stats, null, 2));
const clip = await page.locator("#renderer-canvas").boundingBox();
await page.screenshot({ clip, path: `shots-slice11/${name}.png`, timeout: 60000 });
await browser.close();
console.log(`saved shots-slice11/${name}.png`);
