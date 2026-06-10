import init, { Game } from './wasm/sim_wasm.js';
import { Camera } from './camera';
import { CLASS_NAMES, Renderer } from './renderer';
import { Input } from './input';

const TICK_DT = 1 / 30;
const MAX_TICKS_PER_FRAME = 4;

const BATTLE_SEED = 0x5eed_c0de;
const MAP = new URLSearchParams(location.search).get('map') === 'B' ? 1 : 0;

const wasm = await init();
const game = new Game(BATTLE_SEED);
game.start_battle(MAP);

// Views into wasm linear memory. Re-created every frame: they detach
// whenever wasm memory grows.
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
    tw,
    th,
    game.terrain_cell(),
    game.terrain_origin_x(),
    game.terrain_origin_y(),
    new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), tw * th),
    new Float32Array(wasm.memory.buffer, game.terrain_rough_ptr(), tw * th),
  );
}

// --- Time control + path overlay -------------------------------------------
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

function overlayVerts(withPaths: boolean): Float32Array {
  const info = unitInfo();
  const n = game.unit_count();
  const verts: number[] = [];
  for (let u = 0; u < n; u++) {
    const o = u * STRIDE;
    const [ax, ay, facing, team] = [info[o], info[o + 1], info[o + 2], info[o + 6]];
    const [r, g, b] = team === 0 ? [1.0, 0.55, 0.45] : [0.55, 0.7, 1.0];
    if (withPaths) {
      // Anchor marker: a short heading tick plus a cross-bar, and the path.
      const fx = Math.cos(facing);
      const fy = Math.sin(facing);
      verts.push(ax, ay, r, g, b, ax + fx * 4, ay + fy * 4, r, g, b);
      verts.push(ax - fy * 2, ay + fx * 2, r, g, b, ax + fy * 2, ay - fx * 2, r, g, b);
      if (info[o + 12] > 0.5) {
        verts.push(ax, ay, r, g, b, info[o + 10], info[o + 11], r, g, b);
      }
    }
    // Order-transmission pie: remaining fraction as an arc over the unit.
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
  // Projectiles in flight: short dashes (stones darker and longer).
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

const input = new Input(canvas, camera, {
  pickUnit: (x, y) => game.pick_unit(x, y, 30),
  orderAt: (unit, x, y, shift, double) => {
    const info = unitInfo();
    const targetUnit = game.pick_unit(x, y, 25);
    const isEnemy =
      targetUnit >= 0 &&
      info[targetUnit * STRIDE + 6] !== info[unit * STRIDE + 6] &&
      info[targetUnit * STRIDE + 15] > 0;
    // Single right-click walks, a quick second click breaks into a run.
    game.set_pace(unit, double ? 1 : 0);
    if (isEnemy) {
      game.set_attack_order(unit, targetUnit);
    } else if (shift) {
      game.set_withdraw_order(unit, x, y);
    } else {
      game.set_move_order(unit, x, y);
    }
  },
  togglePace: (unit) => {
    const isRunning = unitInfo()[unit * STRIDE + 9] > 0.5;
    game.set_pace(unit, isRunning ? 0 : 1);
  },
  toggleStance: (unit) => {
    const isFence = unitInfo()[unit * STRIDE + 17] > 0.5;
    game.set_stance(unit, isFence ? 0 : 1);
  },
  toggleCharge: (unit) => {
    const armed = unitInfo()[unit * STRIDE + 18] > 0.5;
    game.set_charge_enabled(unit, armed ? 0 : 1);
  },
});

// --- Main loop -------------------------------------------------------------
const hud = document.getElementById('hud')!;
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
  if (ticks === maxTicks) accumulator = 0; // refuse death spiral

  {
    const a = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), game.soldier_count());
    if (aliveF32.length !== a.length) aliveF32 = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) aliveF32[i] = a[i];
  }
  renderer.draw(positions(), facings(), aliveF32, game.soldier_count(), camera, input.selected);
  renderer.drawOverlay(overlayVerts(showPaths), camera);

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
  if (input.selected >= 0) {
    const info = unitInfo();
    const o = input.selected * STRIDE;
    const cohesion = info[o + 4];
    const fatigue = info[o + 8];
    const pace = info[o + 9] > 0.5 ? 'run' : 'walk';
    const cls = CLASS_NAMES[info[o + 13]] ?? '?';
    const stance = info[o + 17] > 0.5 ? 'fence' : 'othismos';
    const charge = info[o + 18] === 2 ? '  CHARGING' : info[o + 18] === 1 ? '  charge armed' : '';
    const ammo = info[o + 19] > 0 ? `  ammo ${info[o + 19]}` : '';
    const engaged = info[o + 16];
    lines.push(
      `unit ${input.selected}  ${cls}  team ${info[o + 6]}  ${pace} ${info[o + 3].toFixed(1)} m/s  ${stance}${charge}`,
      `men ${info[o + 15]}/${info[o + 7]}${engaged > 0 ? `  engaged ${engaged}` : ''}${ammo}`,
      `cohesion ${(cohesion * 100).toFixed(0)}%  disorder ${(info[o + 5] * 100).toFixed(0)}%  stamina ${(fatigue * 100).toFixed(0)}%`,
    );
    bars =
      `<div class="bar"><div style="width:${(cohesion * 100).toFixed(0)}%"></div></div>` +
      `<div class="bar"><div style="width:${(fatigue * 100).toFixed(0)}%;background:#d9a13b"></div></div>`;
  }
  hud.innerHTML = lines.join('<br>') + bars;
}

requestAnimationFrame(frame);

// --- Debug/verify API (used by the Playwright harness) ----------------------
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
  }),
  setOrder: (u: number, x: number, y: number) => game.set_move_order(u, x, y),
  setPace: (u: number, pace: number) => game.set_pace(u, pace),
  setStance: (u: number, s: number) => game.set_stance(u, s),
  attackOrder: (u: number, enemy: number) => game.set_attack_order(u, enemy),
  attackMove: (u: number, x: number, y: number) => game.set_attack_move_order(u, x, y),
  withdraw: (u: number, x: number, y: number) => game.set_withdraw_order(u, x, y),
  // Fast-forward n ticks synchronously (verification only — lets the harness
  // test minute-scale maneuvers in real-time seconds).
  advance: (n: number) => {
    for (let i = 0; i < n; i++) game.tick();
  },
  select: (u: number) => {
    input.selected = u;
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
