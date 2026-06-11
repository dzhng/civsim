import init, { Game } from './wasm/sim_wasm.js';
import { Camera } from './camera';
import { CLASS_NAMES, Renderer } from './renderer';
import { Input } from './input';
import { MANUAL_HTML } from './manual';
import { groupMoveDests, UnitSnap } from './orders';

const TICK_DT = 1 / 30;
const MAX_TICKS_PER_FRAME = 4;

const params = new URLSearchParams(location.search);
const BATTLE_SEED = 0x5eed_c0de;
const MAP = params.get('map') === 'B' ? 1 : 0;
// Vibe-check sandboxes: ?battle=1v1 or ?battle=5v5 (small open fields).
const SANDBOX = params.get('battle');
const AI_ON = params.get('ai') !== 'off';

// Class table mirrors — must match class.rs.
const CLASS_DEPTH = [8, 6, 4, 10, 4, 4, 5, 5, 4];
const CLASS_SPACING = [0.9, 1.0, 1.5, 0.8, 1.2, 1.6, 1.8, 2.2, 2.0];
// Primary weapon (reach, arc) for the attack-arc display.
const WEAPON_VIZ: [number, number][] = [
  [1.1, 1.4], [1.6, 0.6], [1.8, 2.4], [3.2, 0.22], [0.8, 1.0],
  [0.8, 1.0], [2.4, 0.3], [1.3, 1.4], [0.8, 1.0],
];

const wasm = await init();
const game = new Game(BATTLE_SEED);
if (SANDBOX === '1v1') game.start_sandbox(0);
else if (SANDBOX === '5v5') game.start_sandbox(1);
else game.start_battle(MAP);
if (AI_ON) game.set_ai_team(1);

const positions = () =>
  new Float32Array(wasm.memory.buffer, game.positions_ptr(), game.soldier_count() * 2);
const facings = () => new Float32Array(wasm.memory.buffer, game.facings_ptr(), game.soldier_count());
const unitInfo = () =>
  new Float32Array(wasm.memory.buffer, game.unit_info_ptr(), game.unit_count() * game.unit_info_stride());

const canvas = document.getElementById('battlefield') as HTMLCanvasElement;
const camera = new Camera(canvas);
// Open looking at your own line from behind (player south, enemy north) —
// framed to the actual map, so the sandboxes open snugly.
{
  const mapH = game.terrain_h() * game.terrain_cell();
  camera.y = -0.27 * mapH;
  camera.zoom = (canvas.clientHeight * (window.devicePixelRatio || 1)) / Math.min(mapH * 0.62, 1000);
}

const STRIDE = game.unit_info_stride();

const renderer = new Renderer(canvas);
{
  const soldierUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), game.soldier_count());
  const info = unitInfo();
  const teams = Array.from({ length: game.unit_count() }, (_, u) => info[u * STRIDE + 6]);
  const classes = Array.from({ length: game.unit_count() }, (_, u) => info[u * STRIDE + 13]);
  const radii = new Float32Array(wasm.memory.buffer, game.radius_ptr(), game.soldier_count());
  renderer.setStatic(soldierUnit, teams, classes, radii);

  const tw = game.terrain_w();
  const th = game.terrain_h();
  renderer.setTerrain(
    tw, th, game.terrain_cell(), game.terrain_origin_x(), game.terrain_origin_y(),
    new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), tw * th),
    new Float32Array(wasm.memory.buffer, game.terrain_rough_ptr(), tw * th),
    new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th),
  );
}

