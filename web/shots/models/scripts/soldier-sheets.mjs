// 360° model-review sheet. Boots the WebGPU skinned-soldier lab route (one
// soldier on a flat field, no sim), orbits each model through 8 facings in every
// stance at the battle's in-game camera pitch, and snap-checks one contact sheet
// per class against its committed baseline. The sheet is both the thing you
// review (tweak soldierModel.ts, re-run, eyeball the baselines) AND a gate: an
// unintended geometry/renderer change turns a class red with a highlighted diff
// in shots/diff/. Re-bless intended model changes with UPDATE_SHOTS=1.
//
//   node shots/models/scripts/soldier-sheets.mjs                 # all class looks, in-game pitch
//   ONLY=0,3,6 node shots/models/scripts/soldier-sheets.mjs      # just these class ids
//   UPDATE_SHOTS=1 node shots/models/scripts/soldier-sheets.mjs  # re-bless after a model change
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { clearSnapshotFolder, snapCheck } from '../../../snapshot.mjs';
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from '../../../renderer-probe-lib.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const LAB_PANEL_W = 360;
const LAB_HEADER_H = 42;
const INGAME_CAMERA_X = -1.5;
const GROUP = 'models/shared/soldiers/ingame';

// Thumbnail = the whole (small) viewport, so the montage just tiles screenshots
// with no resize. Portrait: a standing figure with his pike raised.
const TW = 360, TH = 360;

// Battle's real max tilt (near top-down), so the sheet reviews actual in-game
// readability.
const PITCH = 0.42; // view tilt from straight-down, radians
const YAW = -0.08;

const CLASS_NAMES = [
  'heavy-sword', 'light-spear', 'longsword', 'phalanx', 'archers', 'skirmishers',
  'shock-cav', 'horse-archers', 'artillery', 'peasant', 'light-sword', 'heavy-spear',
  'medium-infantry', 'medium-spear', 'medium-phalanx', 'shock-cav-sidearm',
  'heavy-phalanx-rest', 'medium-phalanx-rest', 'heavy-phalanx-sidearm', 'medium-phalanx-sidearm',
];

// Tallest extent (metres) of each model at ease, so each class is framed to its
// own height — a phalanx's 3.4 m pike and a peasant's knife both fill the frame.
const CLASS_H = [1.75, 2.05, 1.85, 3.5, 1.75, 1.6, 3.4, 2.6, 1.7, 1.55, 1.75, 2.05, 1.9, 2.05, 3.1, 3.4, 3.5, 3.1, 3.5, 3.1];
const REVIEW_H = [...CLASS_H];
REVIEW_H[3] = 3.2;
REVIEW_H[6] = 3.05;
REVIEW_H[7] = 3.0;
REVIEW_H[8] = 3.2;
REVIEW_H[14] = 3.0;
const frameFor = (cls) => {
  const h = REVIEW_H[cls] ?? CLASS_H[cls] ?? 1.8;
  return { zoom: Math.max(72, Math.min(108, (0.48 * TH) / h)), camX: INGAME_CAMERA_X, camY: 0.72 * h };
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

const gpuArgs = process.env.VERIFY_GPU === '1'
  ? (process.env.VERIFY_GPU_ADAPTER === 'hardware' ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS)
  : [];
const browser = await chromium.launch({ args: gpuArgs });
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
        pitch: PITCH,
        yaw: YAW,
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
    { timeout: 30000 },
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
