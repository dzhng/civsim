import { animationForSoldierFrame } from './animationState';

export interface CrowdBuildInputs {
  positions: Float32Array;
  facings?: Float32Array;
  frames?: Float32Array;
  alive?: Float32Array | Uint8Array;
  soldierUnit?: Uint32Array;
  unitTeam?: Uint8Array | number[];
  unitClass?: Uint8Array | number[];
  simTick?: number;
  count?: number;
  /** Class ids that ride a mount (from archetype.mount). Drives `mounted`. */
  mountedClasses?: Iterable<number>;
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
}

export interface CrowdBuildStats {
  input: number;
  written: number;
  alive: number;
  player: number;
  enemy: number;
}

export interface CrowdInstanceBuffers {
  packed: Float32Array;
  instances: CrowdInstance[];
}

export function buildCrowdInstances(inputs: CrowdBuildInputs): CrowdInstanceBuffers & { stats: CrowdBuildStats } {
  const count = inputs.count ?? Math.floor(inputs.positions.length / 2);
  const mountedClasses = new Set(inputs.mountedClasses ?? []);
  const packed = new Float32Array(count * 12);
  const instances: CrowdInstance[] = [];
  const stats: CrowdBuildStats = { input: count, written: 0, alive: 0, player: 0, enemy: 0 };
  for (let i = 0; i < count; i++) {
    const unit = inputs.soldierUnit?.[i] ?? 0;
    const faction = ((inputs.unitTeam?.[unit] ?? 0) === 1 ? 1 : 0) as 0 | 1;
    const classId = inputs.unitClass?.[unit] ?? 0;
    const alive = (inputs.alive?.[i] ?? 1) > 0.5;
    const frame = inputs.frames?.[i] ?? 0;
    const anim = animationForSoldierFrame(frame, {
      soldierIndex: i,
      unitIndex: unit,
      simTick: inputs.simTick ?? 0,
      alive,
    });
    const seed = deterministicInstanceSeed(i, unit);
    const inst: CrowdInstance = {
      x: inputs.positions[i * 2],
      y: inputs.positions[i * 2 + 1],
      facing: inputs.facings?.[i] ?? (faction === 0 ? Math.PI / 2 : -Math.PI / 2),
      classId,
      faction,
      alive,
      frame,
      clip: anim.clip,
      phase: anim.phase,
      seed,
      mounted: mountedClasses.has(classId),
      lod: 0,
    };
    instances.push(inst);
    const o = stats.written * 12;
    packed[o] = inst.x;
    packed[o + 1] = inst.y;
    packed[o + 2] = inst.facing;
    packed[o + 3] = inst.classId;
    packed[o + 4] = inst.faction;
    packed[o + 5] = inst.alive ? 1 : 0;
    packed[o + 6] = frame;
    packed[o + 7] = anim.phase;
    packed[o + 8] = seed;
    packed[o + 9] = unit;
    packed[o + 10] = inst.mounted ? 1 : 0;
    packed[o + 11] = 0;
    stats.written++;
    if (alive) stats.alive++;
    if (faction === 0) stats.player++;
    if (faction === 1) stats.enemy++;
  }
  return { packed: packed.subarray(0, stats.written * 12), instances, stats };
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