// --- Minimap -------------------------------------------------------------------
const minimap = document.getElementById('minimap') as HTMLCanvasElement;
const miniBack = document.createElement('canvas');
{
  const tw = game.terrain_w();
  const th = game.terrain_h();
  miniBack.width = minimap.width;
  miniBack.height = minimap.height;
  const g = miniBack.getContext('2d')!;
  const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th);
  const PAL = ['#5a6a40', '#2c455c', '#6f6c66', '#7a6c5b', '#37512c', '#56503c', '#6e6651'];
  const img = g.createImageData(minimap.width, minimap.height);
  for (let py = 0; py < minimap.height; py++) {
    for (let px = 0; px < minimap.width; px++) {
      const cx = Math.floor((px / minimap.width) * tw);
      const cy = Math.floor(((minimap.height - 1 - py) / minimap.height) * th);
      const c = PAL[tint[cy * tw + cx]] ?? PAL[0];
      const n = parseInt(c.slice(1), 16);
      const o = (py * minimap.width + px) * 4;
      img.data[o] = n >> 16;
      img.data[o + 1] = (n >> 8) & 0xff;
      img.data[o + 2] = n & 0xff;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}
const worldToMini = (x: number, y: number): [number, number] => {
  const [ox, oy] = [game.terrain_origin_x(), game.terrain_origin_y()];
  const w = game.terrain_w() * game.terrain_cell();
  const h = game.terrain_h() * game.terrain_cell();
  return [((x - ox) / w) * minimap.width, (1 - (y - oy) / h) * minimap.height];
};
minimap.addEventListener('mousedown', (e) => {
  const r = minimap.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  camera.x = game.terrain_origin_x() + fx * game.terrain_w() * game.terrain_cell();
  camera.y = game.terrain_origin_y() + (1 - fy) * game.terrain_h() * game.terrain_cell();
});
function drawMinimap() {
  const g = minimap.getContext('2d')!;
  g.drawImage(miniBack, 0, 0);
  const info = unitInfo();
  for (let u = 0; u < game.unit_count(); u++) {
    const o = u * STRIDE;
    if (info[o + 15] === 0) continue;
    const [mx, my] = worldToMini(info[o], info[o + 1]);
    g.fillStyle = info[o + 21] > 0.5 ? '#888' : info[o + 6] === 0 ? '#e0604f' : '#6f9ae8';
    g.fillRect(mx - 1.5, my - 1.5, 3, 3);
  }
  const [ax, ay] = camera.screenToWorld(0, 0);
  const [bx, by] = camera.screenToWorld(canvas.width, canvas.height);
  const [m0x, m0y] = worldToMini(ax, ay);
  const [m1x, m1y] = worldToMini(bx, by);
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 1;
  g.strokeRect(Math.min(m0x, m1x), Math.min(m0y, m1y), Math.abs(m1x - m0x), Math.abs(m1y - m0y));
}

// --- Per-unit labels: HP + cohesion bars and effect icons --------------------
const labelsRoot = document.getElementById('unitlabels')!;
const labelDivs: HTMLDivElement[] = [];
for (let u = 0; u < game.unit_count(); u++) {
  const d = document.createElement('div');
  d.className = 'ulabel';
  d.innerHTML = '<div class="bar hp"><div></div></div><div class="bar coh"><div></div></div><div class="fx"></div>';
  labelsRoot.appendChild(d);
  labelDivs.push(d);
}

function updateUnitLabels() {
  const info = unitInfo();
  const showAll = camera.zoom > 1.1;
  for (let u = 0; u < game.unit_count(); u++) {
    const d = labelDivs[u];
    const o = u * STRIDE;
    const alive = info[o + 15];
    if (alive === 0 || !showAll) {
      d.style.display = 'none';
      continue;
    }
    const [sx, sy] = camera.worldToScreen(info[o], info[o + 1]);
    if (sx < -60 || sy < -40 || sx > window.innerWidth + 60 || sy > window.innerHeight + 40) {
      d.style.display = 'none';
      continue;
    }
    d.style.display = 'block';
    d.style.transform = `translate(${(sx - 26).toFixed(0)}px, ${(sy - 34).toFixed(0)}px)`;
    const hp = d.children[0].children[0] as HTMLElement;
    const coh = d.children[1].children[0] as HTMLElement;
    hp.style.width = `${((alive / info[o + 7]) * 100).toFixed(0)}%`;
    hp.style.background = info[o + 6] === 0 ? '#e0604f' : '#6f9ae8';
    coh.style.width = `${(info[o + 4] * 100).toFixed(0)}%`;

    // Effect chips: explicit states + derived physical facts.
    const fx: string[] = [];
    const mode = info[o + 24];
    if (info[o + 21] > 0.5) fx.push('<b class="bad">ROUT</b>');
    else if (mode === 2) fx.push('<b title="disengaging">DIS</b>');
    else if (mode === 1) fx.push('<b title="attacking">ATK</b>');
    if (info[o + 18] === 2) fx.push('<b class="hot" title="charging">CHG!</b>');
    fx.push(info[o + 17] > 0.5 ? '<b title="fence: fight at reach">FEN</b>' : '<b title="othismos: press with weight">OTH</b>');
    if (info[o + 25] > 0.5) fx.push('<b title="pursue: latch onto contact">PUR</b>');
    if (info[o + 26] > 0.5) fx.push('<b title="kiting reflex on">KITE</b>');
    if (info[o + 29] > 0.5) fx.push('<b class="hot" title="secondary weapon drawn">2nd</b>');
    if (info[o + 3] < 0.3 && info[o + 16] > 0) fx.push('<b title="braced: planted mass">BRC</b>');
    if (info[o + 8] < 0.35) fx.push('<b class="bad" title="winded">TIRED</b>');
    if (info[o + 28] > 0.5) fx.push('<b title="squeezed into a corridor">SQZ</b>');
    if (info[o + 27] > 0.5) fx.push('<b title="queued behind friends">WAIT</b>');
    if (info[o + 16] > 0) fx.push(`<b class="hot" title="men trading blows">⚔${info[o + 16]}</b>`);
    (d.children[2] as HTMLElement).innerHTML = fx.join('');
  }
}

// --- Time control ------------------------------------------------------------
let paused = false;
let timeScale = 1;
let showPaths = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'p') paused = !paused;
  if (e.key === '1') timeScale = 1;
  if (e.key === '3') timeScale = 3;
  if (e.key === ' ') {
    showPaths = true;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') showPaths = false;
});

