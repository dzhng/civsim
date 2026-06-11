import init, { Game } from './wasm/sim_wasm.js';
import { Camera } from './camera';
import { CLASS_NAMES, Renderer } from './renderer';
import { Input } from './input';
import { MANUAL_HTML } from './manual';

const TICK_DT = 1 / 30;
const MAX_TICKS_PER_FRAME = 4;

const params = new URLSearchParams(location.search);
const BATTLE_SEED = 0x5eed_c0de;
const MAP = params.get('map') === 'B' ? 1 : 0;
const AI_ON = params.get('ai') !== 'off';

// Class table mirror (depth, lateral spacing) — must match class.rs.
const CLASS_DEPTH = [8, 6, 4, 10, 4, 4, 5, 5, 4];
const CLASS_SPACING = [0.9, 1.0, 1.5, 0.8, 1.2, 1.6, 1.8, 2.2, 2.0];

const wasm = await init();
const game = new Game(BATTLE_SEED);
game.start_battle(MAP);
if (AI_ON) game.set_ai_team(1);

const positions = () =>
  new Float32Array(wasm.memory.buffer, game.positions_ptr(), game.soldier_count() * 2);
const facings = () => new Float32Array(wasm.memory.buffer, game.facings_ptr(), game.soldier_count());
const unitInfo = () =>
  new Float32Array(wasm.memory.buffer, game.unit_info_ptr(), game.unit_count() * game.unit_info_stride());

const canvas = document.getElementById('battlefield') as HTMLCanvasElement;
const camera = new Camera(canvas);
camera.zoom = (canvas.clientHeight * (window.devicePixelRatio || 1)) / 900;

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
  );
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
  orderPoint: (units, x, y, shift, double) => {
    const sel = myUnits(units);
    if (sel.length === 0) return;
    const info = unitInfo();
    const targetUnit = game.pick_unit(x, y, 25);
    const isEnemy = targetUnit >= 0 && info[targetUnit * STRIDE + 6] !== 0 && info[targetUnit * STRIDE + 15] > 0;
    // centroid for relative offsets
    let mx = 0, my = 0;
    for (const u of sel) {
      const [cx, cy] = unitCenter(u);
      mx += cx;
      my += cy;
    }
    mx /= sel.length;
    my /= sel.length;
    for (const u of sel) {
      game.set_pace(u, double ? 1 : 0);
      if (isEnemy) {
        game.set_attack_order(u, targetUnit);
      } else {
        const [cx, cy] = unitCenter(u);
        const tx = x + (cx - mx);
        const ty = y + (cy - my);
        if (shift) game.set_withdraw_order(u, tx, ty);
        else game.set_move_order(u, tx, ty);
      }
    }
  },
  orderLine: (units, x0, y0, x1, y1) => {
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
    const delayFrac = info[o + 14];
    if (delayFrac > 0) {
      const R = 7;
      const segs = Math.max(2, Math.ceil(16 * delayFrac));
      for (let s = 0; s < segs; s++) {
        const a0 = (s / 16) * Math.PI * 2 + Math.PI / 2;
        const a1 = ((s + 1) / 16) * Math.PI * 2 + Math.PI / 2;
        verts.push(
          ax + Math.cos(a0) * R, ay + Math.sin(a0) * R, 1, 1, 1,
          ax + Math.cos(a1) * R, ay + Math.sin(a1) * R, 1, 1, 1,
        );
      }
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

// --- Main loop -----------------------------------------------------------------
const hud = document.getElementById('hud')!;
const banner = document.getElementById('banner')!;
const selbox = document.getElementById('selbox')!;
let aliveF32 = new Float32Array(0);
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
    const a = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), game.soldier_count());
    if (aliveF32.length !== a.length) aliveF32 = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) aliveF32[i] = a[i];
  }
  const primary = input.selected.length > 0 ? input.selected[0] : -1;
  renderer.draw(positions(), facings(), aliveF32, game.soldier_count(), camera, primary);
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

  hudTimer += frameDt;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    updateHud();
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
  withdraw: (u: number, x: number, y: number) => game.set_withdraw_order(u, x, y),
  advance: (n: number) => {
    for (let i = 0; i < n; i++) game.tick();
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
window.__ready = true;
