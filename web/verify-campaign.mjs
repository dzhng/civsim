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
await page.waitForFunction(() => window.__campaignReady === true, undefined, { timeout: 30000 });
await page.waitForTimeout(500);

const armies = await page.evaluate(() => window.__campaign.armies());
const mine = armies.filter((a) => a.mine);
check('campaign boots with armies', armies.length >= 10 && mine.length >= 2,
  `${armies.length} visible, ${mine.length} mine`);
const cities = await page.evaluate(() => window.__campaign.cities());
check('cities loaded', Object.keys(cities).length > 400, `${Object.keys(cities).length} cities`);
await page.screenshot({ path: SHOTS + 'campaign-map.png' });

// Pixel regression at deterministic moments: Day 1, paused, fixed camera,
// water clock frozen, before any ticking (later states depend on the seed).
await page.evaluate(() => window.__campaign.freeze());
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
await page.waitForFunction(() => !document.querySelector('.cmp-box'), undefined, { timeout: 300000 });
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
await page.waitForFunction(() => window.__campaignReady === true, undefined, { timeout: 30000 });
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

// --- B5: ambush affordance — park on a trigger tile, the button appears -----
const tilePosOf = (e, tile) => {
  const cum = [0];
  for (let i = 1; i < e.via.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(e.via[i][0] - e.via[i - 1][0], e.via[i][1] - e.via[i - 1][1]));
  }
  const d = (cum[cum.length - 1] * (tile + 0.5)) / e.tiles.length;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
  return [
    e.via[i - 1][0] + (e.via[i][0] - e.via[i - 1][0]) * t,
    e.via[i - 1][1] + (e.via[i][1] - e.via[i - 1][1]) * t,
  ];
};
const me0 = await page.evaluate(() => window.__campaign.armies().find((a) => a.mine));
let bestSpot = -1;
let bestSpotD = 1e9;
map.ambush_spots.forEach((sp, i) => {
  const [x, y] = tilePosOf(map.edges[sp.edge], sp.tile);
  const d = Math.hypot(x - me0.x, y - me0.y);
  if (d < bestSpotD) {
    bestSpotD = d;
    bestSpot = i;
  }
});
const sp = map.ambush_spots[bestSpot];
// Freeze the world and teleport the army onto the trigger: a deterministic,
// quiet setup. Marching it there through whatever war the random seed has spun
// up would let an encounter form on the tile, which legitimately blocks the
// ambush order — but that tests the seed, not the ambush mechanic.
const parked = await page.evaluate(([id, edge, tile]) => {
  window.__campaign.freeze();
  window.__campaign.place(id, 1, edge, tile);
  const a = window.__campaign.armies().find((x) => x.id === id);
  return !!a && !a.marching && window.__campaign.battleReady() < 0;
}, [me0.id, sp.edge, sp.tile]);
check('army parks on the nearest ambush trigger', parked, `spot ${bestSpot} at ${Math.round(bestSpotD)}km`);
const parkedAt = await page.evaluate((id) => {
  const a = window.__campaign.armies().find((x) => x.id === id);
  window.__campaign.cam(a.x, a.y, 2.5);
  return window.__campaign.project(a.x, a.y);
}, me0.id);
await page.waitForTimeout(150);
await page.mouse.click(parkedAt[0], parkedAt[1]);
const hasAmbushBtn = await page.evaluate(() => !!document.querySelector('#cmp-ambush'));
check('army panel offers Ambush on the trigger tile', hasAmbushBtn);
if (hasAmbushBtn) {
  await page.click('#cmp-ambush');
  const stance = await page.evaluate((id) => {
    window.__campaign.tick(5);
    return window.__campaign.armies().find((x) => x.id === id)?.stance;
  }, me0.id);
  check('ambush order settles the army into hiding', stance === 2 || stance === 3, `stance ${stance}`);
} else {
  check('ambush order settles the army into hiding', false, 'no button');
}

