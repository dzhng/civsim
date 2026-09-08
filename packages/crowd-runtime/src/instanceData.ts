import { animationForSoldierFrame } from './animationState';

export interface CrowdBuildInputs {
  positions: Float32Array;
  facings?: Float32Array;
  frames?: Float32Array;
  alive?: Float32Array | Uint8Array;
  soldierUnit?: Uint32Array;
  unitTeam?: Uint8Array | number[];
  unitClass?: Uint8Array | number[];
  /** Optional per-soldier render-only class override for weapon-state variants. */
  renderClass?: Uint8Array | number[];
  simTick?: number;
  count?: number;
  /** Class ids that ride a mount (from archetype.mount). Drives `mounted`. */
  mountedClasses?: Iterable<number>;
  /** Render-only terrain height sampler at world (x,y) — the same source that
   *  feeds the battle terrain. Sets each instance's `elevation`. */
  terrainHeight?: (x: number, y: number) => number;
}

export interface CrowdInstance {
  x: number;
  y: number;
  facing: number;
  classId: number;
  faction: 0 | 1 | 2;
  alive: boolean;
  frame: number;
  clip: string;
  phase: number;
  seed: number;
  /** This class rides a mount (horse). Drives LOD scale and mount composition. */
  mounted: boolean;
  /** Mesh tier 0=full … 3=impostor, assigned per-instance by camera distance. */
  lod: number;
  /** Render-only terrain height at (x,y); added to world Z so soldiers sit on
   *  the surface and sort by it. Sim positions are unaffected. */
  elevation?: number;
  /** 0..2 corpse variant for fallen soldiers — varies fall roll + reaches the
   *  GPU so the field of dead reads as varied, not one frozen pose. */
  deathVariant?: number;
}

export interface CrowdBuildStats {
  input: number;
  written: number;
  alive: number;
  player: number;
  enemy: number;
}

/** Build (or refresh) the per-soldier render instances from the sim's flat
 *  arrays. Pass the previous frame's `pool` to refresh its objects in place:
 *  the crowd is rebuilt every frame, and 30k fresh objects a frame is pure
 *  garbage-collector load. The pool is truncated to the written count. */
export function buildCrowdInstances(
  inputs: CrowdBuildInputs,
  pool: CrowdInstance[] = [],
): { instances: CrowdInstance[]; stats: CrowdBuildStats } {
  const count = inputs.count ?? Math.floor(inputs.positions.length / 2);
  const mountedClasses = new Set(inputs.mountedClasses ?? []);
  const instances = pool;
  const stats: CrowdBuildStats = { input: count, written: 0, alive: 0, player: 0, enemy: 0 };
  for (let i = 0; i < count; i++) {
    const unit = inputs.soldierUnit?.[i] ?? 0;
    const faction = ((inputs.unitTeam?.[unit] ?? 0) === 1 ? 1 : 0) as 0 | 1;
    const classId = inputs.renderClass?.[i] ?? inputs.unitClass?.[unit] ?? 0;
    const alive = (inputs.alive?.[i] ?? 1) > 0.5;
    const frame = inputs.frames?.[i] ?? 0;
    const anim = animationForSoldierFrame(frame, {
      soldierIndex: i,
      unitIndex: unit,
      simTick: inputs.simTick ?? 0,
      alive,
    });
    const x = inputs.positions[i * 2];
    const y = inputs.positions[i * 2 + 1];
    let inst = instances[i];
    if (inst === undefined) {
      inst = {
        x: 0,
        y: 0,
        facing: 0,
        classId: 0,
        faction: 0,
        alive: true,
        frame: 0,
        clip: "idle",
        phase: 0,
        seed: 0,
        mounted: false,
        lod: 0,
        elevation: 0,
        deathVariant: 0,
      };
      instances[i] = inst;
    }
    inst.x = x;
    inst.y = y;
    inst.facing = inputs.facings?.[i] ?? (faction === 0 ? Math.PI / 2 : -Math.PI / 2);
    inst.classId = classId;
    inst.faction = faction;
    inst.alive = alive;
    inst.frame = frame;
    inst.clip = anim.clip;
    inst.phase = anim.phase;
    inst.seed = deterministicInstanceSeed(i, unit);
    inst.mounted = mountedClasses.has(classId);
    inst.lod = 0;
    inst.elevation = inputs.terrainHeight ? inputs.terrainHeight(x, y) : 0;
    inst.deathVariant = anim.deathVariant;
    stats.written++;
    if (alive) stats.alive++;
    if (faction === 0) stats.player++;
    if (faction === 1) stats.enemy++;
  }
  instances.length = stats.written;
  return { instances, stats };
}

export function deterministicInstanceSeed(index: number, unit: number): number {
  let x = (Math.imul(index + 101, 0x9e3779b1) ^ Math.imul(unit + 7, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

export function generatedFormation(count: number, opts: {
  columns?: number;
  spacing?: number;
  x?: number;
  y?: number;
  faction?: 0 | 1;
  classId?: number;
  frame?: number;
  mounted?: boolean;
} = {}): CrowdInstance[] {
  const columns = opts.columns ?? Math.max(8, Math.ceil(Math.sqrt(count)));
  const spacing = opts.spacing ?? 1.15;
  const faction = opts.faction ?? 0;
  const rows = Math.ceil(count / columns);
  const out: CrowdInstance[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const seed = deterministicInstanceSeed(i, faction);
    const anim = animationForSoldierFrame(opts.frame ?? 1, { soldierIndex: i, unitIndex: faction, simTick: 120 });
    out.push({
      x: (opts.x ?? 0) + (col - (columns - 1) * 0.5) * spacing,
      y: (opts.y ?? 0) + (row - (rows - 1) * 0.5) * spacing,
      facing: faction === 0 ? Math.PI / 2 : -Math.PI / 2,
      classId: opts.classId ?? 0,
      faction,
      alive: true,
      frame: opts.frame ?? 1,
      clip: anim.clip,
      phase: anim.phase,
      seed,
      mounted: opts.mounted ?? false,
      lod: 0,
    });
  }
  return out;
}