// --- Orders ------------------------------------------------------------------
const unitCenter = (u: number): [number, number] => {
  const info = unitInfo();
  const o = u * STRIDE;
  // anchor is front-center; offset half-depth back along facing
  const alive = info[o + 15];
  const cls = info[o + 13];
  const depth = (Math.ceil(alive / Math.ceil(alive / CLASS_DEPTH[cls] || 1)) || 1) * 1.1;
  return [info[o] - Math.cos(info[o + 2]) * depth * 0.5, info[o + 1] - Math.sin(info[o + 2]) * depth * 0.5];
};

const myUnits = (units: number[]) => {
  const info = unitInfo();
  return units.filter((u) => info[u * STRIDE + 6] === 0 && info[u * STRIDE + 15] > 0);
};

const unitSnap = (u: number): UnitSnap => {
  const info = unitInfo();
  const [cx, cy] = unitCenter(u);
  const cls = info[u * STRIDE + 13];
  const alive = info[u * STRIDE + 15];
  const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
  return { u, x: cx, y: cy, r: 0.5 * files * CLASS_SPACING[cls] };
};

// Order ghosts flash for a moment on every command (and persist on Space).
const orderFlash = new Map<number, number>();
const markFlash = (units: number[]) => {
  const t = performance.now();
  units.forEach((u) => orderFlash.set(u, t));
};

// Group move: clusters keep formation; far clusters combine at the target
// as a compressed star. Facing = direction of travel.
function groupMove(units: number[], x: number, y: number, kind: 'move' | 'disengage', facing?: number) {
  const sel = myUnits(units);
  if (sel.length === 0) return;
  const snaps = sel.map(unitSnap);
  let cx = 0, cy = 0;
  for (const s of snaps) {
    cx += s.x;
    cy += s.y;
  }
  cx /= snaps.length;
  cy /= snaps.length;
  const face = facing ?? Math.atan2(y - cy, x - cx);
  for (const d of groupMoveDests(snaps, x, y)) {
    if (kind === 'disengage') game.set_disengage_order(d.u, d.x, d.y);
    else game.set_move_order_facing(d.u, d.x, d.y, face);
  }
  markFlash(sel);
}

// Group attack: hold formation until ~150m out, then break and let every
// unit pathfind to the target itself.
interface GroupAttack {
  units: number[];
  target: number;
  lastTx: number;
  lastTy: number;
}
let groupAttacks: GroupAttack[] = [];
function tickGroupAttacks() {
  const info = unitInfo();
  groupAttacks = groupAttacks.filter((ga) => {
    const sel = myUnits(ga.units);
    if (sel.length === 0) return false;
    const to = ga.target * STRIDE;
    if (info[to + 15] === 0) return false; // target destroyed
    const [tx, ty] = unitCenter(ga.target);
    let cx = 0, cy = 0;
    for (const u of sel) {
      const [x, y] = unitCenter(u);
      cx += x;
      cy += y;
    }
    cx /= sel.length;
    cy /= sel.length;
    const dist = Math.hypot(tx - cx, ty - cy);
    if (dist < 160) {
      sel.forEach((u) => game.set_attack_order(u, ga.target));
      markFlash(sel);
      return false; // formation released: every unit hunts on its own
    }
    if (Math.hypot(tx - ga.lastTx, ty - ga.lastTy) > 35) {
      // The target moved: re-aim the formation approach.
      const stop = dist - 150;
      const nx = cx + ((tx - cx) / dist) * stop;
      const ny = cy + ((ty - cy) / dist) * stop;
      groupMove(sel, nx, ny, 'move');
      ga.lastTx = tx;
      ga.lastTy = ty;
    }
    return true;
  });
}

