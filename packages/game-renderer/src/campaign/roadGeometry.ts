import type { CampaignSeaLabelFit } from "@packages/game-renderer/src/campaign/labelLayout";
import type { CampaignLabel } from "@packages/game-renderer/src/campaign/labelFrame";
import { fitSeaLabels } from "@packages/game-renderer/src/campaign/labelLayout";
import { SEA_LABEL_FIT_ZOOM, seaLabels } from "@packages/game-renderer/src/campaign/seaLabels";

interface CampaignMapNodeData {
  id?: number;
  name: string;
  pos: [number, number];
  kind: "city" | "junction";
  tier: number;
  owner: string;
}

interface CampaignMapEdgeData {
  a?: number;
  b?: number;
  kind: "road" | "sea";
  via: [number, number][];
}

interface CampaignMapFactionData {
  id: string;
  color: [number, number, number];
}

interface CampaignMapInputData {
  map: {
    nodes: CampaignMapNodeData[];
    edges: CampaignMapEdgeData[];
    factions: CampaignMapFactionData[];
  };
}

export interface CampaignMapStats {
  roads: number;
  seaLanes: number;
  lineVertices: number;
  roadMeshVertices: number;
  roadJunctionCaps: number;
  /** Road edges dropped whole because their centerline is mostly water. */
  roadEdgesCulled: number;
  /** Unbridged water gaps where a drawn road ribbon stops at a shore. */
  roadWaterGaps: number;
  labels: number;
  seaLabelFits: CampaignSeaLabelFit[];
  seaLabelFitZoom: number;
}

export interface CampaignMapDrawStyle {
  roadScale?: number;
  /** Road land test — point truth against the pixels the player sees (the
   * renderer supplies the full-res render mask). Roads draw where their
   * centerline is on rendered land; never used for label fitting. */
  roadSurfaceAt?: (x: number, y: number) => "land" | "water";
  /** Sea-label fitting only — an area statistic ("is this neighborhood
   * decisively land?"); the renderer supplies the coarse 8 km grid with a wide
   * inland margin. Deliberately NOT the road sampler: labels want area
   * statistics, roads want point truth. */
  surfaceAt?: (x: number, y: number) => "land" | "water";
  /** Full-resolution render-mask classifier (`TerrainField.renderLandAt`).
   * Point-truth queries — sea-label placement —
   * use this; the coarse `surfaceAt` stays the owner of area statistics,
   * while road drop decisions read `roadSurfaceAt`. */
  renderSurfaceAt?: (x: number, y: number) => "land" | "water";
  /** Smallest zoom the camera clamp allows (CSS px per km). Sea labels are
   * screen-space text, so their world footprint is widest here; the fitter
   * judges placements at this zoom. Defaults to SEA_LABEL_FIT_ZOOM. */
  seaLabelFitZoom?: number;
  heightAt?: (x: number, y: number) => number;
}

export interface CampaignMapDrawData {
  lineVertices: Float32Array;
  roadMeshVertices: Float32Array;
  /** XY centerline or junction center for each road mesh vertex. */
  roadAnchors: Float32Array;
  labels: CampaignLabel[];
  stats: CampaignMapStats;
}

