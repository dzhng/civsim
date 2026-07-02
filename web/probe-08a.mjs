import { chromium } from 'playwright';
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from '/Users/david/dev/game/.claude/worktrees/3d-perspective-renderer/web/renderer-probe-lib.mjs';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/renderer/photoreal-battle?t=0';
const shot = process.argv[3] ?? '/tmp/claude-501/-Users-david-dev-game/4c479159-51b6-4ca0-a3c5-187e41374d07/scratchpad/photoreal-battle.png';
const hardware = process.env.ADAPTER !== 'sw';
const browser = await chromium.launch({
  args: hardware ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS,
  channel: hardware ? 'chrome' : undefined,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 600)); });
await page.goto(url);
try {
  await page.waitForFunction(() => window.__rendererLabReady === true && window.__rendererLabStats?.ok === true, undefined, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => window.__rendererLabStats);
  console.log(JSON.stringify(stats, null, 2).slice(0, 4500));
} catch (e) {
  console.log('WAIT FAILED: ' + e.message);
}
const clip = await page.locator('#renderer-canvas').boundingBox().catch(() => null);
const buf = await page.screenshot(clip ? { clip, timeout: 120000 } : { timeout: 120000 });
writeFileSync(shot, buf);
console.log('shot:', shot);
console.log('errors (first 15):');
for (const e of errors.slice(0, 15)) console.log('  ', e);
await browser.close();
