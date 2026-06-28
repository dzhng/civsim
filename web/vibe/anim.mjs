// Animation review: films each soldier animation (walk, run, attack, hit, die)
// as a looping GIF so the motion can be eyeballed frame by frame — the manual
// check the user asked for. Boots the WebGPU skinned-soldier lab route (one
// soldier on a flat field, no sim) and samples deterministic phases, then
// encodes the frames with the dependency-free _gif.mjs encoder into
// web/shots/models/shared/anim/<id>-<class>-<anim>.gif.
//
//   node vibe/anim.mjs                 # the representative class set, all anims
//   ONLY=3 node vibe/anim.mjs          # just the phalanx
//   ANGLE=front node vibe/anim.mjs     # face the camera (default: 3/4 hero view)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encodeGif, pngToRGBA } from './_gif.mjs';
import { WEBGPU_HARDWARE_FLAGS, WEBGPU_SWIFTSHADER_FLAGS } from '../webgpu-probe-lib.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const TW = 300, TH = 380, PITCH = 0.95;
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'shots', 'models', 'shared', 'anim');
fs.mkdirSync(OUT, { recursive: true });

const NAMES = ['heavy-sword', 'light-spear', 'longsword', 'phalanx', 'archers', 'skirmishers',
  'shock-cav', 'horse-archers', 'artillery', 'peasant', 'light-sword', 'heavy-spear',
  'medium-infantry', 'medium-spear', 'shock-cav-sword'];
const CLASS_H = [1.75, 2.05, 1.85, 3.5, 1.75, 1.6, 3.4, 2.6, 1.55, 1.55, 1.75, 2.05, 1.9, 2.05, 3.6];
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

const webgpuArgs = process.env.VERIFY_WEBGPU === '1'
  ? (process.env.VERIFY_WEBGPU_ADAPTER === 'hardware' ? WEBGPU_HARDWARE_FLAGS : WEBGPU_SWIFTSHADER_FLAGS)
  : [];
const browser = await chromium.launch({ args: webgpuArgs });
const page = await browser.newPage({ viewport: { width: TW, height: TH } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

for (const cls of only) {
  const h = CLASS_H[cls] ?? 1.8;
  const zoom = Math.max(105, Math.min(280, (0.82 * TH) / (h * Math.sin(PITCH))));
  const camY = 0.52 * h;
  for (const [name, anim] of Object.entries(ANIMS)) {
    const frames = [];
    // Two cycles for the looping anims so the GIF has a natural rhythm.
    const reps = anim.once ? 1 : 2;
    let phase = 0;
    for (let r = 0; r < reps; r++) {
      for (const s of anim.steps) {
        phase = (phase + s.dt) % 1;
        frames.push(pngToRGBA(await captureSoldier(page, {
          classId: cls,
          clip: clipForAnimation(name),
          phase,
          frame: s.frame,
          facing,
          zoom,
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
    console.log('wrote', path.relative(path.join(here, '..'), file), `${frames.length}f ${(gif.length / 1024).toFixed(0)}kb`);
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
  const url = new URL(`${TARGET}/webgpu/skinned-soldier`);
  url.searchParams.set('class', String(opts.classId));
  url.searchParams.set('clip', opts.clip);
  url.searchParams.set('phase', String(opts.phase));
  url.searchParams.set('frame', String(opts.frame));
  url.searchParams.set('facing', String(opts.facing));
  url.searchParams.set('x', '-4.2');
  url.searchParams.set('y', '0.75');
  url.searchParams.set('zoom', String(opts.zoom));
  url.searchParams.set('pitch', String(opts.pitch));
  url.searchParams.set('yaw', String(opts.yaw));
  url.searchParams.set('size', String(opts.size));
  await page.goto(url.href);
  await page.waitForFunction(
    ({ classId, clip, phase }) => window.__webgpuLabReady === true
      && window.__webgpuLabStats?.stats?.classId === classId
      && window.__webgpuLabStats?.stats?.clip === clip
      && Math.abs((window.__webgpuLabStats?.stats?.phase ?? -999) - phase) < 0.0001,
    { classId: opts.classId, clip: opts.clip, phase: opts.phase },
    { timeout: 18000 },
  );
  await page.waitForTimeout(80);
  return page.locator('#webgpu-canvas').screenshot();
}
