import type { SoldierPlayback } from "./actionTimeline";

export interface CrowdBuildInputs {
  positions: Float32Array;
  facings?: Float32Array;
  playback: readonly SoldierPlayback[];
  alive?: Float32Array | Uint8Array;
  soldierUnit?: Uint32Array;
  unitTeam?: Uint8Array | number[];
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
  clip: string;
  phase: number;
  /** Timeline payload retained for slice06 skin blending/composition. */
  playback?: SoldierPlayback;
  seed: number;
  /** This class rides a mount (horse). Drives LOD scale and mount composition. */
  mounted: boolean;
  /** Mesh tier 0=full … 3=impostor, assigned per-instance by camera distance. */
  lod: number;
  /** Render-only terrain height at (x,y); added to world Z so soldiers sit on
   *  the surface and sort by it. Sim positions are unaffected. */
  elevation?: number;
}

/** Coherent dead submissions enter corpse effects with the death blend, not clip phase. */
export function corpsePresentationStrength(
  instance: Pick<CrowdInstance, "alive" | "playback">,
): number {
  return instance.alive ? 0 : (instance.playback?.base.weight ?? 1);
}

export interface CrowdBuildStats {
  input: number;
  written: number;
  alive: number;
  player: number;
  enemy: number;
}

/** Refresh caller-owned instances in place; playback remains the animation authority. */
export function buildCrowdInstances(
  inputs: CrowdBuildInputs,
  instances: CrowdInstance[] = [],
): {
  instances: CrowdInstance[];
  stats: CrowdBuildStats;
} {
  const count = inputs.count ?? Math.floor(inputs.positions.length / 2);
  if (inputs.playback.length !== count) throw new Error("Playback count must match soldier count");
  const mountedClasses = new Set(inputs.mountedClasses ?? []);
  const stats: CrowdBuildStats = { input: count, written: 0, alive: 0, player: 0, enemy: 0 };
  for (let i = 0; i < count; i++) {
    const unit = inputs.soldierUnit?.[i] ?? 0;
    const faction = ((inputs.unitTeam?.[unit] ?? 0) === 1 ? 1 : 0) as 0 | 1;
    const playback = inputs.playback[i];
    const classId = playback.appearanceId;
    const alive = (inputs.alive?.[i] ?? 1) > 0.5;
    const inst = (instances[i] ??= {
      x: 0,
      y: 0,
      facing: 0,
      classId: 0,
      faction: 0,
      alive: true,
      clip: playback.base.destination.clip,
      phase: 0,
      seed: 0,
      mounted: false,
      lod: 0,
    });
    inst.x = inputs.positions[i * 2];
    inst.y = inputs.positions[i * 2 + 1];
    inst.facing = inputs.facings?.[i] ?? (faction === 0 ? Math.PI / 2 : -Math.PI / 2);
    inst.classId = classId;
    inst.faction = faction;
    inst.alive = alive;
    inst.clip = playback.base.destination.clip;
    inst.phase = playback.base.destination.phase;
    inst.playback = playback;
    inst.seed = deterministicInstanceSeed(i, unit);
    inst.mounted = mountedClasses.has(classId);
    inst.lod = 0;
    inst.elevation = inputs.terrainHeight ? inputs.terrainHeight(inst.x, inst.y) : 0;
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

export function generatedFormation(
  count: number,
  opts: {
    columns?: number;
    spacing?: number;
    x?: number;
    y?: number;
    faction?: 0 | 1;
    classId?: number;
    clip?: string;
    phase?: number;
    mounted?: boolean;
  } = {},
): CrowdInstance[] {
  const columns = opts.columns ?? Math.max(8, Math.ceil(Math.sqrt(count)));
  const spacing = opts.spacing ?? 1.15;
  const faction = opts.faction ?? 0;
  const rows = Math.ceil(count / columns);
  const out: CrowdInstance[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const seed = deterministicInstanceSeed(i, faction);
    out.push({
      x: (opts.x ?? 0) + (col - (columns - 1) * 0.5) * spacing,
      y: (opts.y ?? 0) + (row - (rows - 1) * 0.5) * spacing,
      facing: faction === 0 ? Math.PI / 2 : -Math.PI / 2,
      classId: opts.classId ?? 0,
      faction,
      alive: true,
      clip: opts.clip ?? "march",
      phase: opts.phase ?? 0,
      seed,
      mounted: opts.mounted ?? false,
      lod: 0,
    });
  }
  return out;
}