export function buildCampaignMapDrawData(
  data: CampaignMapInputData,
  style: CampaignMapDrawStyle = {},
): CampaignMapDrawData {
  const roads = data.map.edges.filter((edge) => edge.kind === "road");
  const seaLanes = data.map.edges.filter((edge) => edge.kind === "sea");
  const lineVertices: number[] = [];
  const roadMeshVertices: number[] = [];
  const roadAnchors: number[] = [];
  const safeRoads: CampaignMapEdgeData[] = [];
  const roadAt = style.roadSurfaceAt;
  let roadEdgesCulled = 0;
  let roadWaterGaps = 0;
  for (const edge of data.map.edges) {
    if (edge.kind === "sea") pushEdgeLines(lineVertices, edge, style.heightAt);
    else if (roadEdgeIsLandSafe(edge, roadAt)) {
      safeRoads.push(edge);
      roadWaterGaps += pushRaisedRoad(roadMeshVertices, roadAnchors, edge, style, roadAt);
    } else {
      roadEdgesCulled++;
    }
  }
  const roadJunctionCaps = pushRoadJunctionCaps(
    roadMeshVertices,
    roadAnchors,
    data,
    safeRoads,
    style,
  );
  const seaLabelFit =
    data.map.nodes.length > 20
      ? fitSeaLabels(seaLabels(), style)
      : { labels: [], fits: [], fitZoom: SEA_LABEL_FIT_ZOOM };
  return {
    lineVertices: new Float32Array(lineVertices),
    roadMeshVertices: new Float32Array(roadMeshVertices),
    roadAnchors: new Float32Array(roadAnchors),
    labels: seaLabelFit.labels,
    stats: {
      roads: roads.length,
      seaLanes: seaLanes.length,
      lineVertices: Math.floor(lineVertices.length / 7),
      roadMeshVertices: Math.floor(roadMeshVertices.length / 10),
      roadJunctionCaps,
      roadEdgesCulled,
      roadWaterGaps,
      labels: seaLabelFit.labels.length,
      seaLabelFits: seaLabelFit.fits,
      seaLabelFitZoom: seaLabelFit.fitZoom,
    },
  };
}