// --- A1: reinforcements spawn mid-battle and the frontend keeps up ----------
// Fresh campaign; march BOTH player armies at the same city so the second is
// committed as a reinforcement, then Fight (not auto-resolve) and watch
// unit_count grow inside the battle.
await page.click('#cmp-exit');
await page.waitForSelector('#menu-ui', { state: 'visible', timeout: 5000 });
await page.click('#menu-new-campaign');
await page.waitForFunction(() => window.__campaignReady === true, undefined, { timeout: 30000 });
// A3: split a stack off the Roma army (it lands on an adjacent tile, well
// inside the 12-tile reinforcement radius), then merge-ability both ways.
const splitRes = await page.evaluate(() => {
  const c = window.__campaign;
  const before = c.armies().length;
  const me = c.armies().filter((a) => a.mine)[0];
  const ok = c.orderSplit(me.id, 0b10); // second roster entry
  const after = c.armies();
  const kid = after.filter((a) => a.mine && a.id !== me.id && Math.hypot(a.x - me.x, a.y - me.y) < 8);
  return { ok, before, count: after.length, adjacent: kid.length > 0, parent: me.id };
});
check('split detaches a stack onto an adjacent tile', splitRes.ok && splitRes.count === splitRes.before + 1 && splitRes.adjacent,
  `${splitRes.before} -> ${splitRes.count} armies`);
const mergeRes = await page.evaluate((parent) => {
  const c = window.__campaign;
  const before = c.armies().filter((a) => a.mine && a.soldiers > 0).length;
  const kid = c.armies().filter((a) => a.mine).slice(-1)[0];
  const ok = c.orderMerge(kid.id, parent);
  return { ok, before, after: c.armies().filter((a) => a.mine && a.soldiers > 0).length };
}, splitRes.parent);
check('merge folds the stack back in', mergeRes.ok && mergeRes.after === mergeRes.before - 1,
  `${mergeRes.before} -> ${mergeRes.after} live armies`);

// Split a detachment, then stage BOTH stacks on the road into the target: the
// main army one tile out (it will strike the city), the detachment three tiles
// back, well inside the 12-tile reinforcement radius. Teleporting both makes
// the join deterministic regardless of where the nearest enemy now sits (each
// faction owns a contiguous home region, so independents are no longer next door).
const targetId = map.nodes[target].id;
const approach = map.edges.findIndex(
  (e) => e.kind !== 'sea' && (e.a === targetId || e.b === targetId) && e.tiles.length >= 4,
);
const e = map.edges[approach];
const fromA = approach >= 0 && e.a === targetId; // is the target the low-tile end?
const mainTile = approach < 0 ? 0 : fromA ? 1 : e.tiles.length - 2;
const detTile = approach < 0 ? 0 : fromA ? 3 : e.tiles.length - 4;
await page.evaluate(
  ([ei, mt, dt]) => {
    const c = window.__campaign;
    const me = c.armies().filter((a) => a.mine)[0];
    c.orderSplit(me.id, 0b10);
    const mine = c.armies().filter((a) => a.mine);
    const det = mine[mine.length - 1]; // the freshest stack
    if (ei >= 0) {
      c.place(me.id, 1, ei, mt);
      c.place(det.id, 1, ei, dt);
    }
  },
  [approach, mainTile, detTile],
);
let ready2 = -1;
await page.evaluate((t) => {
  const me = window.__campaign.armies().filter((a) => a.mine)[0];
  window.__campaign.orderMove(me.id, 0, t, 0);
}, target);
for (let i = 0; i < 40 && ready2 < 0; i++) {
  ready2 = await page.evaluate(() => {
    window.__campaign.tick(2000);
    return window.__campaign.battleReady();
  });
}
check('march leads to a pending battle with the detachment nearby', ready2 >= 0);
await page.keyboard.press('1');
await page.waitForSelector('.cmp-box', { timeout: 5000 });
const modalText2 = await page.evaluate(() => document.querySelector('.cmp-box').textContent);
check('initiation modal announces reinforcements', /will join/.test(modalText2),
  modalText2.replace(/\s+/g, ' ').slice(0, 110));
await page.click('#cmp-fight');
await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 30000 });
const units0 = await page.evaluate(() => window.__game.stats().units);
let unitsNow = units0;
for (let i = 0; i < 60 && unitsNow <= units0; i++) {
  unitsNow = await page.evaluate(() => {
    window.__game.advance(600); // 20 battle-seconds per chunk
    return window.__game.stats().units;
  });
}
check('reinforcement column arrives and renders', unitsNow > units0, `${units0} -> ${unitsNow} units`);
await page.screenshot({ path: SHOTS + 'campaign-reinforcement.png' });

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
