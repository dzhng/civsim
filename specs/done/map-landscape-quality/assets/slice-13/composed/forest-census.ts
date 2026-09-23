import { readFileSync, writeFileSync } from "node:fs";
import init, { Game } from "../../../../../web/src/wasm/game_wasm.js";
import { readBattleTerrainGrid } from "../../../../../packages/game-renderer/src/battle/terrainGrid";
import {
  extractBattleTerrainFeatures,
  terrainHeightField,
} from "../../../../../packages/game-renderer/src/battle/terrainFeatures";
import { featuresToBattleScenery } from "../../../../../packages/game-renderer/src/battle/terrainScenery";
import { terrainScatterCandidates } from "../../../../../packages/game-renderer/src/terrain/scatter";
import { terrainNormalAt } from "../../../../../packages/game-renderer/src/terrain/heightField";
import { SCENERY_PROP_MODELS } from "../../../../../packages/game-renderer/src/models/shared/sceneryPropRegistry";
import { TREE_VARIANTS } from "../../../../../packages/game-renderer/src/models/shared/sceneryPropModels";
const wasm = await init({
  module_or_path: readFileSync(
    new URL("../../../../../web/src/wasm/game_wasm_bg.wasm", import.meta.url),
  ),
});
const game = new Game(42);
game.load_generated_map(8n);
const descriptor = JSON.parse(game.generated_map_descriptor());
const grid = readBattleTerrainGrid(game, wasm.memory),
  field = { ...terrainHeightField(grid), verticalScale: descriptor.reliefScale };
const features = extractBattleTerrainFeatures(grid, 0x5eed).filter((f) => f.kind === "forest");
const allForest = new Set<number>();
for (let i = 0; i < grid.tint.length; i++) if (grid.tint[i] === 4) allForest.add(i);
const sampleCell = (x: number, y: number) => {
  const cx = Math.floor((x - grid.ox) / grid.cell),
    cy = Math.floor((y - grid.oy) / grid.cell);
  return cx >= 0 && cy >= 0 && cx < grid.w && cy < grid.h ? cy * grid.w + cx : -1;
};
const resolution = Number(process.env.CENSUS_RESOLUTION ?? 0.5),
  stride = Math.ceil((grid.w * grid.cell) / resolution);
const totalCoverage = new Set<number>();
const models = new Map<
  string,
  ReturnType<(typeof SCENERY_PROP_MODELS)["conifer"]["build"]>["opaque"]
