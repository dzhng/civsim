import { type CrowdInstance, deterministicInstanceSeed } from "./instanceData";

// Representative figures for one campaign army stack. A stack can hold hundreds
// of soldiers across up to ARMY_STACK_UNIT_CAP units, but we only ever draw a
// handful of figures: the count scales with the stack's unit fill (a full stack
// shows `maxFigures`, a near-empty one shows 1), and WHICH figures appear is
// sampled from the roster's class proportions by largest-remainder — so a
// spear-heavy army reads as mostly spears. Pure and deterministic (seeded by the
// army id) so frozen snapshots are stable and figures don't churn frame to frame.

export interface StackCrowdOpts {
  /** Live units in this stack (drives figure count against the cap). */
  unitCount: number;
  /** ARMY_STACK_UNIT_CAP — a full stack shows `maxFigures`. */
  stackUnitCap: number;
  x: number;
  y: number;
  faction: 0 | 1 | 2;
  /** Army id (or any stable id) — seeds layout jitter + animation offsets. */
  seed: number;
  /** Facing for the whole stack (radians). Default faces +y like a player unit. */
  facing?: number;
  /** Animation clip all figures play (e.g. 'idle' | 'march'). Default 'march'. */
  clip?: string;
  /** Base animation phase (0..1) from the campaign clock; per-figure offset added. */
  phase?: number;
  /** Class ids that ride a mount, so mounted figures scale/compose correctly. */
  mountedClasses?: Iterable<number>;
  /** Render-only height sampler; sets each figure's elevation so feet ride relief. */
  terrainHeight?: (x: number, y: number) => number;
  /** Hard cap on figures per stack (design: 6). */
  maxFigures?: number;
  /** Figure spacing in world units. */
  spacing?: number;
}

/** How many figures represent a stack of `unitCount` units against the cap. */
export function stackFigureCount(unitCount: number, stackUnitCap: number, maxFigures = 6): number {
  const cap = Math.max(1, stackUnitCap);
  return Math.max(1, Math.min(maxFigures, Math.round((maxFigures * Math.max(0, unitCount)) / cap)));
}

/** Allocate `figures` slots across classes by roster proportions (largest
 *  remainder). Returns a class id per figure, ascending so layout is stable. */
export function sampleFigureClasses(unitsByClass: readonly number[], figures: number): number[] {
  const total = unitsByClass.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (figures <= 0) return [];
  if (total <= 0) return new Array(figures).fill(0);
  const exact = unitsByClass.map((n) => (figures * Math.max(0, n)) / total);
  const counts = exact.map((e) => Math.floor(e));
  let assigned = counts.reduce((sum, n) => sum + n, 0);
  const byRemainder = exact
    .map((e, c) => ({ c, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.c - b.c);
  // The leftover slots (figures - sum of floors) equal the sum of the fractional
  // parts, a whole number strictly less than the class count, so k never exceeds
  // byRemainder's length.
  for (let k = 0; assigned < figures; k++, assigned++) {
    counts[byRemainder[k].c]++;
  }
  const out: number[] = [];
  for (let c = 0; c < counts.length; c++) {
    for (let i = 0; i < counts[c]; i++) out.push(c);
  }
  return out;
}

export function buildStackCrowd(
  unitsByClass: readonly number[],
  opts: StackCrowdOpts,
): CrowdInstance[] {
  const figures = stackFigureCount(opts.unitCount, opts.stackUnitCap, opts.maxFigures ?? 6);
  const classIds = sampleFigureClasses(unitsByClass, figures);
  const mounted = new Set(opts.mountedClasses ?? []);
  const facing = opts.facing ?? Math.PI / 2;
  const clip = opts.clip ?? "march";
  const basePhase = opts.phase ?? 0;
  const spacing = opts.spacing ?? 1.3;
  const cols = Math.min(3, figures);
  const rows = Math.ceil(figures / cols);
  const out: CrowdInstance[] = [];
  for (let i = 0; i < figures; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Center each row (the last row may be partial) so the block is symmetric.
    const rowCount = row === rows - 1 ? figures - row * cols : cols;
    const seed = deterministicInstanceSeed(i, opts.seed);
    // Small deterministic jitter so the block reads as men, not a lattice.
    const jx = ((seed & 0xff) / 255 - 0.5) * spacing * 0.35;
    const jy = (((seed >>> 8) & 0xff) / 255 - 0.5) * spacing * 0.35;
    const fx = opts.x + (col - (rowCount - 1) / 2) * spacing + jx;
    const fy = opts.y + (row - (rows - 1) / 2) * spacing + jy;
    const classId = Math.max(0, classIds[i] ?? 0);
    out.push({
      x: fx,
      y: fy,
      facing,
      classId,
      faction: opts.faction,
      alive: true,

      clip,
      // Offset each figure so the stack doesn't animate in lockstep.
      phase: (basePhase + (seed % 997) / 997) % 1,
      seed,
      mounted: mounted.has(classId),
      lod: 0,
      elevation: opts.terrainHeight ? opts.terrainHeight(fx, fy) : 0,
    });
  }
  return out;
}
