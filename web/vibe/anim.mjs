// Animation review: films each soldier animation (walk, run, attack, hit, die)
// as a looping GIF so the motion can be eyeballed frame by frame — the manual
// check the user asked for. Boots the ?test=models turntable (one soldier on a
// flat field, no sim) and drives it with __tt.step, then encodes the frames with
// the dependency-free _gif.mjs encoder into web/shots/anim/<id>-<class>-<anim>.gif.
//
//   node vibe/anim.mjs                 # the representative class set, all anims
//   ONLY=3 node vibe/anim.mjs          # just the phalanx
//   ANGLE=front node vibe/anim.mjs     # face the camera (default: 3/4 hero view)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encodeGif, pngToRGBA } from './_gif.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const TW = 300, TH = 380, PITCH = 0.95;
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'shots', 'anim');
fs.mkdirSync(OUT, { recursive: true });

const NAMES = ['heavy-sword', 'light-spear', 'longsword', 'phalanx', 'archers', 'skirmishers',
  'shock-cav', 'horse-archers', 'artillery', 'peasant', 'light-sword', 'heavy-spear'];
const CLASS_H = [1.75, 2.05, 1.85, 3.5, 1.75, 1.6, 3.4, 2.6, 1.55, 1.55, 1.75, 2.05];
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: TW, height: TH } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${TARGET}/?test=models`);
await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
await page.waitForTimeout(300);

for (const cls of only) {
  const h = CLASS_H[cls] ?? 1.8;
  const zoom = Math.max(105, Math.min(280, (0.82 * TH) / (h * Math.sin(PITCH))));
  const camY = 0.52 * h;
  for (const [name, anim] of Object.entries(ANIMS)) {
    await page.evaluate(() => window.__tt.reset());
    const frames = [];
    // Two cycles for the looping anims so the GIF has a natural rhythm.
    const reps = anim.once ? 1 : 2;
    for (let r = 0; r < reps; r++) {
      for (const s of anim.steps) {
        await page.evaluate(
          ({ s, cls, facing, zoom, camY, pitch, label }) => {
            window.__tt.step({ cls, team: 0, facing, frame: s.frame, pitch, zoom, camY }, s.dt);
            window.__tt.label(label);
          },
          { s, cls, facing, zoom, camY, pitch: PITCH, label: `${NAMES[cls]} · ${name}` },
        );
        frames.push(pngToRGBA(await page.screenshot()));
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