>();
function cover(instances: ReturnType<typeof featuresToBattleScenery>, cells: Set<number>) {
  const covered = new Set<number>();
  let footprintArea = 0;
  for (const inst of instances) {
    let h =
      Math.imul(Math.round(inst.x * 1000), 73856093) ^
      Math.imul(Math.round(inst.y * 1000), 19349663);
    h ^= h >>> 16;
    const variant = (h >>> 0) % TREE_VARIANTS;
    const key = inst.kind + variant;
    let mesh = models.get(key);
    if (!mesh) {
      mesh = SCENERY_PROP_MODELS[inst.kind].build("canopy", variant).opaque;
      models.set(key, mesh);
    }
    const cos = Math.cos(inst.yaw ?? 0),
      sin = Math.sin(inst.yaw ?? 0),
      verts = [];
    for (let i = 0; i < mesh.vertices.length; i += 10) {
      const x = mesh.vertices[i] * inst.size,
        y = mesh.vertices[i + 1] * inst.size;
      verts.push([inst.x + x * cos - y * sin, inst.y + x * sin + y * cos]);
    }
    const treeFootprint = new Set<number>();
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = verts[mesh.indices[i]],
        b = verts[mesh.indices[i + 1]],
        c = verts[mesh.indices[i + 2]];
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(det) < 1e-9) continue;
      const minx = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - grid.ox) / resolution)),
        maxx = Math.min(
          stride - 1,
          Math.floor((Math.max(a[0], b[0], c[0]) - grid.ox) / resolution),
        );
      const miny = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - grid.oy) / resolution)),
        maxy = Math.min(
          Math.ceil((grid.h * grid.cell) / resolution) - 1,
          Math.floor((Math.max(a[1], b[1], c[1]) - grid.oy) / resolution),
        );
      for (let py = miny; py <= maxy; py++)
        for (let px = minx; px <= maxx; px++) {
          const x = grid.ox + (px + 0.5) * resolution,
            y = grid.oy + (py + 0.5) * resolution;
          const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det,
            v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
          if (u < 0 || v < 0 || u + v > 1) continue;
          treeFootprint.add(py * stride + px);
          if (cells.has(sampleCell(x, y))) covered.add(py * stride + px);
        }
    }
    footprintArea += treeFootprint.size * resolution * resolution;
  }
  for (const p of covered) totalCoverage.add(p);
  return {
    summedTreeProjectedFootprintM2: footprintArea,
    unionCanopyOverOwnForestM2: covered.size * resolution * resolution,
    canopyCoverageFraction:
      (covered.size * resolution * resolution) / (cells.size * grid.cell ** 2),
  };
}
const rows = [];
for (const [index, f] of features.entries()) {
  const cells = new Set(f.cells),
    bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const cell of cells) {
    const x = grid.ox + (cell % grid.w) * grid.cell,
      y = grid.oy + Math.floor(cell / grid.w) * grid.cell;
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x + grid.cell);
    bounds[3] = Math.max(bounds[3], y + grid.cell);
  }
  let lattice = 0,
    membership = 0,
    slopeRejected = 0;
  for (const p of terrainScatterCandidates(bounds, 9.6, 0x77)) {
    lattice++;
    if (!cells.has(sampleCell(p.x, p.y))) continue;
    membership++;
    if (terrainNormalAt(field, p.x, p.y)[2] < 0.82) slopeRejected++;
  }
  const eligible = membership - slopeRejected,
    kept = featuresToBattleScenery([f], field, 0x77, grid);
  if (kept.length !== Math.min(eligible, 240)) throw Error("Census diverges from actual placement");
  rows.push({
    index,
    sourceCells: cells.size,
    areaM2: cells.size * grid.cell ** 2,
    bounds,
    latticeCandidates: lattice,
    membershipRejected: lattice - membership,
    membershipAccepted: membership,
    slopeRejected,
    eligible,
    placed: kept.length,
    capRejected: eligible - kept.length,
    ...cover(kept, cells),
  });
}
const actual = featuresToBattleScenery(
  extractBattleTerrainFeatures(grid, 0x5eed),
  field,
  0x77,
  grid,
).filter((i) => SCENERY_PROP_MODELS[i.kind].family === "tree");
const totals = Object.fromEntries(
  [
    "sourceCells",
    "areaM2",
    "latticeCandidates",
    "membershipRejected",
    "membershipAccepted",
    "slopeRejected",
    "eligible",
    "placed",
    "capRejected",
    "summedTreeProjectedFootprintM2",
  ].map((k) => [k, rows.reduce((n, r) => n + r[k], 0)]),
);
if (totals.placed !== actual.length) throw Error("Actual full placement count differs");
const report = {
  seed: 8,
  rasterResolutionM: resolution,
  manifest: JSON.parse(game.generated_map_manifest()),
  descriptor,
  method:
    "CPU, actual wasm physical source, production extraction seed0x5eed/scatter seed0x77 and placement. Candidate counters mirror predicates and reconcile actual outputs. Canopy footprint rasterizes actual coarse opaque model XY triangles at the recorded raster resolution cell centers, with production variant/yaw/scale; union clipped to each exact source forest component. This measures top-down geometric footprint, not perspective visible pixels or leaf transparency.",
  totalSourceForestCells: allForest.size,
  totals: {
    ...totals,
    unionCanopyOverOwnForestM2: totalCoverage.size * resolution ** 2,
    canopyCoverageFraction:
      (totalCoverage.size * resolution ** 2) / (allForest.size * grid.cell ** 2),
  },
  forests: rows,
};
writeFileSync(
  new URL("./forest-census.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report.totals, null, 2));
game.free();
