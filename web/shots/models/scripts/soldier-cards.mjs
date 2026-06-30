// Bake one 3:4 portrait PNG per model look for the battle card bar (card-bar
// spec, slice 03). Boots the WebGPU skinned-soldier lab route (one soldier, no
// sim), poses each look in a near-front hero three-quarter at a lower pitch than
// the review sheet (a face, not a top-down), framed to the look's own height, and
// crops a tall 3:4 window. Dual-writes each PNG to the soldier-assets package and
// the served web/public copy, writes a look→file manifest, and snap-checks a
// montage of all looks as the render-drift tripwire.
//
// Lives beside soldier-sheets.mjs (the other GPU baker) so playwright/pngjs
// resolve from web/node_modules; the dual-write targets the package + web/public
// regardless of the script's location.
//
//   node web/shots/models/scripts/soldier-cards.mjs            # bake + montage gate
//   UPDATE_SHOTS=1 node web/shots/models/scripts/soldier-cards.mjs   # re-bless montage
//   node web/shots/models/scripts/soldier-cards.mjs --check    # CI: copies present + in sync
//
// GPU note: the lab needs a real WebGPU adapter — run headful with hardware flags
// (no headless swiftshader adapter on macOS). This baker launches that way.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { snapCheck } from '../../../snapshot.mjs';
import { GPU_HARDWARE_FLAGS } from '../../../renderer-probe-lib.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const CHECK = process.argv.includes('--check');

// One name per model look (looks 0..15; the 16th is shock-cav's sidearm variant).
// Classes that share a look share a portrait — keyed on look, not class.
const LOOK_NAMES = [
  'heavy-sword', 'light-spear', 'longsword', 'phalanx', 'archers', 'skirmishers',
  'shock-cav', 'horse-archers', 'artillery', 'peasant', 'light-sword', 'heavy-spear',
  'medium-infantry', 'medium-spear', 'medium-phalanx', 'shock-cav-sidearm',
];
// BODY height (m) per look — NOT the weapon-tip extent — so every figure renders
// at a consistent scale and a raised pike simply runs off the top of the card
// rather than shrinking the soldier to a speck. Foot ≈ a man; mounted ≈ horse+rider.
const FOOT = 1.95, HORSE = 2.6;
const LOOK_H = [FOOT, FOOT, FOOT, FOOT, FOOT, FOOT, HORSE, HORSE, 1.7, FOOT, FOOT, FOOT, FOOT, FOOT, FOOT, HORSE];

// Hero shot: near-front three-quarter at a high pitch (near eye-level, NOT the
// sheet's near-top-down 0.42 — pitch is tilt-from-straight-down, so higher is more
// head-on), framed by look height. 3:4 crop window in source px (2× the card).
// The card stays 3:4, but the portrait is the region BETWEEN the top HP bar and
// the bottom name/bars strip — wider than tall — so the screenshot is baked to
// that region's aspect (not 3:4) and fills it with the figure, no chrome overlap.
const CARD_W = 200, CARD_H = 184;
const CAM_X = -3.3; // centers the soldier (fixed world position) in the canvas
const PITCH = 1.1, YAW = 0;
const FRONT = -Math.PI / 2;
const FACING = FRONT + Math.PI / 12; // slight three-quarter turn off head-on
const VIEW_W = 520, VIEW_H = 440; // tall canvas so the centered 3:4 crop has head/foot margin

const PKG_DIR = new URL('../../../../packages/soldier-assets/assets/cards/', import.meta.url);
const WEB_DIR = new URL('../../../public/assets/soldiers/cards/', import.meta.url);
const pad = (n) => String(n).padStart(2, '0');
const fileFor = (look) => `${pad(look)}-${LOOK_NAMES[look]}.png`;

// A field pixel is green-dominant (G clearly above R and B); anything else is the
// soldier — blue body, navy legs, skin/wood. Used to find the figure so the crop
// follows it instead of the canvas centre (model heights vary per look).
function isFigure(r, g, b) {
  return b > g + 5 || r > g + 12 || r + g + b < 140;
}