const input = new Input(canvas, camera, {
  unitsInRect: (x0, y0, x1, y1) => {
    const info = unitInfo();
    const out: number[] = [];
    for (let u = 0; u < game.unit_count(); u++) {
      if (info[u * STRIDE + 6] !== 0 || info[u * STRIDE + 15] === 0) continue;
      const [cx, cy] = unitCenter(u);
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.push(u);
    }
    return out;
  },
  pickUnit: (x, y) => game.pick_unit(x, y, 30),
  allUnits: () => {
    const info = unitInfo();
    const out: number[] = [];
    for (let u = 0; u < game.unit_count(); u++) {
      if (info[u * STRIDE + 6] === 0 && info[u * STRIDE + 15] > 0) out.push(u);
    }
    return out;
  },
  dragMove: (units, dx, dy) => {
    // Translate the selection exactly, preserving each unit's facing.
    const sel = myUnits(units);
    const info = unitInfo();
    for (const u of sel) {
      const [cx, cy] = unitCenter(u);
      game.set_move_order_facing(u, cx + dx, cy + dy, info[u * STRIDE + 2]);
    }
    markFlash(sel);
  },
  orderPoint: (units, x, y, shift, double, alt) => {
    const sel = myUnits(units);
    if (sel.length === 0) return;
    const info = unitInfo();
    const targetUnit = game.pick_unit(x, y, 25);
    const isEnemy = targetUnit >= 0 && info[targetUnit * STRIDE + 6] !== 0 && info[targetUnit * STRIDE + 15] > 0;
    sel.forEach((u) => game.set_pace(u, double ? 1 : 0));
    if (isEnemy) {
      if (sel.length === 1) {
        game.set_attack_order(sel[0], targetUnit);
        markFlash(sel);
      } else {
        // Formation approach, then break and charge at ~150m.
        groupAttacks = groupAttacks.filter((ga) => !ga.units.some((u) => sel.includes(u)));
        groupAttacks.push({ units: [...sel], target: targetUnit, lastTx: 1e9, lastTy: 1e9 });
        tickGroupAttacks();
      }
    } else {
      groupMove(sel, x, y, shift || alt ? 'disengage' : 'move');
    }
  },
  orderFacing: (units, x, y, facing) => {
    groupMove(units, x, y, 'move', facing);
  },
  orderLineUnused: (units: number[], x0: number, y0: number, x1: number, y1: number) => {
    const sel = myUnits(units);
    if (sel.length === 0) return;
    const info = unitInfo();
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // Facing: perpendicular, away from where the units stand now.
    let mx = 0, my = 0;
    for (const u of sel) {
      const [cx, cy] = unitCenter(u);
      mx += cx;
      my += cy;
    }
    mx /= sel.length;
    my /= sel.length;
    let nx = -uy, ny = ux;
    const midx = (x0 + x1) / 2, midy = (y0 + y1) / 2;
    if (nx * (midx - mx) + ny * (midy - my) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const facing = Math.atan2(ny, nx);

    if (sel.length === 1) {
      // Single unit: the drag PAINTS the frontage.
      const u = sel[0];
      const cls = info[u * STRIDE + 13];
      const alive = info[u * STRIDE + 15];
      const files = Math.max(4, Math.min(alive, Math.round(len / CLASS_SPACING[cls])));
      game.set_files(u, files);
      game.set_move_order_facing(u, midx, midy, facing);
      return;
    }
    // Group: keep CLASS DEPTH (the invariant) — widths from headcount, no
    // reshaping to fill; distribute along the line in current order.
    const GAP = 10;
    const widths = sel.map((u) => {
      const cls = info[u * STRIDE + 13];
      const alive = info[u * STRIDE + 15];
      const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
      return files * CLASS_SPACING[cls];
    });
    const order = sel
      .map((u, i) => {
        const [cx, cy] = unitCenter(u);
        return { u, i, t: cx * ux + cy * uy };
      })
      .sort((a, b) => a.t - b.t);
    const total = widths.reduce((s, w) => s + w, 0) + GAP * (sel.length - 1);
    let cursor = -total / 2;
    for (const { u, i } of order) {
      const cls = info[u * STRIDE + 13];
      const alive = info[u * STRIDE + 15];
      const center = cursor + widths[i] / 2;
      game.set_files(u, Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls])));
      game.set_move_order_facing(u, midx + ux * center, midy + uy * center, facing);
      cursor += widths[i] + GAP;
    }
  },
  togglePace: (units) => {
    const sel = myUnits(units);
    const info = unitInfo();
    const anyWalk = sel.some((u) => info[u * STRIDE + 9] < 0.5);
    sel.forEach((u) => game.set_pace(u, anyWalk ? 1 : 0));
  },
  toggleStance: (units) => {
    const sel = myUnits(units);
    const info = unitInfo();
    const anyOth = sel.some((u) => info[u * STRIDE + 17] < 0.5);
    sel.forEach((u) => game.set_stance(u, anyOth ? 1 : 0));
  },
  toggleCharge: (units) => {
    const sel = myUnits(units);
    const info = unitInfo();
    const anyOff = sel.some((u) => info[u * STRIDE + 18] < 0.5);
    sel.forEach((u) => game.set_charge_enabled(u, anyOff ? 1 : 0));
  },
  reform: (units) => myUnits(units).forEach((u) => game.set_reform(u)),
  toggleWeapon: (units) => {
    const sel = myUnits(units);
    const info = unitInfo();
    const anyPrimary = sel.some((u) => info[u * STRIDE + 29] < 0.5);
    sel.forEach((u) => game.set_weapon_pref(u, anyPrimary ? 1 : 0));
  },
  toggleKite: (units) => {
    const sel = myUnits(units);
    const info = unitInfo();
    const anyOff = sel.some((u) => info[u * STRIDE + 26] < 0.5);
    sel.forEach((u) => game.set_evade_auto(u, anyOff ? 1 : 0));
  },
  togglePursue: (units) => {
    pursueOn = !pursueOn;
    myUnits(units).forEach((u) => game.set_pursue(u, pursueOn ? 1 : 0));
  },
  toggleFire: (units) => {
    fireOn = !fireOn;
    myUnits(units).forEach((u) => game.set_fire_at_will(u, fireOn ? 1 : 0));
  },
});
let pursueOn = false;
let fireOn = true;

