/** The `?debug=blocks` view: one padded rectangle per unit, fitted to the bodies
 *  that unit still has alive this frame and coloured by its team. Preparation is
 *  pure geometry — every battle world prepares it here and hands the vertices to
 *  its own debug triangle layer. */
export interface BattleDebugBlockInput {
  /** Interleaved live soldier positions, two floats each. */
  positions: Float32Array;
  /** Per-soldier alive weight; a body at or below 0.5 no longer sizes its block. */
  alive: Float32Array;
  count: number;
  /** Soldier index to unit id, and unit id to team. */
  soldierUnit: ArrayLike<number>;
  unitTeam: ArrayLike<number>;
}

/** World metres added on every side so a block reads as a formation, not a hull. */
const BLOCK_PADDING = 2.4;
const TEAM_ONE_COLOR: [number, number, number, number] = [0.88, 0.2, 0.16, 0.88];
const OTHER_TEAM_COLOR: [number, number, number, number] = [0.18, 0.44, 1.0, 0.88];

export function battleDebugBlockTriangles(input: BattleDebugBlockInput): Float32Array {
  const bounds = new Map<
    number,
    { x0: number; y0: number; x1: number; y1: number; team: number }
  >();
  for (let i = 0; i < input.count; i++) {
    if ((input.alive[i] ?? 0) <= 0.5) continue;
    const unit = input.soldierUnit[i] ?? 0;
    const x = input.positions[i * 2];
    const y = input.positions[i * 2 + 1];
    const prev = bounds.get(unit);
    if (prev) {
      prev.x0 = Math.min(prev.x0, x);
      prev.y0 = Math.min(prev.y0, y);
      prev.x1 = Math.max(prev.x1, x);
      prev.y1 = Math.max(prev.y1, y);
    } else {
      bounds.set(unit, { x0: x, y0: y, x1: x, y1: y, team: input.unitTeam[unit] ?? 0 });
    }
  }
  const verts: number[] = [];
  for (const bound of bounds.values()) {
    const x0 = bound.x0 - BLOCK_PADDING;
    const y0 = bound.y0 - BLOCK_PADDING;
    const x1 = bound.x1 + BLOCK_PADDING;
    const y1 = bound.y1 + BLOCK_PADDING;
    const color = bound.team === 1 ? TEAM_ONE_COLOR : OTHER_TEAM_COLOR;
    pushTriangle(verts, x0, y0, x1, y0, x1, y1, color);
    pushTriangle(verts, x0, y0, x1, y1, x0, y1, color);
  }
  return new Float32Array(verts);
}

function pushTriangle(
  verts: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  color: [number, number, number, number],
): void {
  verts.push(ax, ay, ...color, bx, by, ...color, cx, cy, ...color);
}
