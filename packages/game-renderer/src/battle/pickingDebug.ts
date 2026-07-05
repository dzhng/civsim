// The lab battle pick harness. One projector (camera3d): the harness frames the
// battle in chart terms ({x, y, zoom, pitch, yaw} plus the device-pixel
// viewport) and converts css↔world through the SAME chartCamera3d the route
// feeds to shell.setCamera, so CPU picking and the GPU frame cannot drift.
import { chartCamera3d, projectPoint, unprojectToPlaneZ, type Camera3DParams } from '../../../renderer-core/src/camera3d';
import { CLASS_DEPTH, CLASS_SPACING, UNIT_INFO, currentUnitFiles, currentUnitRanks } from './unitInfoLayout';

export interface RendererBattlePickCamera {
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
    const files = currentUnitFiles(info, o);
    const ranks = currentUnitRanks(info, o);
    units.push({
      unit,
      team: info[o + UNIT_INFO.team] === 0 ? 0 : 1,
      x: info[o + UNIT_INFO.centerX] || info[o + UNIT_INFO.x],
      y: info[o + UNIT_INFO.centerY] || info[o + UNIT_INFO.y],
      facing: info[o + UNIT_INFO.facing] || 0,
      width: Math.max(10, files * CLASS_SPACING[classId]),
      depth: Math.max(8, ranks * 1.1),
      alive,
    });
  }
  return units;
}

// The chart framing resolved to real camera3d params, aspect pinned to the
// harness viewport — the same resolution the shell renders with.
function pickParams(camera: RendererBattlePickCamera): Camera3DParams {
  return { ...chartCamera3d(camera, camera.height), aspect: camera.width / Math.max(1, camera.height) };
}

export function cssToBattleWorld(cssX: number, cssY: number, canvas: HTMLCanvasElement, camera: RendererBattlePickCamera) {
  const rect = canvas.getBoundingClientRect();
  const px = (cssX - rect.left) * (canvas.width / Math.max(1, canvas.clientWidth));
  const py = (cssY - rect.top) * (canvas.height / Math.max(1, canvas.clientHeight));
  const ndcX = (px / Math.max(1, camera.width)) * 2 - 1;
  const ndcY = 1 - (py / Math.max(1, camera.height)) * 2;
  const hit = unprojectToPlaneZ(pickParams(camera), ndcX, ndcY, 0);
  // Ray misses the ground (parallel or behind the eye): fall back to the centre.
  if (!hit) return { x: camera.x, y: camera.y };
  return { x: hit[0], y: hit[1] };
}

export function battleWorldToCss(x: number, y: number, canvas: HTMLCanvasElement, camera: RendererBattlePickCamera) {
  const rect = canvas.getBoundingClientRect();
  const { ndc, clipW } = projectPoint(pickParams(camera), [x, y, 0]);
  // Behind the camera: report far off-screen so callers cull it.
  if (clipW <= 0) return { x: -1e5, y: -1e5 };
  const px = (ndc[0] * 0.5 + 0.5) * camera.width;
  const py = (1 - (ndc[1] * 0.5 + 0.5)) * camera.height;
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