// --- Overlay (paths, pies, projectiles, selection rings) ----------------------
/** Formation-frame outline + facing tick at a prospective destination. */
function pushGhost(verts: number[], x: number, y: number, facing: number, w: number, d: number, r: number, g: number, b: number) {
  const fx = Math.cos(facing), fy = Math.sin(facing);
  const rx = fy, ry = -fx;
  const hw = w / 2;
  const corners = [
    [x + rx * hw, y + ry * hw],
    [x - rx * hw, y - ry * hw],
    [x - rx * hw - fx * d, y - ry * hw - fy * d],
    [x + rx * hw - fx * d, y + ry * hw - fy * d],
  ];
  for (let k = 0; k < 4; k++) {
    const [x0, y0] = corners[k];
    const [x1, y1] = corners[(k + 1) % 4];
    verts.push(x0, y0, r, g, b, x1, y1, r, g, b);
  }
  verts.push(x, y, r, g, b, x + fx * 5, y + fy * 5, r, g, b);
}

function overlayVerts(withPaths: boolean): Float32Array {
  const info = unitInfo();
  const n = game.unit_count();
  const verts: number[] = [];
  for (let u = 0; u < n; u++) {
    const o = u * STRIDE;
    const [ax, ay, facing, team] = [info[o], info[o + 1], info[o + 2], info[o + 6]];
    const [r, g, b] = team === 0 ? [1.0, 0.55, 0.45] : [0.55, 0.7, 1.0];
    if (withPaths) {
      const fx = Math.cos(facing);
      const fy = Math.sin(facing);
      verts.push(ax, ay, r, g, b, ax + fx * 4, ay + fy * 4, r, g, b);
      verts.push(ax - fy * 2, ay + fx * 2, r, g, b, ax + fy * 2, ay - fx * 2, r, g, b);
      if (info[o + 12] > 0.5) {
        verts.push(ax, ay, r, g, b, info[o + 10], info[o + 11], r, g, b);
      }
    }
    // Destination ghost: the formation frame at the end of the path
    // (flashes on every order; hold Space to keep them all visible).
    const age = performance.now() - (orderFlash.get(u) ?? -1e9);
    if (info[o + 12] > 0.5 && (withPaths || age < 2500)) {
      // Recent orders fade out; Space shows them at full strength.
      const k = withPaths ? 1 : Math.max(0, 1 - age / 2500);
      const cls = info[o + 13];
      const alive = info[o + 15];
      const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
      const w = files * CLASS_SPACING[cls];
      const d = CLASS_DEPTH[cls] * 1.1;
      const gf = info[o + 23] > 0.5 ? info[o + 22] : Math.atan2(info[o + 11] - ay, info[o + 10] - ax);
      pushGhost(verts, info[o + 10], info[o + 11], gf, w, d, r * k, g * k, b * k);
      verts.push(ax, ay, r * 0.8 * k, g * 0.8 * k, b * 0.8 * k, info[o + 10], info[o + 11], r * 0.8 * k, g * 0.8 * k, b * 0.8 * k);
    }
    // Progress pies, one visual pattern: WHITE = order transmitting,
    // ORANGE = weapon order traveling down the line.
    const pies: [number, number, number, number, number][] = [];
    if (info[o + 14] > 0) pies.push([info[o + 14], 7, 1, 1, 1]);
    if (info[o + 30] > 0) pies.push([info[o + 30], 9, 1, 0.65, 0.2]);
    for (const [frac, R, pr, pg, pb] of pies) {
      const segs = Math.max(2, Math.ceil(16 * frac));
      for (let s = 0; s < segs; s++) {
        const a0 = (s / 16) * Math.PI * 2 + Math.PI / 2;
        const a1 = ((s + 1) / 16) * Math.PI * 2 + Math.PI / 2;
        verts.push(
          ax + Math.cos(a0) * R, ay + Math.sin(a0) * R, pr, pg, pb,
          ax + Math.cos(a1) * R, ay + Math.sin(a1) * R, pr, pg, pb,
        );
      }
    }
  }
  // Right-drag preview: where everyone will stand, facing the cursor.
  if (input.rightDrag) {
    const sel = myUnits(input.selected);
    if (sel.length > 0) {
      const snaps = sel.map(unitSnap);
      for (const dst of groupMoveDests(snaps, input.rightDrag.x, input.rightDrag.y)) {
        const o = dst.u * STRIDE;
        const cls = info[o + 13];
        const alive = info[o + 15];
        const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
        pushGhost(verts, dst.x, dst.y, input.rightDrag.facing, files * CLASS_SPACING[cls], CLASS_DEPTH[cls] * 1.1, 1, 1, 0.7);
      }
      // The arrow itself.
      const a = input.rightDrag;
      verts.push(a.x, a.y, 1, 1, 0.7, a.x + Math.cos(a.facing) * 14, a.y + Math.sin(a.facing) * 14, 1, 1, 0.7);
    }
  }
  // Drag-move preview: ghosts of every selected unit at the dragged spot.
  if (input.dragDelta) {
    const [dx, dy] = input.dragDelta;
    for (const u of input.selected) {
      const o = u * STRIDE;
      const cls = info[o + 13];
      const alive = info[o + 15];
      if (alive === 0) continue;
      const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
      const [cx, cy] = unitCenter(u);
      pushGhost(verts, cx + dx, cy + dy, info[o + 2], files * CLASS_SPACING[cls], CLASS_DEPTH[cls] * 1.1, 1, 1, 1);
    }
  }
  // Selection rings.
  for (const u of input.selected) {
    const [cx, cy] = unitCenter(u);
    const R = 6;
    for (let s = 0; s < 12; s++) {
      const a0 = (s / 12) * Math.PI * 2;
      const a1 = ((s + 1) / 12) * Math.PI * 2;
      verts.push(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, 1, 1, 1,
                 cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, 1, 1, 1);
    }
  }
  // Projectiles.
  const pCount = game.projectile_count();
  if (pCount > 0) {
    const px = new Float32Array(wasm.memory.buffer, game.projectile_x_ptr(), pCount);
    const py = new Float32Array(wasm.memory.buffer, game.projectile_y_ptr(), pCount);
    const pk = new Uint8Array(wasm.memory.buffer, game.projectile_kind_ptr(), pCount);
    for (let i = 0; i < pCount; i++) {
      const stone = pk[i] === 2;
      const len = stone ? 1.4 : 0.7;
      const c = stone ? 0.25 : 0.92;
      verts.push(px[i] - len, py[i], c, c, c * 0.9, px[i] + len, py[i], c, c, c * 0.9);
    }
  }
  return new Float32Array(verts);
}

