import { MeshBuilder } from "../models/shared/meshBuilder";
import type { BattleEdgeRole, BattleEdgeRoles } from "./terrainFeatures";
import { terrainHeightAt, type TerrainHeightField } from "../terrain/heightField";

// The sealed-side backdrop: the west/east edges read at a glance as the blocker
// the sim already enforces — cliffs/mountains as a tall stone ridge, a wall as a
// crenellated rampart, ocean as open water — while the open north/south edges
// dissolve into distance haze (the scene's clear colour). Presentation only; the
// passability lives in the terrain masks.

const STONE: [number, number, number] = [0.47, 0.44, 0.39];
const STONE_TOP: [number, number, number] = [0.6, 0.57, 0.51];
const WALL: [number, number, number] = [0.55, 0.52, 0.47];
const WALL_TOP: [number, number, number] = [0.64, 0.61, 0.55];
// Neutral light-grey atmospheric haze the distant blockers dissolve into. Kept
// off-blue so far peaks read as hazy stone, not as slivers of water or sky.
const HAZE: [number, number, number] = [0.8, 0.81, 0.83];

/** Envelope of the sealed-edge blocker mesh, relative to the edge line and the
 *  edge's ground datum. Its peaks stand an order of magnitude higher than
 *  anything on the field, so the shadow fit
 *  (battle/shadowPolicy.ts) carries this band as a receiver domain of its own
 *  rather than stretching the field's slab up to reach it.
 *
 *  `reach` stops at the outermost peak. Past it the apron is a receding quad
 *  graded into HAZE, outside the blocker receiver domain. Only the west and
 *  east edges are built; north/south dissolve into fog. */
export const BATTLE_HORIZON_BOUNDS = {
  /** Outward from the edge line, past the far row's widest peak ring. */
  reach: 600,
  /** Inward past the edge line — the near row's skirt laps onto the field. */
  lap: 140,
  /** Above the edge datum: the tallest jittered peak. */
  ceiling: 300,
  /** Below the edge datum, within `reach`: the apron falling away. */
  drop: 60,
  /** Past the field's y ends, where the apron and the peak rows overrun. */
  overhang: 400,
} as const;

// The ocean starts at the drawn ground edge and extends past the horizon.
const OCEAN_FAR = 7200;
const OCEAN_RES = 440;

/** The sealed-edge presentation, CPU-built: blocker mesh (MeshBuilder stride-10
 *  vertices) + the ocean plane specs (rect + shoreline datum). The photoreal
 *  battle world seals edges from this shared geometry. */
export interface BattleOceanPlaneSpec {
  rect: { x0: number; y0: number; x1: number; y1: number; res: number };
  baseZ: number;
  shoreX: number;
  /** Drawn edge knots, preserving the ground mesh's interpolation. */
  edge: Array<{ y: number; z: number; water: number }>;
}

export interface BattleHorizonLayout {
  mesh: { vertices: Float32Array; indices: Uint16Array };
  oceanPlanes: BattleOceanPlaneSpec[];
  builtEdges: Array<{ side: keyof BattleEdgeRoles; role: BattleEdgeRole }>;
}

export function buildBattleHorizonLayout(
  bounds: { ox: number; oy: number; w: number; h: number; cell: number },
  edges: BattleEdgeRoles,
  field: TerrainHeightField,
  groundVertices: Float32Array,
): BattleHorizonLayout {
  const builder = new MeshBuilder();
  const layout: BattleHorizonLayout = {
    mesh: { vertices: new Float32Array(), indices: new Uint16Array() },
    oceanPlanes: [],
    builtEdges: [],
  };
  const x0 = bounds.ox;
  const x1 = bounds.ox + bounds.w * bounds.cell;
  const y0 = bounds.oy;
  const y1 = bounds.oy + bounds.h * bounds.cell;
  const midY = (y0 + y1) * 0.5;
  buildHorizonEdge(
    builder,
    layout,
    edges.west,
    "west",
    x0,
    y0,
    y1,
    terrainHeightAt(field, x0, midY),
    groundVertices,
  );
  buildHorizonEdge(
    builder,
    layout,
    edges.east,
    "east",
    x1,
    y0,
    y1,
    terrainHeightAt(field, x1, midY),
    groundVertices,
  );
  // North/south stay open — they read as fog against the scene clear colour.
  const mesh = builder.finish("battle horizon");
  layout.mesh = { vertices: mesh.opaque.vertices, indices: mesh.opaque.indices };
  return layout;
}

