// Animation review: films each soldier animation (walk, run, attack, hit, die)
// as a looping GIF so the motion can be eyeballed frame by frame — the manual
// check the user asked for. Boots the WebGPU skinned-soldier lab route (one
// soldier on a flat field, no sim) and samples deterministic phases, then
// encodes the frames with the dependency-free _gif.mjs encoder into
// web/shots/models/shared/soldiers/anim/<id>-<class>-<anim>.gif.
//
//   node shots/models/scripts/soldier-animation.mjs                 # the representative class set, all anims
//   ONLY=3 node shots/models/scripts/soldier-animation.mjs          # just the phalanx
//   ANGLE=front node shots/models/scripts/soldier-animation.mjs     # face the camera (default: 3/4 hero view)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encodeGif, pngToRGBA } from '../../_gif.mjs';
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from '../../../renderer-probe-lib.mjs';
import { PNG } from 'pngjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const LAB_PANEL_W = 360;
const LAB_HEADER_H = 42;
const MODEL_CAMERA_X = -2.1;
const TW = 360, TH = 360, PITCH = 0.95;
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(here, '..', '..', '..');
const OUT = path.join(here, '..', 'shared', 'soldiers', 'anim');
fs.mkdirSync(OUT, { recursive: true });

const NAMES = ['heavy-sword', 'light-spear', 'longsword', 'phalanx', 'archers', 'skirmishers',
  'shock-cav', 'horse-archers', 'artillery', 'peasant', 'light-sword', 'heavy-spear',
  'medium-infantry', 'medium-spear', 'shock-cav-sidearm'];
const CLASS_H = [1.75, 2.05, 1.85, 3.5, 1.75, 1.6, 3.4, 2.6, 1.7, 1.55, 1.75, 2.05, 1.9, 2.05, 3.1];
const REVIEW_H = [...CLASS_H];
REVIEW_H[3] = 2.55;
REVIEW_H[6] = 3.15;
REVIEW_H[7] = 3.0;
const FRONT = -Math.PI / 2;
const facing = process.env.ANGLE === 'front' ? FRONT : FRONT + Math.PI / 5;

// Each animation is a list of {frame, dt} steps (sim-frame value + clock advance
// in seconds) and a GIF delay. Walk/run/hit toggle discrete poses; attack uses
// a review-only windup frame (11) before the real strike frame (3); die holds
// the fallen frame and lets the renderer's death blend ease the collapse.
const STAND = { frame: 0, dt: 0.04 };
const ANIMS = {
  walk: { delay: 24, steps: [{ frame: 1, dt: 0.25 }, { frame: 2, dt: 0.25 }] },
  run: { delay: 14, steps: [{ frame: 8, dt: 0.14 }, { frame: 9, dt: 0.14 }] },
  attack: { delay: 12, steps: [STAND, { frame: 11, dt: 0.12 }, { frame: 3, dt: 0.10 }, { frame: 3, dt: 0.08 }, STAND] },
  hit: { delay: 16, steps: [STAND, { frame: 10, dt: 0.1 }, { frame: 10, dt: 0.1 }, STAND, STAND] },
  die: {
    delay: 9,
    steps: [STAND, STAND, ...Array.from({ length: 14 }, () => ({ frame: 4, dt: 0.05 }))],
    once: true, // not a loop: a man dies once
  },
};

const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : [0, 3, 4, 6];

const gpuArgs = process.env.VERIFY_GPU === '1'
  ? (process.env.VERIFY_GPU_ADAPTER === 'hardware' ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS)
  : [];
const browser = await chromium.launch({ args: gpuArgs });
const page = await browser.newPage({ viewport: { width: TW + LAB_PANEL_W, height: TH + LAB_HEADER_H } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

for (const cls of only) {
  const h = REVIEW_H[cls] ?? CLASS_H[cls] ?? 1.8;
  const zoom = Math.max(64, Math.min(136, (0.68 * TH) / h));
  const isMountedReview = cls === 6 || cls === 7;
  const camX = isMountedReview ? -1.6 : MODEL_CAMERA_X;
  const camY = isMountedReview ? 3.2 : 1.25 * h;
  for (const [name, anim] of Object.entries(ANIMS)) {
    const frames = [];
    // Two cycles for the looping anims so the GIF has a natural rhythm.
    const reps = anim.once ? 1 : 2;
    let phase = 0;
    for (let r = 0; r < reps; r++) {
      for (const s of anim.steps) {
        const poseH = name === 'die' ? h * 1.55 : h;
        const poseZoom = Math.max(64, Math.min(136, (0.68 * TH) / poseH));
        const poseCamY = name === 'die' ? 0.96 * h : camY;
        phase = (phase + s.dt) % 1;
        frames.push(pngToRGBA(await captureSoldier(page, {
          classId: cls,
          clip: clipForAnimation(name),
          phase,
          frame: s.frame,
          facing,
          zoom: poseZoom,
          camX,
          camY: isMountedReview ? Math.min(camY, poseCamY) : poseCamY,
          pitch: PITCH,
          yaw: -0.18,
          size: cls === 6 ? 1.05 : 1.15,
        })));
      }
    }
    const gif = encodeGif(frames, TW, TH, anim.delay, { loop: !anim.once });
    const id = String(cls).padStart(2, '0');
    const file = path.join(OUT, `${id}-${NAMES[cls]}-${name}.gif`);
    fs.writeFileSync(file, gif);
    console.log('wrote', path.relative(WEB_ROOT, file), `${frames.length}f ${(gif.length / 1024).toFixed(0)}kb`);
  }
}
if (errs.length) console.log('page errors:', errs.slice(0, 6));
await browser.close();

function clipForAnimation(name) {
  if (name === 'attack') return 'attack_a';
  if (name === 'hit') return 'hit_a';
  if (name === 'die') return 'death_a';
  if (name === 'run') return 'run';
  return 'march';
}

async function captureSoldier(page, opts) {
  const url = new URL(`${TARGET}/renderer/skinned-soldier`);
  url.searchParams.set('class', String(opts.classId));
  url.searchParams.set('clip', opts.clip);
  url.searchParams.set('phase', String(opts.phase));
  url.searchParams.set('frame', String(opts.frame));
  url.searchParams.set('facing', String(opts.facing));
  url.searchParams.set('x', String(opts.camX));
  url.searchParams.set('y', String(opts.camY));
  url.searchParams.set('zoom', String(opts.zoom));
  url.searchParams.set('pitch', String(opts.pitch));
  url.searchParams.set('yaw', String(opts.yaw));
  url.searchParams.set('size', String(opts.size));
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    ({ classId, clip, phase }) => window.__rendererLabReady === true
      && window.__rendererLabStats?.stats?.classId === classId
      && window.__rendererLabStats?.stats?.clip === clip
      && Math.abs((window.__rendererLabStats?.stats?.phase ?? -999) - phase) < 0.0001,
    { classId: opts.classId, clip: opts.clip, phase: opts.phase },
    { timeout: 18000 },
  );
  await page.waitForTimeout(80);
  return cropPng(await canvasScreenshot(page), TW, TH);
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

function cropPng(buf, width, height, x = 0, y = 0) {
  const img = PNG.sync.read(buf);
  const sx = Math.max(0, Math.min(img.width - width, x));
  const sy = Math.max(0, Math.min(img.height - height, y));
  const out = new PNG({ width, height });
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      const si = ((sy + yy) * img.width + (sx + xx)) * 4;
      const di = (yy * width + xx) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}
