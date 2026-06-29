// 360° model-review turntable. Boots the WebGPU skinned-soldier lab route (one
// soldier on a flat field, no sim), orbits each model through 8 facings in every
// stance, and snap-checks one contact sheet per class against its committed
// baseline. The sheet is both the thing you review (tweak soldierModel.ts, re-
// run, eyeball the baselines) AND a gate: an unintended geometry/renderer change
// turns a class red with a highlighted diff in shots/diff/. Re-bless intended
// model changes with UPDATE_SHOTS=1.
//
//   node vibe/turntable.mjs                 # all class looks, hero 3/4 angle
//   ONLY=0,3,6 node vibe/turntable.mjs      # just these class ids
//   PITCH=ingame node vibe/turntable.mjs    # the battle's real top-down tilt
//   UPDATE_SHOTS=1 node vibe/turntable.mjs  # re-bless after a model change
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { clearSnapshotFolder, snapCheck } from '../snapshot.mjs';
import { WEBGPU_HARDWARE_FLAGS, WEBGPU_SWIFTSHADER_FLAGS } from '../webgpu-probe-lib.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const LAB_PANEL_W = 360;
const LAB_HEADER_H = 42;
const HERO_CAMERA_X = -2.1;
const INGAME_CAMERA_X = -1.5;
// PITCH=ingame renders at the battle's real max tilt (0.42 rad, near top-down)
// under shots/models/shared/ingame/ to confirm the models still read as the
// engine actually shows them; default is the side-on hero angle for geometry.
const INGAME = process.env.PITCH === 'ingame';
const GROUP = INGAME ? 'models/shared/ingame' : 'models/shared/turntable';

// Thumbnail = the whole (small) viewport, so the montage just tiles screenshots
// with no resize. Portrait: a standing figure with his pike raised.
const TW = 360, TH = 360;

// Hero 3/4 view: tilted well off top-down so silhouette + depth both read.
// (The battle itself caps tilt at 0.42 rad; this is review-only.)
const PITCH = INGAME ? 0.42 : 0.95;   // view tilt from straight-down, radians

const CLASS_NAMES = [
  'heavy-sword', 'light-spear', 'longsword', 'phalanx', 'archers', 'skirmishers',
  'shock-cav', 'horse-archers', 'artillery', 'peasant', 'light-sword', 'heavy-spear',
  'medium-infantry', 'medium-spear', 'medium-phalanx',
];

// Tallest extent (metres) of each model at ease, so each class is framed to its
// own height — a phalanx's 3.4 m pike and a peasant's knife both fill the frame.
const CLASS_H = [1.75, 2.05, 1.85, 3.5, 1.75, 1.6, 3.4, 2.6, 1.7, 1.55, 1.75, 2.05, 1.9, 2.05, 3.1];
const REVIEW_H = [...CLASS_H];
REVIEW_H[3] = 3.2;
REVIEW_H[6] = 3.05;
REVIEW_H[7] = 3.0;
REVIEW_H[8] = 3.2;
REVIEW_H[14] = 3.0;
const frameFor = (cls) => {
  const h = REVIEW_H[cls] ?? CLASS_H[cls] ?? 1.8;
  if (INGAME) return { zoom: Math.max(72, Math.min(108, (0.48 * TH) / h)), camX: INGAME_CAMERA_X, camY: 0.72 * h };
  if (cls === 6 || cls === 7) return { zoom: Math.max(64, Math.min(136, (0.63 * TH) / h)), camX: -1.6, camY: 3.2 };
  return { zoom: Math.max(64, Math.min(136, (0.63 * TH) / h)), camX: HERO_CAMERA_X, camY: 1.25 * h };
};

// Stances = route clip/phase samples (rows of the sheet).
const STANCES = [
  { name: 'ease', clip: 'idle', phase: 0.15, frame: 6 },
  { name: 'ready', clip: 'idle', phase: 0.0, frame: 0 },
  { name: 'attack', clip: 'attack_a', phase: 0.52, frame: 3 },
  { name: 'march', clip: 'march', phase: 0.32, frame: 1 },
];

