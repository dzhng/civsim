// 360° model-review turntable. Boots the ?test=models harness (one soldier per
// class on a flat field, no sim), orbits each model through 8 facings in every
// stance, and writes one contact sheet per class to vibe/shots/models/. Review
// the sheets, tweak src/shared/soldierModel.ts, re-run.
//
//   node vibe/turntable.mjs            # all 12 classes
//   ONLY=0,3,6 node vibe/turntable.mjs # just these class ids
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
// PITCH=ingame renders at the battle's real max tilt (0.42 rad, near top-down)
// into shots/models-ingame/ to confirm the models still read as the engine
// actually shows them; default is the side-on hero angle for geometry review.
const INGAME = process.env.PITCH === 'ingame';
const OUT = new URL(INGAME ? './shots/models-ingame/' : './shots/models/', import.meta.url).pathname;

// Thumbnail = the whole (small) viewport, so the montage just tiles screenshots
// with no resize. Portrait: a standing figure with his pike raised.
const TW = 360, TH = 460;

// Hero 3/4 view: tilted well off top-down so silhouette + depth both read.
// (The battle itself caps tilt at 0.42 rad; this is review-only.)
const PITCH = INGAME ? 0.42 : 0.95;   // view tilt from straight-down, radians

const CLASS_NAMES = [
  'heavy-sword', 'light-spear', 'longsword', 'phalanx', 'archers', 'skirmishers',
  'shock-cav', 'horse-archers', 'artillery', 'peasant', 'light-sword', 'heavy-spear',
];

// Tallest extent (metres) of each model at ease, so each class is framed to its
// own height — a phalanx's 3.4 m pike and a peasant's knife both fill the frame.
const CLASS_H = [1.75, 2.05, 1.85, 3.5, 1.75, 1.6, 3.4, 2.6, 1.55, 1.55, 1.75, 2.05];
const frameFor = (cls) => {
  const h = CLASS_H[cls] ?? 1.8;
  // Near top-down (in-game), the figure projects through its ground footprint,
  // not its height — frame to the height directly and aim near the feet.
  if (INGAME) return { zoom: Math.max(70, Math.min(150, (0.7 * TH) / h)), camY: 0.15 * h };
  return { zoom: Math.max(105, Math.min(280, (0.82 * TH) / (h * Math.sin(PITCH)))), camY: 0.52 * h };
};

// Stances = sim frame values the renderer reads (rows of the sheet).
const STANCES = [
  { name: 'ease', frame: 6 },    // at ease: poles upright, blades low
  { name: 'ready', frame: 0 },   // alert: weapon in guard
  { name: 'attack', frame: 3 },  // trading blows: forward thrust
  { name: 'march', frame: 1 },   // walking
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

const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: TW, height: TH } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${TARGET}/?test=models`);
await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
await page.waitForTimeout(300);

await mkdir(OUT, { recursive: true });
const classes = only ?? Array.from({ length: 12 }, (_, i) => i);

// Detail sheet picks front (0°), 3/4-front (45°) and right profile (90°).
const DETAIL = [0, 1, 2];

for (const cls of classes) {
  const name = CLASS_NAMES[cls];
  const { zoom, camY } = frameFor(cls);
  const rows = [];
  for (const st of STANCES) {
    const row = [];
    for (const k of ANGLES) {
      const facing = FRONT + k * (Math.PI / 4);
      await page.evaluate(
        (p) => { window.__tt.render(p); window.__tt.label(`${p.name} · ${p.st} · ${p.deg}°`); },
        { cls, team: 0, facing, frame: st.frame, pitch: PITCH, zoom, camY,
          name, st: st.name, deg: k * 45 },
      );
      row.push(await page.screenshot());
    }
    rows.push(row);
  }
  const id = String(cls).padStart(2, '0');
  await writeFile(`${OUT}${id}-${name}.png`, montage(rows, TW, TH));
  await writeFile(`${OUT}${id}-${name}-detail.png`, montage(rows.map((r) => DETAIL.map((k) => r[k])), TW, TH));
  console.log(`${name}: turntable ${rows.length}×${rows[0].length} + detail -> ${id}-${name}.png`);
}

if (errs.length) console.log('page errors:', errs.slice(0, 8));
await browser.close();