// --- Buttons / manual / banner -------------------------------------------------
document.getElementById('btn-manual')!.addEventListener('click', () => {
  const el = document.getElementById('manual')!;
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('manual')!.innerHTML = MANUAL_HTML;
document.getElementById('btn-mapa')!.addEventListener('click', () => {
  location.search = '?map=A';
});
document.getElementById('btn-mapb')!.addEventListener('click', () => {
  location.search = '?map=B';
});
document.getElementById('btn-restart')!.addEventListener('click', () => location.reload());
document.getElementById('btn-1v1')!.addEventListener('click', () => {
  location.search = '?battle=1v1';
});
document.getElementById('btn-5v5')!.addEventListener('click', () => {
  location.search = '?battle=5v5';
});

// --- Main loop -----------------------------------------------------------------
const hud = document.getElementById('hud')!;
const banner = document.getElementById('banner')!;
const selbox = document.getElementById('selbox')!;
let aliveF32 = new Float32Array(0);
let frames = new Float32Array(0);
let prevPos = new Float32Array(0);
let accumulator = 0;
let lastFrame = performance.now();
let tickMsAvg = 0;
let fpsAvg = 60;
let hudTimer = 0;

function frame(now: number) {
  const frameDt = Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;
  fpsAvg += (1 / Math.max(frameDt, 1e-4) - fpsAvg) * 0.05;

  camera.x += input.panX * frameDt;
  camera.y += input.panY * frameDt;

  accumulator += paused ? 0 : frameDt * timeScale;
  let ticks = 0;
  const maxTicks = MAX_TICKS_PER_FRAME * timeScale;
  while (accumulator >= TICK_DT && ticks < maxTicks) {
    const t0 = performance.now();
    game.tick();
    tickMsAvg += (performance.now() - t0 - tickMsAvg) * 0.1;
    accumulator -= TICK_DT;
    ticks++;
  }
  if (ticks === maxTicks) accumulator = 0;

  {
    const n = game.soldier_count();
    const a = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), n);
    const fighting = new Uint8Array(wasm.memory.buffer, game.fighting_ptr(), n);
    const switchCd = new Float32Array(wasm.memory.buffer, game.switch_cd_ptr(), n);
    const pos = positions();
    if (aliveF32.length !== n) {
      aliveF32 = new Float32Array(n);
      frames = new Float32Array(n);
      prevPos = new Float32Array(pos);
    }
    const t = now / 1000;
    for (let i = 0; i < n; i++) {
      aliveF32[i] = a[i];
      if (!a[i]) {
        frames[i] = 4; // fallen
      } else if (switchCd[i] > 0) {
        frames[i] = 5; // fumbling the weapon swap
      } else if (fighting[i]) {
        frames[i] = ((t * 2.5 + i * 0.7) | 0) % 2 ? 3 : 0; // trading blows
      } else {
        const dx = pos[2 * i] - prevPos[2 * i];
        const dy = pos[2 * i + 1] - prevPos[2 * i + 1];
        frames[i] = dx * dx + dy * dy > 0.0004 ? 1 + (((t * 4 + i) | 0) % 2) : 0;
      }
    }
    prevPos.set(pos);
  }
  const primary = input.selected.length > 0 ? input.selected[0] : -1;
  const bannerList: { x: number; y: number; team: number; unit: number }[] = [];
  {
    const info = unitInfo();
    for (let u = 0; u < game.unit_count(); u++) {
      const o = u * STRIDE;
      if (info[o + 15] > 0 && info[o + 21] < 0.5) {
        bannerList.push({ x: info[o], y: info[o + 1], team: info[o + 6], unit: u });
      }
    }
  }
  renderer.draw(positions(), facings(), frames, aliveF32, game.soldier_count(), camera, primary, bannerList);
  // Attack arcs: every soldier mid-swing flashes his weapon's true envelope
  // (reach x arc) — readable combat, straight from the class table.
  if (camera.zoom > 2.5) {
    const tris: number[] = [];
    const pos = positions();
    const face = facings();
    const soldierUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), game.soldier_count());
    const info = unitInfo();
    const [wx0, wy1] = camera.screenToWorld(0, 0);
    const [wx1, wy0] = camera.screenToWorld(canvas.width, canvas.height);
    let budget = 900;
    for (let i = 0; i < game.soldier_count() && budget > 0; i++) {
      if (frames[i] !== 3) continue;
      const x = pos[2 * i];
      const y = pos[2 * i + 1];
      if (x < wx0 || x > wx1 || y < wy0 || y > wy1) continue;
      const u = soldierUnit[i];
      const cls = info[u * STRIDE + 13];
      const [reach, arc] = WEAPON_VIZ[cls] ?? [1.0, 1.0];
      const team = info[u * STRIDE + 6];
      const [r, g, b] = team === 0 ? [1.0, 0.72, 0.35] : [0.55, 0.85, 1.0];
      const a = 0.26;
      const half = Math.max(arc, 0.18) / 2;
      const segs = arc > 1.2 ? 5 : 3;
      const f0 = face[i];
      const R = reach + 0.45; // surface-to-surface reach + a body radius
      for (let s = 0; s < segs; s++) {
        const a0 = f0 - half + (s / segs) * arc;
        const a1 = f0 - half + ((s + 1) / segs) * arc;
        tris.push(
          x, y, r, g, b, a,
          x + Math.cos(a0) * R, y + Math.sin(a0) * R, r, g, b, 0.04,
          x + Math.cos(a1) * R, y + Math.sin(a1) * R, r, g, b, 0.04,
        );
      }
      budget--;
    }
    if (tris.length) renderer.drawTris(new Float32Array(tris), camera);
  }
  renderer.drawOverlay(overlayVerts(showPaths), camera);

  // DOM selection rectangle.
  if (input.box) {
    selbox.style.display = 'block';
    selbox.style.left = Math.min(input.box.x0, input.box.x1) + 'px';
    selbox.style.top = Math.min(input.box.y0, input.box.y1) + 'px';
    selbox.style.width = Math.abs(input.box.x1 - input.box.x0) + 'px';
    selbox.style.height = Math.abs(input.box.y1 - input.box.y0) + 'px';
  } else {
    selbox.style.display = 'none';
  }

  updateUnitLabels();
  hudTimer += frameDt;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    tickGroupAttacks();
    updateHud();
    drawMinimap();
  }
  requestAnimationFrame(frame);
}