// 8 facings, 45° apart, starting front-on (model faces the camera) then orbiting.
const ANGLES = Array.from({ length: 8 }, (_, k) => k);
const FRONT = -Math.PI / 2;

function montage(rows, tw, th, gap = 2, bg = [18, 20, 26]) {
  const cols = Math.max(...rows.map((r) => r.length));
  const W = cols * tw + (cols + 1) * gap;
  const H = rows.length * th + (rows.length + 1) * gap;
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    out.data[i * 4] = bg[0]; out.data[i * 4 + 1] = bg[1]; out.data[i * 4 + 2] = bg[2]; out.data[i * 4 + 3] = 255;
  }
  rows.forEach((row, ri) => row.forEach((buf, ci) => {
    const img = PNG.sync.read(buf);
    const ox = gap + ci * (tw + gap), oy = gap + ri * (th + gap);
    for (let y = 0; y < th && y < img.height; y++) {
      for (let x = 0; x < tw && x < img.width; x++) {
        const si = (y * img.width + x) * 4, di = ((oy + y) * W + (ox + x)) * 4;
        out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
      }
    }
  }));
  return PNG.sync.write(out);
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

const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;

const webgpuArgs = process.env.VERIFY_WEBGPU === '1'
  ? (process.env.VERIFY_WEBGPU_ADAPTER === 'hardware' ? WEBGPU_HARDWARE_FLAGS : WEBGPU_SWIFTSHADER_FLAGS)
  : [];
const browser = await chromium.launch({ args: webgpuArgs });
const page = await browser.newPage({ viewport: { width: TW + LAB_PANEL_W, height: TH + LAB_HEADER_H } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const classes = only ?? Array.from({ length: CLASS_NAMES.length }, (_, i) => i);
if (!only) await clearSnapshotFolder(GROUP);

let fails = 0;
const check = (label, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'DIFF'} ${label}${detail ? `  ${detail}` : ''}`);
};

for (const cls of classes) {
  const name = CLASS_NAMES[cls];
  const { zoom, camX, camY } = frameFor(cls);
  const rows = [];
  for (const st of STANCES) {
    const row = [];
    for (const k of ANGLES) {
      const facing = FRONT + k * (Math.PI / 4);
      row.push(await captureSoldier(page, {
        classId: cls,
        clip: st.clip,
        phase: st.phase,
        frame: st.frame,
        facing,
        zoom,
        pitch: INGAME ? 0.42 : PITCH,
        yaw: INGAME ? -0.08 : -0.18,
        camX,
        camY,
        size: cls === 6 ? 1.05 : 1.15,
      }));
    }
    rows.push(row);
  }
  const id = String(cls).padStart(2, '0');
  // The full 8-angle × 4-stance sheet IS the regression target; one image per
  // class (no separate detail crop — it's a subset of this).
  await snapCheck(page, `${GROUP}/${id}-${name}`, check,
    { threshold: 0.1, maxDiffRatio: 0.003, shot: montage(rows, TW, TH) });
}

if (errs.length) console.log('page errors:', errs.slice(0, 8));
await browser.close();
process.exit(fails);

async function captureSoldier(page, opts) {
  const url = new URL(`${TARGET}/webgpu/skinned-soldier`);
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
    ({ classId, clip, phase }) => window.__webgpuLabReady === true
      && window.__webgpuLabStats?.stats?.classId === classId
      && window.__webgpuLabStats?.stats?.clip === clip
      && Math.abs((window.__webgpuLabStats?.stats?.phase ?? -999) - phase) < 0.0001,
    { classId: opts.classId, clip: opts.clip, phase: opts.phase },
    { timeout: 30000 },
  );
  await page.waitForTimeout(80);
  return cropPng(await canvasScreenshot(page), TW, TH);
}

async function canvasScreenshot(page) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForSelector('#webgpu-canvas', { state: 'visible', timeout: 8000 });
    try {
      return await page.locator('#webgpu-canvas').screenshot();
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(120);
    }
  }
  throw lastError;
}
