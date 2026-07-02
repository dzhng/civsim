// Side-by-side capture: production battle (?map=A) vs /renderer/photoreal-battle
// at matched __cam framing. Writes prod-<stop>.png + photo-<stop>.png.
import { chromium } from 'playwright';
import { GPU_HARDWARE_FLAGS } from './renderer-probe-lib.mjs';
import { writeFileSync } from 'node:fs';

const OUT = '/tmp/claude-501/-Users-david-dev-game/4c479159-51b6-4ca0-a3c5-187e41374d07/scratchpad/cmp08a';
const STOPS = [
  { name: 'mid', zoom: 4.5, center: [0, -650], yaw: 0 },
  { name: 'vista', zoom: 9.5, center: [0, -650], yaw: 0 },
  { name: 'sea', zoom: 6.0, center: [600, -650], yaw: Math.PI },
  { name: 'top', zoom: 1.5, center: [0, -650], yaw: 0 },
];
const browser = await chromium.launch({ args: GPU_HARDWARE_FLAGS, channel: 'chrome' });

async function captureStops(page, selector, prefix) {
  for (const stop of STOPS) {
    await page.evaluate(({ zoom, center, yaw }) => {
      const cam = window.__cam;
      cam.yaw = yaw;
      cam.pitchBias = 0;
      cam.zoom = zoom;
      cam.clampView?.();
      cam.setViewCenter(center[0], center[1]);
    }, stop);
    await page.waitForTimeout(400);
    const clip = await page.locator(selector).boundingBox();
    writeFileSync(`${OUT}/${prefix}-${stop.name}.png`, await page.screenshot({ clip }));
    const view = await page.evaluate(() => ({ center: window.__cam.viewCenter(), zoom: window.__cam.zoom }));
    console.log(prefix, stop.name, JSON.stringify(view));
  }
}

// --- production -------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('prod pageerror:', e.message.slice(0, 200)));
  await page.goto('http://localhost:5173/?map=A&ai=off');
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return window.__ready === true && stats?.renderer === 'gpu' && stats.renderStats?.ready === true;
  }, undefined, { timeout: 90000 });
  await page.addStyleTag({ content: '#gameover, #hud, #buttons, #pausemenu, #banner, #selbox, #minimap, #unitlabels, #unitcards, #toolbar { display: none !important; }' });
  await page.keyboard.press('p');
  await page.waitForTimeout(500);
  await captureStops(page, '#battlefield', 'prod');
  await page.close();
}
// --- photoreal --------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('photo pageerror:', e.message.slice(0, 200)));
  await page.goto('http://localhost:5173/renderer/photoreal-battle?map=A&t=0&ref=1');
  await page.waitForFunction(() => window.__rendererLabReady === true, undefined, { timeout: 120000 });
  await page.waitForTimeout(500);
  await captureStops(page, '#renderer-canvas', 'photo');
  await page.close();
}
await browser.close();