// Crop a fixed w×h (3:4) window with the figure CENTRED head-to-feet, so the whole
// soldier shows inside the 3:4 portrait (the card frames it above + below with the
// HP bar and the name/coh/mor strips — chrome never overlaps the figure). The head
// is the first row with a SUBSTANTIAL run of figure pixels, so a thin raised pike
// runs off the top instead of fooling the anchor.
const HEAD_MIN = 6; // figure px in a row to count as head/shoulders (skip thin weapons)
function cropAroundFigure(buf, w, h) {
  const img = PNG.sync.read(buf);
  let minX = img.width, maxX = 0, maxY = 0, headTop = -1;
  for (let y = 0; y < img.height; y++) {
    let row = 0, rowMin = img.width, rowMax = 0;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (isFigure(img.data[i], img.data[i + 1], img.data[i + 2])) {
        row++; if (x < rowMin) rowMin = x; if (x > rowMax) rowMax = x;
      }
    }
    if (row > 0) { if (rowMin < minX) minX = rowMin; if (rowMax > maxX) maxX = rowMax; if (y > maxY) maxY = y; }
    if (headTop < 0 && row >= HEAD_MIN) headTop = y;
  }
  const found = maxX > 0;
  const cx = found ? (minX + maxX) / 2 : img.width / 2;
  const head = headTop >= 0 ? headTop : Math.round(img.height / 3);
  const bodyH = found ? maxY - head : h; // head-to-feet (the pike above `head` is ignored)
  const sx = Math.max(0, Math.min(img.width - w, Math.round(cx - w / 2)));
  const sy = Math.max(0, Math.min(img.height - h, Math.round(head - (h - bodyH) / 2)));
  // Composite the figure onto a dark vertical gradient (drop the bright grass,
  // which washes the figure out and reads like a map tile): field pixels become
  // backdrop, figure pixels are kept — a unit bust, not a battlefield snippet.
  const out = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy++) {
    const t = yy / h; // top → bottom of the card
    // Warm bronze-brown backdrop (NOT a cool slate-grey neutral — aesthetics rule)
    // so the card interior reads as the same worn-metal world as the chassis.
    const bg = [Math.round(44 - 28 * t), Math.round(33 - 22 * t), Math.round(21 - 15 * t)];
    for (let xx = 0; xx < w; xx++) {
      const si = ((sy + yy) * img.width + (sx + xx)) * 4, di = (yy * w + xx) * 4;
      const fig = isFigure(img.data[si], img.data[si + 1], img.data[si + 2]);
      out.data[di] = fig ? img.data[si] : bg[0];
      out.data[di + 1] = fig ? img.data[si + 1] : bg[1];
      out.data[di + 2] = fig ? img.data[si + 2] : bg[2];
      out.data[di + 3] = 255;
    }
  }
  return PNG.sync.write(out);
}

function montage(buffers, gap = 3, cols = 8, bg = [18, 20, 26]) {
  const rows = Math.ceil(buffers.length / cols);
  const W = cols * CARD_W + (cols + 1) * gap, H = rows * CARD_H + (rows + 1) * gap;
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) { out.data[i * 4] = bg[0]; out.data[i * 4 + 1] = bg[1]; out.data[i * 4 + 2] = bg[2]; out.data[i * 4 + 3] = 255; }
  buffers.forEach((buf, i) => {
    const img = PNG.sync.read(buf);
    const ox = gap + (i % cols) * (CARD_W + gap), oy = gap + Math.floor(i / cols) * (CARD_H + gap);
    for (let y = 0; y < CARD_H && y < img.height; y++) for (let x = 0; x < CARD_W && x < img.width; x++) {
      const si = (y * img.width + x) * 4, di = ((oy + y) * W + (ox + x)) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
    }
  });
  return PNG.sync.write(out);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// --check: GPU renders aren't byte-reproducible across machines, so we don't
// re-render — we verify every look's PNG exists and the package and served
// copies are byte-identical (the dual-write wasn't forgotten). The montage
// snapCheck is the render-drift gate.
if (CHECK) {
  let stale = 0;
  for (let look = 0; look < LOOK_NAMES.length; look++) {
    try {
      const a = await readFile(new URL(fileFor(look), PKG_DIR));
      const b = await readFile(new URL(fileFor(look), WEB_DIR));
      if (sha(a) !== sha(b)) { console.log(`DIFF ${fileFor(look)}: package/web copies differ`); stale++; }
    } catch { console.log(`MISSING ${fileFor(look)}`); stale++; }
  }
  console.log(stale ? `${stale} stale/missing card(s)` : 'cards in sync');
  process.exit(stale ? 1 : 0);
}

await mkdir(PKG_DIR, { recursive: true });
await mkdir(WEB_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false, args: GPU_HARDWARE_FLAGS });
const page = await browser.newPage({ viewport: { width: VIEW_W + 360, height: VIEW_H } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const buffers = [];
const manifest = {};
for (let look = 0; look < LOOK_NAMES.length; look++) {
  const h = LOOK_H[look] ?? 1.8;
  const zoom = Math.max(40, Math.min(86, 116 / h)); // whole figure (head-to-feet) fits the portrait region with margin
  const url = new URL(`${TARGET}/renderer/skinned-soldier`);
  url.searchParams.set('class', String(look));
  url.searchParams.set('clip', 'idle');
  url.searchParams.set('phase', '0.15');
  url.searchParams.set('frame', '6');
  url.searchParams.set('facing', String(FACING));
  url.searchParams.set('x', String(CAM_X));
  url.searchParams.set('y', String(0.5 * h));
  url.searchParams.set('zoom', String(zoom));
  url.searchParams.set('pitch', String(PITCH));
  url.searchParams.set('yaw', String(YAW));
  url.searchParams.set('size', '1.15');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (cls) => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.classId === cls,
    look, { timeout: 30000 },
  );
  await page.waitForTimeout(120);
  const shot = await page.locator('#renderer-canvas').screenshot();
  const card = cropAroundFigure(shot, CARD_W, CARD_H);
  buffers.push(card);
  manifest[look] = fileFor(look);
  await writeFile(new URL(fileFor(look), PKG_DIR), card);
  await writeFile(new URL(fileFor(look), WEB_DIR), card);
  console.log(`baked ${fileFor(look)}`);
}
const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(new URL('manifest.json', PKG_DIR), manifestJson);
await writeFile(new URL('manifest.json', WEB_DIR), manifestJson);

let fails = 0;
await snapCheck(page, 'models/cards/portraits', (label, ok, detail) => { if (!ok) { fails++; console.log(`DIFF ${label} ${detail ?? ''}`); } },
  { threshold: 0.1, maxDiffRatio: 0.01, shot: montage(buffers) });

if (errs.length) console.log('page errors:', errs.slice(0, 8));
await browser.close();
process.exit(fails);
