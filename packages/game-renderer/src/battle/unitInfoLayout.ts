// Mirrors the packed unit_info layout exported by game-wasm. Keep WebGPU-side
// readers on these names instead of scattering raw offsets across slices.
export const UNIT_INFO = {
  x: 0,
  y: 1,
  facing: 2,
  cohesion: 4,
  team: 6,
  total: 7,
  stamina: 8,
  running: 9,
  targetX: 10,
  targetY: 11,
  hasTarget: 12,
  classId: 13,
  orderProgress: 14,
  alive: 15,
  atEase: 17,
  morale: 20,
  routing: 21,
  goalFacing: 22,
  hasGoalFacing: 23,
  mode: 24,
  fireAtWill: 25,
  evadeAuto: 26,
  centerX: 30,
  centerY: 31,
  renderLook: 32,
  currentFiles: 33,
  currentRanks: 34,
} as const;

export const CLASS_DEPTH = [8, 6, 4, 10, 4, 4, 5, 5, 4, 6, 6, 8, 7, 7, 9] as const;
export const CLASS_SPACING = [
  0.9, 1.0, 1.5, 0.8, 1.2, 1.6, 1.8, 2.2, 2.0, 1.1, 1.0, 0.9, 0.95, 0.95, 0.85,
] as const;

/** Frontage files a unit forms: alive men over the class's rank depth. Every
 *  formation-footprint consumer (order previews, review framing, drag ghosts)
 *  derives width through this, never its own ceil-divide. */
export function unitFiles(classId: number, alive: number): number {
  return Math.max(1, Math.ceil(alive / (CLASS_DEPTH[classId] ?? CLASS_DEPTH[0])));
}

export function currentUnitFiles(info: ArrayLike<number>, offset: number): number {
  const exported = Math.floor(info[offset + UNIT_INFO.currentFiles] || 0);
  if (exported > 0) return exported;
  return unitFiles(info[offset + UNIT_INFO.classId] || 0, info[offset + UNIT_INFO.alive] || 0);
}

export function currentUnitRanks(info: ArrayLike<number>, offset: number): number {
  const exported = Math.floor(info[offset + UNIT_INFO.currentRanks] || 0);
  if (exported > 0) return exported;
  return Math.max(1, Math.ceil((info[offset + UNIT_INFO.alive] || 0) / currentUnitFiles(info, offset)));
}