function buildHorizonEdge(
  builder: MeshBuilder,
  layout: BattleHorizonLayout,
  role: BattleEdgeRole,
  side: keyof BattleEdgeRoles,
  edgeX: number,
  y0: number,
  y1: number,
  baseZ: number,
  groundVertices: Float32Array,
) {
  if (role === "open-fog") return;
  layout.builtEdges.push({ side, role });
  const outward = side === "west" ? -1 : 1;
  const span = y1 - y0;
  const midY = (y0 + y1) * 0.5;
  const yLo = y0 - 400;
  const yHi = y1 + 400;

  if (role === "ocean") {
    // Join the actual sampled ground edge, not the sim bounds or a midpoint
    // plane. Keeping its knots prevents cracks on non-flat shoreline rows.
    let inner = side === "west" ? Infinity : -Infinity;
    for (let i = 0; i < groundVertices.length; i += 10)
      inner =
        side === "west" ? Math.min(inner, groundVertices[i]) : Math.max(inner, groundVertices[i]);
    const edge: BattleOceanPlaneSpec["edge"] = [];
    for (let i = 0; i < groundVertices.length; i += 10)
      if (groundVertices[i] === inner)
        edge.push({
          y: groundVertices[i + 1],
          z: groundVertices[i + 2],
          water: groundVertices[i + 9],
        });
    edge.sort((a, b) => a.y - b.y);
    const outer = edgeX + outward * OCEAN_FAR;
    const rect = {
      x0: Math.min(inner, outer),
      y0: yLo,
      x1: Math.max(inner, outer),
      y1: yHi,
      res: OCEAN_RES,
    };
    layout.oceanPlanes.push({ rect, baseZ, shoreX: inner, edge });
    return;
  }

  // Every land/wall edge first fills the world beyond it with a receding apron
  // that drops away and hazes into the horizon, so the boundary reads as ground
  // falling off — never a white void or see-through gaps behind the blocker.
  const apronNear = edgeX + outward * 12;
  const apronFar = edgeX + outward * 2600;

  if (role === "wall") {
    builder.gradQuad(
      [apronNear, yLo, baseZ - 2],
      [apronFar, yLo, baseZ - 120],
      [apronFar, yHi, baseZ - 120],
      [apronNear, yHi, baseZ - 2],
      mix3(STONE, HAZE, 0.4),
      HAZE,
    );
    // A solid coursed rampart lapping the turf edge: a darker base course under
    // a lighter wall face so it reads as masonry with depth, capped by merlons —
    // a wall you cannot cross, not a flat band with a dotted edge.
    const wallX = edgeX + outward * 20;
    const wallH = 120;
    builder.box(
      [wallX, midY, baseZ - 4 + wallH * 0.18],
      [70, span + 220, wallH * 0.36],
      mix3(WALL, [0, 0, 0], 0.34),
      1,
    );
    builder.box([wallX, midY, baseZ - 4 + wallH / 2], [62, span + 220, wallH], WALL, 1);
    const merlons = Math.max(10, Math.round(span / 90));
    for (let k = 0; k <= merlons; k += 2) {
      const y = y0 - 80 + ((span + 160) * k) / merlons;
      builder.box([wallX, y, baseZ - 4 + wallH + 16], [72, 44, 34], WALL_TOP, 1);
    }
    return;
  }

  // Cliff / mountain: the apron is bare rock falling away; over it a continuous
  // hazed back ridge seals the silhouette (no sky showing between peaks) and
  // sharp near peaks break it, so the range reads with real depth — not a flat
  // sawtooth fence.
  builder.gradQuad(
    [apronNear, yLo, baseZ - 6],
    [apronFar, yLo, baseZ - 200],
    [apronFar, yHi, baseZ - 200],
    [apronNear, yHi, baseZ - 6],
    mix3(STONE, HAZE, 0.25),
    HAZE,
  );
  const sideSalt = side === "west" ? 11 : 23;
  // `gap` sets spacing as a multiple of radius: near row sparse for a varied
  // skyline, far row dense so its overlapping peaks form an unbroken seal.
  const rows = [
    { dist: 6, radius: 80, height: 86, fog: 0.0, gap: 1.25, salt: 3 },
    { dist: 90, radius: 120, height: 150, fog: 0.28, gap: 0.85, salt: 31 },
    { dist: 210, radius: 170, height: 226, fog: 0.55, gap: 0.5, salt: 57 },
  ];
  for (const row of rows) {
    const stepN = Math.max(10, Math.round(span / (row.radius * row.gap)));
    const baseC = mix3(STONE, HAZE, row.fog);
    const topC = mix3(STONE_TOP, HAZE, row.fog);
    for (let k = 0; k <= stepN; k++) {
      const y = y0 - 100 + ((span + 200) * k) / stepN;
      const jx = hash(k, sideSalt + row.salt);
      const cx = edgeX + outward * (row.dist + jx * row.radius * 0.5);
      const radius = row.radius * (0.78 + hash(k, 7 + row.salt) * 0.5);
      const height = row.height * (0.74 + hash(k, 5 + row.salt) * 0.55);
      builder.peak([cx, y, baseZ - 6], radius, height, 7, baseC, topC, k * 7 + 3 + row.salt);
    }
  }
}

function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hash(k: number, salt: number): number {
  let n = Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
