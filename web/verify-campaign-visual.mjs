// Campaign visual harness. Run from web/ with a dev server (VERIFY_URL or
// :5173): `node verify-campaign-visual.mjs`.
//
// Boots the fake one-road, two-city map (?campaign=test): our city (Roma) — a
// road — a neutral city (Neapolis), with one mixed-roster player army to pose.
// A controlled stage means the army/city models show against a clean backdrop
// (no real-map red-on-red, no garrison battles), so these snapshots both SHOW
// what the markers look like and catch any rendering regression.
//
// Poses the army over the road, over our city, and over the neutral city, plus
// a wide overview, each pixel-checked against a baseline (see snapshot.mjs;
// UPDATE_SHOTS=1 re-blesses). The army teleports via window.__campaign.place
// (debug hook) so each pose is exact and deterministic.
import { chromium } from 'playwright';
import { snapCheck } from './snapshot.mjs';

const TARGET = process.env.VERIFY_URL ?? 'http://localhost:5173';

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

await page.goto(TARGET + '/?campaign=test');
await page.waitForFunction(() => window.__campaignReady === true, undefined, { timeout: 30000 });
await page.evaluate(() => window.__campaign.freeze()); // pin the water clock for stable pixels

const Y = 450; // matches buildTestCampaign
const army = await page.evaluate(() => window.__campaign.armies().find((a) => a.mine));
check('test campaign boots with a player army', !!army, army ? `${army.soldiers} soldiers` : 'none');

// A pose: teleport the army, frame it, snapshot it (the committed baseline is
// the picture you review AND the gate).
const pose = async (name, place, camX) => {
  if (place) await page.evaluate((p) => window.__campaign.place(0, p.kind, p.a, p.b), place);
  await page.evaluate((x) => window.__campaign.cam(x, 450, 20), camX);
  await page.waitForTimeout(300);
  await snapCheck(page, `tiny-${name}`, check);
};

// Wide look at the whole stage (both cities + the road).
await page.evaluate((y) => window.__campaign.cam(0, y, 16), Y);
await page.waitForTimeout(300);
await snapCheck(page, 'tiny-overview', check);

// Campaign UI surfaces introduced by the class-builder feature. These are
// deterministic Day-1 panels over the same frozen fake map.
await page.click('#cmp-classes-btn');
await page.waitForTimeout(300);
await snapCheck(page, 'ui-class-builder', check);
await page.click('#cmp-classes-btn');

const armyClick = await page.evaluate(() => {
  const a = window.__campaign.armies().find((army) => army.mine);
  return window.__campaign.project(a.x, a.y);
});
await page.mouse.click(armyClick[0], armyClick[1]);
await page.waitForTimeout(300);
await snapCheck(page, 'ui-army-replenish-toggle', check);

await pose('army-our-city', { kind: 0, a: 0, b: 0 }, -25); // node 0 = Roma (ours)
await pose('army-road', { kind: 1, a: 0, b: 4 }, 0); // edge 0, mid tile
await pose('army-neutral-city', { kind: 0, a: 1, b: 0 }, 25); // node 1 = Neapolis (neutral)

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