function updateHud() {
  const lines = [
    `soldiers ${game.soldier_count().toLocaleString()}   units ${game.unit_count()}`,
    `fps ${fpsAvg.toFixed(0)}   tick ${tickMsAvg.toFixed(2)} ms` +
      (paused ? '   PAUSED' : timeScale !== 1 ? `   x${timeScale}` : ''),
  ];
  let bars = '';
  if (input.selected.length > 1) {
    lines.push(`${input.selected.length} units selected`);
  } else if (input.selected.length === 1) {
    const info = unitInfo();
    const o = input.selected[0] * STRIDE;
    const cohesion = info[o + 4];
    const fatigue = info[o + 8];
    const pace = info[o + 9] > 0.5 ? 'run' : 'walk';
    const cls = CLASS_NAMES[info[o + 13]] ?? '?';
    const stance = info[o + 17] > 0.5 ? 'fence' : 'othismos';
    const charge = info[o + 18] === 2 ? '  CHARGING' : info[o + 18] === 1 ? '  charge armed' : '';
    const ammo = info[o + 19] > 0 ? `  ammo ${info[o + 19]}` : '';
    const routing = info[o + 21] > 0.5 ? '  ROUTING' : '';
    const engaged = info[o + 16];
    lines.push(
      `unit ${input.selected[0]}  ${cls}  team ${info[o + 6]}  ${pace} ${info[o + 3].toFixed(1)} m/s  ${stance}${charge}`,
      `men ${info[o + 15]}/${info[o + 7]}${engaged > 0 ? `  engaged ${engaged}` : ''}${ammo}${routing}`,
      `cohesion ${(cohesion * 100).toFixed(0)}%  disorder ${(info[o + 5] * 100).toFixed(0)}%  stamina ${(fatigue * 100).toFixed(0)}%  morale ${(info[o + 20] * 100).toFixed(0)}%`,
    );
    bars =
      `<div class="bar"><div style="width:${(cohesion * 100).toFixed(0)}%"></div></div>` +
      `<div class="bar"><div style="width:${(fatigue * 100).toFixed(0)}%;background:#d9a13b"></div></div>` +
      `<div class="bar"><div style="width:${(info[o + 20] * 100).toFixed(0)}%;background:#c2554e"></div></div>`;
  }
  hud.innerHTML = lines.join('<br>') + bars;

  const v = game.victor();
  if (v >= 0) {
    banner.style.display = 'block';
    banner.textContent = v === 0 ? 'RED ARMY HOLDS THE FIELD' : 'BLUE ARMY HOLDS THE FIELD';
    banner.style.color = v === 0 ? '#e0604f' : '#6f9ae8';
  }
}

