// Campaign verification harness. Run from web/: dev server on :5173 (or
// VERIFY_URL), then `node verify-campaign.mjs`.
// Drives: menu -> new campaign -> march on an independent city -> garrison
// battle modal (auto-pause) -> auto-resolve -> outcome -> save/load.
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { snapCheck } from './snapshot.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const map = JSON.parse(await readFile(new URL('./public/data/campaign-map.json', import.meta.url)));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

await page.goto(TARGET);
await page.waitForSelector('#menu-new-campaign', { timeout: 20000 });
await page.click('#menu-new-campaign');
await page.waitForFunction(() => window.__campaignReady === true, { timeout: 30000 });
await page.waitForTimeout(500);

const armies = await page.evaluate(() => window.__campaign.armies());
const mine = armies.filter((a) => a.mine);
check('campaign boots with armies', armies.length >= 10 && mine.length >= 2,
  `${armies.length} visible, ${mine.length} mine`);
const cities = await page.evaluate(() => window.__campaign.cities());
check('cities loaded', Object.keys(cities).length > 400, `${Object.keys(cities).length} cities`);
await page.screenshot({ path: SHOTS + 'campaign-map.png' });

// Pixel regression at deterministic moments: Day 1, paused, fixed camera,
// before any ticking (later states depend on the random campaign seed).
await page.evaluate(() => window.__campaign.cam(-100, 250, 0.16));
await page.waitForTimeout(250);
await snapCheck(page, 'campaign-political', check);
await page.evaluate(() => window.__campaign.cam(-456, 446, 2.5)); // Roma, tilted
await page.waitForTimeout(250);
await snapCheck(page, 'campaign-3d', check);

// March the player's first army (at Roma) on the nearest independent city.
const roma = map.nodes.findIndex((n) => n.name === 'Roma');
const rpos = map.nodes[roma].pos;
let target = -1;
let bestD = 1e9;
map.nodes.forEach((n, i) => {
  if (n.kind !== 'city' || n.owner !== 'independents') return;
  const d = Math.hypot(n.pos[0] - rpos[0], n.pos[1] - rpos[1]);
  if (d < bestD) {
    bestD = d;
    target = i;
  }
});
check('found an independent city near Roma', target >= 0, `${map.nodes[target]?.name} at ${Math.round(bestD)}km`);

const moved = await page.evaluate((t) => window.__campaign.orderMove(0, 0, t, 0), target);
check('move order accepted', moved === true);

// Fast-forward until the garrison battle pends (tick() halts on battle_ready).
let ready = -1;
let spent = 0;
for (let i = 0; i < 40 && ready < 0; i++) {
  ready = await page.evaluate(() => {
    window.__campaign.tick(2000);
    return window.__campaign.battleReady();
  });
  spent += 2000;
}
check('march leads to a pending battle', ready >= 0, `after <=${spent} ticks`);

// Unpause so the frame loop notices battle_ready and auto-pauses with the modal.
await page.keyboard.press('1');
await page.waitForSelector('.cmp-box', { timeout: 5000 });
const modalText = await page.evaluate(() => document.querySelector('.cmp-box').textContent);
check('initiation modal shows both sides', /Attacker/.test(modalText) && /Defender/.test(modalText));
check('campaign auto-paused for the battle', await page.evaluate(() => window.__campaign.paused()));
await page.screenshot({ path: SHOTS + 'campaign-battle-modal.png' });

// Auto-resolve (headless real sim, chunked).
await page.click('#cmp-auto');
await page.waitForFunction(() => !document.querySelector('.cmp-box'), { timeout: 180000 });
check('auto-resolve completes', true);
const after = await page.evaluate(() => ({
  armies: window.__campaign.armies(),
  ready: window.__campaign.battleReady(),
}));
const myArmy = after.armies.find((a) => a.id === 0);
check('battle consumed (no pending)', after.ready === -1);
check('player army took casualties or won cleanly', !!myArmy, myArmy ? `${myArmy.soldiers} soldiers left` : 'army wiped');
await page.screenshot({ path: SHOTS + 'campaign-after-battle.png' });

// Save, exit to menu, load.
await page.click('#cmp-save');
const saved = await page.evaluate(() => localStorage.getItem('campaign-save') !== null);
check('save written', saved);
await page.click('#cmp-exit');
await page.waitForSelector('#menu-ui', { state: 'visible', timeout: 5000 });
const loadEnabled = await page.evaluate(() => !document.querySelector('#menu-load-save').disabled);
check('load button enabled after save', loadEnabled);
await page.click('#menu-load-save');
await page.waitForFunction(() => window.__campaignReady === true, { timeout: 30000 });
const reloaded = await page.evaluate(() => window.__campaign.armies().length);
check('save loads back into a live campaign', reloaded >= 1, `${reloaded} armies visible`);

// --- Territory overlay & 3D camera ------------------------------------------
const ts = await page.evaluate(() => window.__campaign.terrStats());
check('territory voronoi covers the owned world', ts.filled > 50000 && ts.labels.length >= 6,
  `${ts.filled} land cells claimed, ${ts.labels.length} faction labels`);

await page.evaluate(() => window.__campaign.cam(-100, 250, 0.16));
let cam = await page.evaluate(() => window.__campaign.camGet());
let terrA = await page.evaluate(() => window.__campaign.territoryAlpha());
check('zoomed out: top-down political map with territories', cam.pitchDeg > 85 && terrA > 0.7,
  `pitch ${cam.pitchDeg.toFixed(1)}°, territory alpha ${terrA.toFixed(2)}`);
await page.waitForTimeout(250);
await page.screenshot({ path: SHOTS + 'campaign-political.png' });

await page.evaluate(() => window.__campaign.cam(-456, 446, 2.5)); // Roma
cam = await page.evaluate(() => window.__campaign.camGet());
terrA = await page.evaluate(() => window.__campaign.territoryAlpha());
check('zoomed in: camera tilts to 3D, territory fades', cam.pitchDeg < 60 && terrA < 0.3,
  `pitch ${cam.pitchDeg.toFixed(1)}°, territory alpha ${terrA.toFixed(2)}`);
await page.waitForTimeout(250);
await page.screenshot({ path: SHOTS + 'campaign-3d.png' });

// Click-selection must survive the 3D projection: center on one of my armies,
// click its on-screen banner base, expect it selected.
const clickSel = await page.evaluate(() => {
  const me = window.__campaign.armies().find((a) => a.mine);
  if (!me) return { ok: false };
  window.__campaign.select(-1);
  window.__campaign.cam(me.x, me.y, 2.5);
  const [px, py] = window.__campaign.project(me.x, me.y);
  return { ok: true, id: me.id, px, py };
});
if (clickSel.ok) {
  await page.waitForTimeout(150);
  await page.mouse.click(clickSel.px, clickSel.py);
  const sel = await page.evaluate(() => window.__campaign.selected());
  check('click-select works through the tilted camera', sel === clickSel.id, `selected ${sel}, wanted ${clickSel.id}`);
} else {
  check('click-select works through the tilted camera', false, 'no own army to test with');
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