// A SOLID sea lane draped over the water surface: xyz vertices (x, y, z, rgba)
// lifted onto the height-mapped water so the surface mesh no longer buries it,
// a dark outline under a bright core so it reads on BOTH deep (dark) and shallow
// (light) water. `heightAt` is the same water-surface sampler roads/borders use.
// Built as a CONTINUOUS strip with per-vertex averaged normals so consecutive
// segments share their offset corners at each waypoint — no notch gaps at bends.
function pushEdgeLines(
  out: number[],
  edge: CampaignMapEdgeData,
  heightAt?: (x: number, y: number) => number,
) {
  // Sit clearly above the animated water surface so waves never occlude it.
  const LANE_LIFT = 0.6;
  const pts = edge.via;
  if (pts.length < 2) return;
  // Unit normal at each waypoint, averaged from its neighbours so a shared
  // waypoint yields ONE offset point for both adjacent quads (a mitre join).
  const normals: [number, number][] = pts.map((_, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
  const strip = (halfWidth: number, color: [number, number, number, number]) => {
    const vert = (p: [number, number], n: [number, number], s: number) => {
      const x = p[0] + n[0] * s * halfWidth;
      const y = p[1] + n[1] * s * halfWidth;
      out.push(x, y, LANE_LIFT + (heightAt?.(x, y) ?? 0), ...color);
    };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const na = normals[i - 1];
      const nb = normals[i];
      // Two triangles (a-, b-, b+) and (a-, b+, a+), offset by each end's normal.
      vert(a, na, -1);
      vert(b, nb, -1);
      vert(b, nb, 1);
      vert(a, na, -1);
      vert(b, nb, 1);
      vert(a, na, 1);
    }
  };
  strip(1.8, [0.04, 0.1, 0.2, 0.95]);
  strip(1.0, [0.55, 0.82, 1.0, 1.0]);
}

/** Clearance of the visible road surface; road traffic shares this contact plane. */
export const CAMPAIGN_ROAD_SURFACE_LIFT = 0.32;

/** Returns the number of unbridged water gaps (drawn ribbon stops at a shore). */
function pushRaisedRoad(
  out: number[],
  anchors: number[],
  edge: CampaignMapEdgeData,
  style: CampaignMapDrawStyle,
  at?: (x: number, y: number) => "land" | "water",
): number {
  const roadScale = style.roadScale ?? 1;
  const halfWidth = 0.55 * roadScale;
  const { runs, gaps } = drawnRoadRuns(edge.via, at);
  for (const run of runs) {
    pushRoadRibbon(
      out,
      anchors,
      run,
      halfWidth * 1.58,
      0.18 * roadScale,
      [0.3, 0.27, 0.23, 0.78],
      0,
      style.heightAt,
    );
    pushRoadRibbon(
      out,
      anchors,
      run,
      halfWidth,
      CAMPAIGN_ROAD_SURFACE_LIFT * roadScale,
      [0.76, 0.74, 0.68, 0.98],
      1,
      style.heightAt,
    );
  }
  return gaps;
}

/** The exact centerline geometry the road pass draws: smoothed, resampled at
 * ROAD_SURFACE_SAMPLE_KM, split into land runs (short water dips bridged,
 * ferry straits split). Road decorations (carts) ride these same runs so they
 * follow the visible ribbon by construction. */
export function drawnRoadRuns(
  via: [number, number][],
  at?: (x: number, y: number) => "land" | "water",
): { runs: [number, number][][]; gaps: number } {
  if (via.length < 2) return { runs: [], gaps: 0 };
  const source = smoothRoadCenterline(via);
  const center: [number, number][] = [[source[0][0], source[0][1]]];
  for (let i = 1; i < source.length; i++) {
    const a = source[i - 1];
    const b = source[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.round(len / ROAD_SURFACE_SAMPLE_KM));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      center.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return roadLandRuns(center, at);
}

// Water dips up to this length along the smoothed centerline are bridged (the
// bake tolerates raw dips <= 3 km, which smoothing can stretch); anything
// longer is a ledgered ferry strait and the ribbon honestly stops at the
// shore. TWIN: ROAD_SMOOTHED_BRIDGE_KM in crates/mapgen/src/landroute.rs —
// the bake invariant guarantees committed roads never split except at ferries.
const ROAD_WATER_BRIDGE_KM = 4.5;

/** Split a resampled road centerline into its drawable land runs. */
function roadLandRuns(
  center: [number, number][],
  at?: (x: number, y: number) => "land" | "water",
): { runs: [number, number][][]; gaps: number } {
  if (!at) return { runs: [center], gaps: 0 };
  const land = center.map(([x, y]) => at(x, y) === "land");
  // Bridge interior water dips by sample count (samples ride ~0.9 km apart —
  // the same counting the bake's smoothed-run invariant uses). Terminal water
  // is never bridged: road terminals sit on land nodes, so a water tail is
  // stale data and trimming beats drawing into the sea.
  const bridgeSamples = Math.round(ROAD_WATER_BRIDGE_KM / ROAD_SURFACE_SAMPLE_KM);
  let gaps = 0;
  let i = 0;
  while (i < center.length) {
    if (land[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < center.length && !land[j]) j++;
    const interior = i > 0 && j < center.length;
    if (interior && j - i <= bridgeSamples) {
      for (let k = i; k < j; k++) land[k] = true;
    } else if (interior) {
      gaps++;
    }
    i = j;
  }
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  for (let k = 0; k < center.length; k++) {
    if (land[k]) {
      run.push(center[k]);
    } else if (run.length > 0) {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return { runs, gaps };
}

function pushRoadJunctionCaps(
  out: number[],
  anchors: number[],
  data: CampaignMapInputData,
  roads: CampaignMapEdgeData[],
  style: CampaignMapDrawStyle,
) {
  const byId = new Map<number, CampaignMapNodeData>();
  data.map.nodes.forEach((node, index) => byId.set(node.id ?? index, node));
  const degree = new Map<number, number>();
  for (const edge of roads) {
    if (edge.a !== undefined) degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    if (edge.b !== undefined) degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }
  const roadScale = style.roadScale ?? 1;
  let caps = 0;
  for (const [id, count] of degree) {
    const node = byId.get(id);
    if (!node || count < 3) continue;
    // City plazas used to be huge (tier-3 radius 4.7 + a 1.42x dark under-disc)
    // and read as an ugly shadow ring around capitals like Rome (feedback #9).
    // Keep the pavement just wide enough to seat the meeting roads, and keep the
    // dark rim as a hairline, not a halo.
    const cityRadius = node.kind === "city" ? (node.tier >= 3 ? 2.1 : 1.7) : 1.15;
    const surfaceRadius = cityRadius * roadScale;
    pushRoadDisc(
      out,
      anchors,
      node.pos,
      surfaceRadius * 1.12,
      0.19 * roadScale,
      [0.3, 0.27, 0.23, 0.45],
      0,
      style.heightAt,
    );
    pushRoadDisc(
      out,
      anchors,
      node.pos,
      surfaceRadius,
      0.34 * roadScale,
      [0.77, 0.75, 0.69, 0.98],
      1,
      style.heightAt,
    );
    caps++;
  }
  return caps;
}

// TWIN: smooth_renderer_centerline in crates/mapgen/src/landroute.rs — the
// bake pre-verifies road land-safety through this exact smoothing, so change
// both together.
function smoothRoadCenterline(points: [number, number][]) {
  if (points.length <= 2) return points;
  const smoothed: [number, number][] = [points[0]];
  for (let i = 1; i + 1 < points.length; i++) {
    const prev = points[i - 1];
    const point = points[i];
    const next = points[i + 1];
    smoothed.push([
      point[0] * 0.72 + prev[0] * 0.14 + next[0] * 0.14,
      point[1] * 0.72 + prev[1] * 0.14 + next[1] * 0.14,
    ]);
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function roadEdgeIsLandSafe(
  edge: CampaignMapEdgeData,
  at?: (x: number, y: number) => "land" | "water",
) {
  if (!at) return true;
  let samples = 0;
  let landSamples = 0;
  for (let i = 1; i < edge.via.length; i++) {
    const a = edge.via[i - 1];
    const b = edge.via[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.ceil(len / 3));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      samples++;
      if (at(x, y) === "land") landSamples++;
    }
  }
  // Only a genuine sea crossing (a mostly-water polyline) drops whole; a road
  // that merely hugs the coast stays and draws its land runs. The sampler must
  // be point truth (the full-res render mask) — an area-statistic sampler here
  // culls whole coastal approach edges (bug B7b: roadless Cosa/Tarracina).
  return samples === 0 || landSamples / samples >= 0.5;
}

function pushRoadVertex(
  out: number[],
  point: [number, number],
  z: number,
  color: [number, number, number, number],
  uv: [number, number],
  material: number,
  heightAt?: (x: number, y: number) => number,
) {
  out.push(
    point[0],
    point[1],
    z + (heightAt?.(point[0], point[1]) ?? 0),
    ...color,
    uv[0],
    uv[1],
    material,
  );
}

function pushRoadDisc(
  out: number[],
  anchors: number[],
  center: [number, number],
  radius: number,
  z: number,
  color: [number, number, number, number],
  material: number,
  heightAt?: (x: number, y: number) => number,
) {
  const segments = 18;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0: [number, number] = [
      center[0] + Math.cos(a0) * radius,
      center[1] + Math.sin(a0) * radius,
    ];
    const p1: [number, number] = [
      center[0] + Math.cos(a1) * radius,
      center[1] + Math.sin(a1) * radius,
    ];
    pushRoadVertex(out, center, z, color, [0, 0], material, heightAt);
    pushRoadVertex(out, p0, z, color, [Math.cos(a0), Math.sin(a0)], material, heightAt);
    pushRoadVertex(out, p1, z, color, [Math.cos(a1), Math.sin(a1)], material, heightAt);
    anchors.push(...center, ...center, ...center);
  }
}

function pushRoadRibbon(
  out: number[],
  anchors: number[],
  center: [number, number][],
  halfWidth: number,
  z: number,
  color: [number, number, number, number],
  material: number,
  heightAt?: (x: number, y: number) => number,
) {
  if (center.length < 2) return;
  const left: [number, number, number][] = [];
  const right: [number, number, number][] = [];
  let distance = 0;
  for (let i = 0; i < center.length; i++) {
    if (i > 0)
      distance += Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]);
    const p = center[i];
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(center.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push([p[0] - nx * halfWidth, p[1] - ny * halfWidth, distance * 0.26]);
    right.push([p[0] + nx * halfWidth, p[1] + ny * halfWidth, distance * 0.26]);
  }
  const vertex = (index: number, side: -1 | 1) => {
    const point = side < 0 ? left[index] : right[index];
    pushRoadVertex(out, [point[0], point[1]], z, color, [point[2], side], material, heightAt);
    anchors.push(...center[index]);
  };
  for (let i = 0; i + 1 < center.length; i++) {
    vertex(i, -1);
    vertex(i + 1, -1);
    vertex(i + 1, 1);
    vertex(i, -1);
    vertex(i + 1, 1);
    vertex(i, 1);
  }
}

const ROAD_SURFACE_SAMPLE_KM = 0.9;
