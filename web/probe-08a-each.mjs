import { chromium } from 'playwright';
import { GPU_HARDWARE_FLAGS } from './renderer-probe-lib.mjs';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ args: GPU_HARDWARE_FLAGS, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5173/renderer/photoreal-battle?t=0&zoom=6&cx=0&cy=-650');
await page.waitForFunction(() => window.__rendererLabReady === true, undefined, { timeout: 120000 });
await page.waitForTimeout(500);
const count = await page.evaluate(() => {
  const scene = window.__photorealBattleWorld.world.scene;
  window.__objs = [];
  scene.traverse((o) => { if (o.isMesh || o.isLineSegments) window.__objs.push(o); });
  window.__objs.forEach((o, i) => { o.userData.__origVisible = o.visible; });
  return window.__objs.length;
});
console.log('objects:', count);
const clip = await page.locator('#renderer-canvas').boundingBox();
for (let i = 0; i < count; i++) {
  const desc = await page.evaluate((i) => {
    const objs = window.__objs;
    objs.forEach((o, j) => { o.visible = j === i && o.userData.__origVisible; });
    const o = objs[i];
    return `${i} ro=${o.renderOrder} inst=${o.geometry.instanceCount ?? '-'} idx=${o.geometry.index?.count ?? '-'} vis=${o.userData.__origVisible} attrs=${Object.keys(o.geometry.attributes).join('/')}`;
  }, i);
  await page.waitForTimeout(120);
  const buf = await page.screenshot({ clip });
  writeFileSync(`/tmp/claude-501/-Users-david-dev-game/4c479159-51b6-4ca0-a3c5-187e41374d07/scratchpad/each/obj-${String(i).padStart(2, '0')}.png`, buf);
  console.log(desc);
}
await browser.close();
