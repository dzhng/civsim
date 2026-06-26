import { CLASS_DEPTH, CLASS_SPACING, UNIT_INFO } from './unitInfoLayout';

export interface WebGpuBattlePickCamera {
  x: number;
  y: number;
  zoom: number;
  pitch: number;
  yaw: number;
  width: number;
  height: number;
}

export interface BattlePickUnit {
  unit: number;
  team: 0 | 1;
  x: number;
  y: number;
  facing: number;
  width: number;
  depth: number;
  alive: number;
}

export interface BattlePickGame {
  unit_count(): number;
  unit_info_ptr(): number;
  unit_info_stride(): number;
}

export interface BattlePickResult {
  unit: number;
  distance: number;
}

export function liveBattlePickUnits(game: BattlePickGame, memory: WebAssembly.Memory): BattlePickUnit[] {
  const stride = game.unit_info_stride();
  const info = new Float32Array(memory.buffer, game.unit_info_ptr(), game.unit_count() * stride);
  const units: BattlePickUnit[] = [];
  for (let unit = 0; unit < game.unit_count(); unit++) {
    const o = unit * stride;
    const alive = info[o + UNIT_INFO.alive] || 0;
    if (alive <= 0) continue;
    const classId = Math.max(0, Math.min(CLASS_DEPTH.length - 1, Math.floor(info[o + UNIT_INFO.classId] || 0)));
    const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[classId]));
    units.push({
      unit,
      team: info[o + UNIT_INFO.team] === 0 ? 0 : 1,
      x: info[o + UNIT_INFO.centerX] || info[o + UNIT_INFO.x],
      y: info[o + UNIT_INFO.centerY] || info[o + UNIT_INFO.y],
      facing: info[o + UNIT_INFO.facing] || 0,
      width: Math.max(10, files * CLASS_SPACING[classId]),
      depth: Math.max(8, CLASS_DEPTH[classId] * 1.1),
      alive,
    });
  }
  return units;
}

export function cssToBattleWorld(cssX: number, cssY: number, canvas: HTMLCanvasElement, camera: WebGpuBattlePickCamera) {
  const rect = canvas.getBoundingClientRect();
  const px = (cssX - rect.left) * (canvas.width / Math.max(1, canvas.clientWidth));
  const py = (cssY - rect.top) * (canvas.height / Math.max(1, canvas.clientHeight));
  const rx = (px - camera.width * 0.5) / camera.zoom;
  const ry = -(py - camera.height * 0.5) / (camera.zoom * cosPitch(camera.pitch));
  const c = Math.cos(camera.yaw);
  const s = Math.sin(camera.yaw);
  return {
    x: camera.x + rx * c - ry * s,
    y: camera.y + rx * s + ry * c,
  };
}

export function battleWorldToCss(x: number, y: number, canvas: HTMLCanvasElement, camera: WebGpuBattlePickCamera) {
  const rect = canvas.getBoundingClientRect();
  const c = Math.cos(camera.yaw);
  const s = Math.sin(camera.yaw);
  const dx = x - camera.x;
  const dy = y - camera.y;
  const rx = dx * c + dy * s;
  const ry = -dx * s + dy * c;
  const px = rx * camera.zoom + camera.width * 0.5;
  const py = -ry * camera.zoom * cosPitch(camera.pitch) + camera.height * 0.5;
  return {
    x: rect.left + px * (canvas.clientWidth / Math.max(1, canvas.width)),
    y: rect.top + py * (canvas.clientHeight / Math.max(1, canvas.height)),
  };
}

export function pickBattleUnit(units: BattlePickUnit[], x: number, y: number, team: 0 | 1 | 'any' = 0): BattlePickResult {
  let best: BattlePickResult = { unit: -1, distance: Infinity };
  for (const unit of units) {
    if (team !== 'any' && unit.team !== team) continue;
    const dx = x - unit.x;
    const dy = y - unit.y;
    const dist = Math.hypot(dx, dy);
    const radius = Math.max(12, Math.min(38, Math.max(unit.width, unit.depth) * 0.85));
    if (dist <= radius && dist < best.distance) best = { unit: unit.unit, distance: dist };
  }
  return best;
}

export function battleUnitsInRect(units: BattlePickUnit[], x0: number, y0: number, x1: number, y1: number, team: 0 | 1 | 'any' = 0) {
  return units
    .filter((unit) => (team === 'any' || unit.team === team) && unit.x >= x0 && unit.x <= x1 && unit.y >= y0 && unit.y <= y1)
    .map((unit) => unit.unit);
}

function cosPitch(pitch: number) {
  return Math.max(0.2, Math.cos(pitch));
}