requestAnimationFrame(frame);

// --- Debug/verify API ------------------------------------------------------------
declare global {
  interface Window {
    __game: unknown;
    __ready: boolean;
  }
}
window.__game = {
  stats: () => ({
    soldiers: game.soldier_count(),
    units: game.unit_count(),
    tickMs: tickMsAvg,
    fps: fpsAvg,
    victor: game.victor(),
  }),
  setOrder: (u: number, x: number, y: number) => game.set_move_order(u, x, y),
  select: (u: number) => {
    input.selected = u >= 0 ? [u] : [];
  },
  setPace: (u: number, pace: number) => game.set_pace(u, pace),
  setStance: (u: number, s: number) => game.set_stance(u, s),
  attackOrder: (u: number, enemy: number) => game.set_attack_order(u, enemy),
  attackMove: (u: number, x: number, y: number) => game.set_attack_move_order(u, x, y),
  disengage: (u: number, x: number, y: number) => game.set_disengage_order(u, x, y),
  advance: (n: number) => {
    for (let i = 0; i < n; i++) game.tick();
    tickGroupAttacks();
  },
  groupMove: (units: number[], x: number, y: number) => groupMove(units, x, y, 'move'),
  groupAttack: (units: number[], target: number) => {
    groupAttacks.push({ units, target, lastTx: 1e9, lastTy: 1e9 });
    tickGroupAttacks();
  },
  unitInfo: (u: number) => Array.from(unitInfo().slice(u * STRIDE, u * STRIDE + STRIDE)),
  soldierStartOf: (u: number) => {
    const info = unitInfo();
    let start = 0;
    for (let k = 0; k < u; k++) start += info[k * STRIDE + 7];
    return start;
  },
  soldierPos: (i: number) => {
    const p = positions();
    return [p[2 * i], p[2 * i + 1]];
  },
};
declare global { interface Window { __cam: unknown } }
window.__cam = camera;
window.__ready = true;
