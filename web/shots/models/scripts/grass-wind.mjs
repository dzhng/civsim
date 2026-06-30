// Grass wind review: films the BattleGrassPass flat-field workbench and a real
// terrain field at fixed shader phases, then writes looping GIFs for eyeballing
// blade rhythm and map-scale coherence.
//
//   VERIFY_GPU=1 node shots/models/scripts/grass-wind.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import { encodeGif, pngToRGBA } from '../../_gif.mjs';
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from '../../../renderer-probe-lib.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const FLAT_W = 520;
const FLAT_H = 250;
const FLAT_VIEW_H = 320;
const TERRAIN_W = 640;
const TERRAIN_H = 320;
const TERRAIN_VIEW_H = 420;
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(here, '..', '..', '..');
const OUT = path.join(here, '..', 'shared', 'grass', 'anim');
fs.mkdirSync(OUT, { recursive: true });

const phases = Array.from({ length: 14 }, (_, i) => i * 0.46);
const gpuArgs = process.env.VERIFY_GPU === '1'
  ? (process.env.VERIFY_GPU_ADAPTER === 'hardware' ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS)
  : [];
const launchOptions = { args: gpuArgs };
if (process.env.VERIFY_BROWSER_CHANNEL) launchOptions.channel = process.env.VERIFY_BROWSER_CHANNEL;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: FLAT_W, height: FLAT_VIEW_H } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const flatFrames = [];
for (const phase of phases) {
  flatFrames.push(pngToRGBA(await captureGrass(page, phase)));
}
const flatGif = encodeGif(flatFrames, FLAT_W, FLAT_H, 7, { loop: true });
const flatFile = path.join(OUT, 'flat-field.gif');
fs.writeFileSync(flatFile, flatGif);
console.log('wrote', path.relative(WEB_ROOT, flatFile), `${flatFrames.length}f ${(flatGif.length / 1024).toFixed(0)}kb`);

await page.setViewportSize({ width: TERRAIN_W, height: TERRAIN_VIEW_H });
const terrainFrames = [];
for (const phase of phases) {
  terrainFrames.push(pngToRGBA(await captureTerrainGrass(page, phase)));
}
const terrainGif = encodeGif(terrainFrames, TERRAIN_W, TERRAIN_H, 7, { loop: true });
const terrainFile = path.join(OUT, 'terrain-field.gif');
fs.writeFileSync(terrainFile, terrainGif);
console.log('wrote', path.relative(WEB_ROOT, terrainFile), `${terrainFrames.length}f ${(terrainGif.length / 1024).toFixed(0)}kb`);
if (errs.length) console.log('page errors:', errs.slice(0, 6));
await browser.close();

async function captureGrass(page, phase) {
  const url = new URL(`${TARGET}/renderer/battle-grass`);
  url.searchParams.set('gate', 'flat-field');
  url.searchParams.set('phase', String(phase));
  url.searchParams.set('density', '0.72');
  url.searchParams.set('maxTufts', '420');
  url.searchParams.set('windStrength', '0.15');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (p) => window.__rendererLabReady === true
      && window.__rendererLabStats?.stats?.route === 'battle-grass'
      && Math.abs((window.__rendererLabStats?.stats?.windPhase ?? -999) - p) < 0.0001,
    phase,
    { timeout: 18000 },
  );
  await page.waitForTimeout(60);
  return cropPng(await canvasScreenshot(page), FLAT_W, FLAT_H);
}

async function captureTerrainGrass(page, phase) {
  const url = new URL(`${TARGET}/renderer/battle-terrain-3d`);
  url.searchParams.set('gate', 'river-and-crags');
  url.searchParams.set('grassPhase', String(phase));
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (p) => window.__rendererLabReady === true
      && window.__rendererLabStats?.stats?.route === 'battle-terrain-3d'
      && Math.abs((window.__rendererLabStats?.stats?.grass?.windPhase ?? -999) - p) < 0.0001,
    phase,
    { timeout: 18000 },
  );
  await page.waitForTimeout(60);
  return cropPng(await canvasScreenshot(page), TERRAIN_W, TERRAIN_H);
}

async function canvasScreenshot(page) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForSelector('#renderer-canvas', { state: 'visible', timeout: 8000 });
    try {
      return await page.locator('#renderer-canvas').screenshot();
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(120);
    }
  }
  throw lastError;
}

function cropPng(buf, width, height) {
  const img = PNG.sync.read(buf);
  const out = new PNG({ width, height });
  const sx = Math.max(0, Math.floor((img.width - width) * 0.5));
  const sy = Math.max(0, Math.floor((img.height - height) * 0.5));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((y + sy) * img.width + (x + sx)) * 4;
      const dst = (y * width + x) * 4;
      out.data[dst] = img.data[src];
      out.data[dst + 1] = img.data[src + 1];
      out.data[dst + 2] = img.data[src + 2];
      out.data[dst + 3] = img.data[src + 3];
    }
  }
  return PNG.sync.write(out);
}
