// @ts-nocheck
// Experimental TSL/WebGPU spike route. Keep the type looseness local to this
// lab file; the rest of the repo uses the official Three type surface.
import * as THREE from "three/webgpu";
import {
  Fn,
  abs,
  attribute,
  atomicAdd,
  atomicStore,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  faceDirection,
  float,
  floor,
  fract,
  If,
  instanceIndex,
  instancedArray,
  length,
  max,
  mix,
  mod,
  normalize,
  oneMinus,
  pow,
  sin,
  smoothstep,
  sqrt,
  storage,
  struct,
  transformNormalToView,
  uint,
  uniform,
  uv,
  varying,
  vec3,
  vec4,
} from "three/tsl";

interface FalseEarthLabContext {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  params: URLSearchParams;
}

type Vec3 = [number, number, number];
type GrassCameraMode = "close" | "top-down";
type GrassCollapseMode = "strands" | "meadow";
type GrassFieldLayout = "close-forward" | "top-down-centered";
type GrassBackend = "cpu-expanded" | "source-storage";
type GrassRecordSource = "cpu-preseeded" | "gpu-generated";
type MeadowRenderMode = "material" | "relief-debug";
type MeadowReliefDebugView = "none" | "presentation" | "scalar" | "normal-lit";
type FloorDebugMode = "none" | "terrain-chroma";
type DensityCoverageMode = "source-close" | "bf2-density-parity";
type ValueStructureMode = "none" | "bf3-source";
type MaterialValueProfileId = "legacy-lab" | "source-value";

interface BladeRecord {
  data0: [number, number, number, number];
  data1: [number, number, number, number];
  data2: [number, number, number, number];
  data3: [number, number, number, number];
  lod: "high" | "medium" | "low";
}

interface TierSpec {
  id: "high" | "medium" | "low";
  segments: number;
  minDistance: number;
  maxDistance: number;
}

interface BladeFieldSpec {
  id: DensityCoverageMode;
  columns: number;
  rows: number;
  width: number;
  depth: number;
  nearZ: number;
  limit: number;
  densityBoost: number;
  tiers: TierSpec[];
  targetBladesPerAxis: number;
  targetAreaM2: number;
  targetDensityPerM2: number;
  capReason: string | null;
  note: string;
}

interface GrassCameraSpec {
  mode: GrassCameraMode;
  position: Vec3;
  target: Vec3;
  fov: number;
}

interface VisibilityProfile {
  id: "close-strand-fog" | "top-down-review";
  clearColor: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  closeCameraScoped: boolean;
  topDownCameraScoped: boolean;
  note: string;
}

interface GrassRenderResult {
  tierStats: Record<
    string,
    { blades: number; segments: number; vertices: number; triangles: number }
  >;
  submittedTriangles: number;
  submittedVertices: number;
  drawCalls: number;
  backend: GrassBackend;
  gpuComputedBladeData: boolean;
  sourceInstancedPlanes: boolean;
  sharedBladePlaneGeometry: boolean;
  storageRecords: number;
  visibleIndexBuffers: number;
  drawIndirect: boolean;
  computeStatus: string;
  recordSource: GrassRecordSource;
  gpuRuntimeLodRouting: boolean;
  gpuRuntimeCulling: boolean;
  gpuRuntimeCulledRecords: number;
  collapseMode: GrassCollapseMode;
  collapseStrength: number;
  bladeStrokeVisibility: number;
  runtimeCompute?: {
    generate?: any;
    reset: any;
    route: any;
  };
}

interface FloorDiagnosticStats {
  enabled: boolean;
  mode: FloorDebugMode;
  keyColor: string;
  terrainOnly: boolean;
  preservesGrassGeometry: boolean;
  preservesGrassMaterial: boolean;
  note: string;
}

interface DensityCoverageStats {
  mode: DensityCoverageMode;
  requested: boolean;
  onePlanePerBlade: boolean;
  targetBladesPerAxis: number;
  targetAreaM2: number;
  targetDensityPerM2: number;
  actualColumns: number;
  actualRows: number;
  actualAreaM2: number;
  gridStepX: number;
  gridStepZ: number;
  snapCellSize: number;
  gridStepMatchesSnap: boolean;
  candidateCount: number;
  acceptedRecords: number;
  renderedRecords: number;
  acceptedDensityPerM2: number;
  renderedDensityPerM2: number;
  recordSource: GrassRecordSource;
  lodDistances: Array<{
    id: TierSpec["id"];
    minDistance: number;
    maxDistance: number;
    segments: number;
  }>;
  drawCalls: number;
  submittedTriangles: number;
  cap: {
    limit: number;
    exists: boolean;
    reason: string | null;
  };
  normalizedQuery: string[];
  note: string;
}

interface MaterialFeatureStats {
  mode: ValueStructureMode;
  materialVariant: MaterialVariantId;
  valueProfile: MaterialValueProfileId;
  sourceHeightAO: boolean;
  sourceHeightColorBlend: boolean;
  sourceDistanceDesaturation: boolean;
  sourceWidthNormalShaping: boolean;
  sourceViewDependentThickness: boolean;
  roughnessFollowsAO: boolean;
  geometryStatsFrozen: boolean;
  aoPower: number;
  metalness: number;
  roughness: number;
  additiveHighlight: boolean;
  apparentWidthBase: number;
  apparentTipThin: number;
  viewThickness: string;
  note: string;
}

type MaterialVariantId =
  | "aa1-storage"
  | "source-pbr"
  | "source-pbr-base-fill"
  | "source-value-structure"
  | "top-down-meadow-collapse"
  | "blade-owned-hierarchy";

interface MaterialVariant {
  id: MaterialVariantId;
  valueProfile: MaterialValueProfileId;
  terrainColor: number;
  roughness: number;
  metalness: number;
  root: Vec3;
  mid: Vec3;
  tip: Vec3;
  clumpRange: [number, number];
  bladeRange: [number, number];
  aoPower: number;
  distDesat: number;
  highlight: number;
  note: string;
}

interface BladeHierarchyStats {
  sourceRole: string;
  visibleHierarchyOwner: string;
  enabled: boolean;
  subBladesPerRecord: number;
  materialVariant: MaterialVariantId;
  note: string;
}

interface MeadowStats {
  enabled: boolean;
  sourceRecordsOwnField: boolean;
  terrainVertexColors: boolean;
  terrainRelief: boolean;
  edgeMaskEnabled: boolean;
  edgeMaskWidth: number;
  sourceFootprintDensityExtrapolation: boolean;
  sourceFootprintClampMargin: number;
  reliefDebugEnabled: boolean;
  reliefDebugView: MeadowReliefDebugView;
  reliefDomainRotationDegrees: number;
  reliefRidgeScale: number;
  coverage: number;
  meanDensity: number;
  densityP95: number;
  gridCells: number;
  collapseStrength: number;
  bladeStrokeVisibility: number;
  note: string;
}

const TIERS: TierSpec[] = [
  { id: "high", segments: 12, minDistance: 0, maxDistance: 8.5 },
  { id: "medium", segments: 5, minDistance: 8.5, maxDistance: 23 },
  { id: "low", segments: 2, minDistance: 23, maxDistance: 64 },
];
const GRASS_CULL_DISTANCE = TIERS[TIERS.length - 1].maxDistance;
const FALSE_EARTH_DENSITY_TIERS: TierSpec[] = [
  { id: "high", segments: 15, minDistance: 0, maxDistance: 5 },
  { id: "medium", segments: 5, minDistance: 5, maxDistance: 20 },
  { id: "low", segments: 2, minDistance: 20, maxDistance: 64 },
];
const SOURCE_COLUMNS = 420;
const SOURCE_ROWS = 280;
const SOURCE_WIDTH = 38;
const SOURCE_DEPTH = 50;
const SOURCE_CANDIDATE_COUNT = SOURCE_COLUMNS * SOURCE_ROWS;
const BLADE_HIERARCHY_SUB_BLADES = 9;
const FLOOR_DIAGNOSTIC_KEY_COLOR = 0xff00ff;

const CLOSE_CAMERA: GrassCameraSpec = {
  mode: "close",
  position: [0, 1.16, 5.8],
  target: [0, -4.8, -18],
  fov: 54,
};
const TOP_DOWN_CAMERA: GrassCameraSpec = {
  mode: "top-down",
  position: [0, 42, -18],
  target: [0, 0, -18],
  fov: 34,
};
const VISIBILITY_PROFILES: Record<VisibilityProfile["id"], VisibilityProfile> = {
  "close-strand-fog": {
    id: "close-strand-fog",
    clearColor: 0xb9d0df,
    fogColor: 0xb9d0df,
    fogNear: 26,
    fogFar: 58,
    closeCameraScoped: true,
    topDownCameraScoped: false,
    note: "AA1 close-material profile: keeps inherited close-camera fog so strand/body failures remain comparable",
  },
  "top-down-review": {
    id: "top-down-review",
    clearColor: 0xb9d0df,
    fogColor: 0xb9d0df,
    fogNear: 120,
    fogFar: 180,
    closeCameraScoped: false,
    topDownCameraScoped: true,
    note: "AA5 top-down comparability profile: moves fog beyond the overhead camera distance so meadow mass can be judged before production haze integration",
  },
};
const SNAP_CELL_SIZE = 80 / 1024;
const grassStructure = struct({
  data0: "vec4",
  data1: "vec4",
  data2: "vec4",
  data3: "vec4",
});
const drawIndirectStructure = struct({
  vertexCount: "uint",
  instanceCount: { type: "uint", atomic: true },
  firstVertex: "uint",
  firstInstance: "uint",
  offset: "uint",
});
const MATERIAL_VARIANTS: Record<MaterialVariantId, MaterialVariant> = {
  "aa1-storage": {
    id: "aa1-storage",
    valueProfile: "legacy-lab",
    terrainColor: 0x26080d,
    roughness: 0.28,
    metalness: 0.08,
    root: [0.105, 0.008, 0.022],
    mid: [0.47, 0.065, 0.095],
    tip: [0.76, 0.225, 0.28],
    clumpRange: [0.76, 1.16],
    bladeRange: [0.86, 1.12],
    aoPower: 0.58,
    distDesat: 0.34,
    highlight: 0.12,
    note: "AA1 rejected source-storage material baseline",
  },
  "source-pbr": {
    id: "source-pbr",
    valueProfile: "legacy-lab",
    terrainColor: 0x050004,
    roughness: 0.35,
    metalness: 0.5,
    root: [0.0, 0.0, 0.0],
    mid: [0.36, 0.045, 0.07],
    tip: [0.68, 0.18, 0.23],
    clumpRange: [0.9, 1.1],
    bladeRange: [0.95, 1.03],
    aoPower: 5.0,
    distDesat: 0.35,
    highlight: 0.08,
    note: "False-earth PBR defaults adapted to the red reference hue",
  },
  "source-value-structure": {
    id: "source-value-structure",
    valueProfile: "source-value",
    terrainColor: 0x130307,
    roughness: 0.58,
    metalness: 0.08,
    root: [0.052, 0.006, 0.014],
    mid: [0.36, 0.045, 0.07],
    tip: [0.66, 0.17, 0.215],
    clumpRange: [0.9, 1.1],
    bladeRange: [0.95, 1.03],
    aoPower: 1.6,
    distDesat: 0.35,
    highlight: 0.0,
    note: "BF3 source value profile: source-style linear base/tip blend, AO-driven roughness, source width normals, width-proportional view thickness, lifted dark roots, and no additive rim highlight",
  },
  "source-pbr-base-fill": {
    id: "source-pbr-base-fill",
    valueProfile: "legacy-lab",
    terrainColor: 0x43111a,
    roughness: 0.35,
    metalness: 0.5,
    root: [0.07, 0.012, 0.02],
    mid: [0.42, 0.06, 0.085],
    tip: [0.7, 0.19, 0.245],
    clumpRange: [0.88, 1.08],
    bladeRange: [0.94, 1.04],
    aoPower: 1.4,
    distDesat: 0.28,
    highlight: 0.09,
    note: "Source-shaped PBR with lifted terrain/root fill to isolate the dark-floor failure",
  },
  "top-down-meadow-collapse": {
    id: "top-down-meadow-collapse",
    valueProfile: "legacy-lab",
    terrainColor: 0x485f31,
    roughness: 0.72,
    metalness: 0.0,
    root: [0.18, 0.25, 0.12],
    mid: [0.29, 0.39, 0.2],
    tip: [0.4, 0.49, 0.28],
    clumpRange: [0.96, 1.04],
    bladeRange: [0.98, 1.02],
    aoPower: 0.55,
    distDesat: 0.18,
    highlight: 0.01,
    note: "AA6 top-down meadow material: darker terrain-registered field with subdued collapsed blade speckle",
  },
  "blade-owned-hierarchy": {
    id: "blade-owned-hierarchy",
    valueProfile: "legacy-lab",
    terrainColor: 0x2c0b12,
    roughness: 0.48,
    metalness: 0.12,
    root: [0.058, 0.004, 0.014],
    mid: [0.34, 0.039, 0.066],
    tip: [0.64, 0.155, 0.19],
    clumpRange: [0.84, 1.12],
    bladeRange: [0.82, 1.16],
    aoPower: 0.82,
    distDesat: 0.22,
    highlight: 0.085,
    note: "AA6B1AJ close-camera experiment: source records own coverage/masks while clustered blade geometry/material owns visible hierarchy",
  },
};

export async function routeFalseEarthCloseGrass(ctx: FalseEarthLabContext) {
  if (ctx.params.get("view") === "reference") ctx.root.classList.add("reference-shot");
  const densityCoverageMode = resolveDensityCoverageMode(ctx.params);
  const densityCoverageRequested = densityCoverageMode === "bf2-density-parity";
  const valueStructureMode = resolveValueStructureMode(ctx.params, densityCoverageMode);
  const backend =
    densityCoverageRequested || ctx.params.get("backend") !== "cpu-expanded"
      ? "source-storage"
      : "cpu-expanded";
  const requestedCameraSpec = resolveCameraSpec(ctx.params.get("camera"));
  const cameraSpec = densityCoverageRequested ? CLOSE_CAMERA : requestedCameraSpec;
  const requestedCollapseMode = resolveGrassCollapse(ctx.params.get("grassCollapse"), cameraSpec);
  const collapseMode =
    densityCoverageRequested || backend !== "source-storage" ? "strands" : requestedCollapseMode;
  const meadowRenderMode = resolveMeadowRenderMode(ctx.params.get("meadowDebug"), collapseMode);
  const meadowReliefDebugView = resolveMeadowReliefDebugView(
    ctx.params.get("reliefView"),
    meadowRenderMode,
  );
  const floorDebugMode = resolveFloorDebugMode(ctx.params.get("floorDebug"));
  const materialVariant = resolveMaterialVariant(
    densityCoverageRequested
      ? valueStructureMode === "bf3-source"
        ? "source-value-structure"
        : "source-pbr"
      : ctx.params.get("materialVariant"),
    collapseMode,
  );
  const visibilityProfile = resolveVisibilityProfile(cameraSpec, collapseMode);
  const fieldLayout = resolveFieldLayout(cameraSpec, collapseMode);
  const cullProof = !densityCoverageRequested && ctx.params.get("cullProof") === "1";
  const requestedRecordSource = resolveRecordSource(ctx.params.get("records"), backend);
  const recordSource = densityCoverageRequested ? "cpu-preseeded" : requestedRecordSource;
  const profile = densityCoverageRequested
    ? "bf2-density-parity"
    : ctx.params.get("profile") === "bounded-lite"
      ? "bounded-lite"
      : "source-close";
  const bladeLimit = profile === "bounded-lite" ? 32000 : 120000;
  const fieldSpec = resolveBladeFieldSpec(
    densityCoverageMode,
    fieldLayout,
    cullProof,
    bladeLimit,
    isBladeOwnedHierarchy(materialVariant) ? 0.065 : 0,
  );
  const densityCoverageNormalizations = describeDensityCoverageNormalizations(
    ctx.params,
    densityCoverageRequested,
    requestedCameraSpec,
    requestedRecordSource,
  );
  const seed = 0x5ea7_2026;
  const camera = new THREE.PerspectiveCamera(cameraSpec.fov, 1, 0.05, 160);
  camera.position.set(cameraSpec.position[0], cameraSpec.position[1], cameraSpec.position[2]);
  camera.lookAt(cameraSpec.target[0], cameraSpec.target[1], cameraSpec.target[2]);

  const renderer = new THREE.WebGPURenderer({
    canvas: ctx.canvas,
    antialias: true,
    alpha: false,
  });
  const size = canvasSize(ctx.canvas);
  ctx.canvas.width = size.width * size.dpr;
  ctx.canvas.height = size.height * size.dpr;
  renderer.setPixelRatio(size.dpr);
  renderer.setSize(size.width, size.height, false);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  renderer.setClearColor(new THREE.Color(visibilityProfile.clearColor), 1);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(
    visibilityProfile.fogColor,
    visibilityProfile.fogNear,
    visibilityProfile.fogFar,
  );
  scene.add(new THREE.AmbientLight(0xe8d7dc, 1.1));
  const sun = new THREE.DirectionalLight(0xffd0d5, 4.4);
  sun.position.set(-2.5, 3.2, 4.5);
  scene.add(sun);

  const snappedOrigin: Vec3 = [
    Math.round(cameraSpec.position[0] / SNAP_CELL_SIZE) * SNAP_CELL_SIZE,
    0,
    Math.round(cameraSpec.position[2] / SNAP_CELL_SIZE) * SNAP_CELL_SIZE,
  ];
  const records = buildBladeRecords(fieldSpec, seed, snappedOrigin, cameraSpec.position);
  const terrainLayer = buildTerrainMesh(
    materialVariant,
    collapseMode,
    records,
    seed,
    meadowRenderMode,
    meadowReliefDebugView,
    floorDebugMode,
  );
  scene.add(terrainLayer.mesh);
  const reliefDiagnosticTerrainOnly = meadowRenderMode === "relief-debug";
  const renderResult = reliefDiagnosticTerrainOnly
    ? createReliefDiagnosticRenderResult(records, backend, recordSource)
    : backend === "source-storage"
      ? addSourceStorageGrass(
          scene,
          records,
          materialVariant,
          collapseMode,
          cameraSpec.position,
          snappedOrigin,
          fieldLayout,
          recordSource,
          fieldSpec.tiers,
        )
      : addCpuExpandedGrass(scene, records, cameraSpec.position);

  if (renderResult.runtimeCompute) {
    if (renderResult.runtimeCompute.generate) {
      renderer.compute(renderResult.runtimeCompute.generate);
    }
    renderer.compute(renderResult.runtimeCompute.reset);
    renderer.compute(renderResult.runtimeCompute.route);
  }
  renderer.render(scene, camera);

  const stats = {
    route: "false-earth-close-grass",
    profile,
    sourceArchitecture: "momentchan/false-earth grass close-material replication",
    article:
      "https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/",
    code: "https://github.com/momentchan/false-earth",
    productionBattleIntegration: false,
    renderer: "Three.js WebGPURenderer",
    tslMaterial: true,
    cullProof,
    backend: renderResult.backend,
    reliefDiagnosticTerrainOnly,
    gpuComputedBladeData: renderResult.gpuComputedBladeData,
    recordSource: renderResult.recordSource,
    gpuRuntimeLodRouting: renderResult.gpuRuntimeLodRouting,
    gpuRuntimeCulling: renderResult.gpuRuntimeCulling,
    gpuRuntimeCulledRecords: renderResult.gpuRuntimeCulledRecords,
    computeStatus: renderResult.computeStatus,
    sourceInstancedPlanes: renderResult.sourceInstancedPlanes,
    sharedBladePlaneGeometry: renderResult.sharedBladePlaneGeometry,
    storageRecords: renderResult.storageRecords,
    visibleIndexBuffers: renderResult.visibleIndexBuffers,
    drawIndirect: renderResult.drawIndirect,
    materialVariant: materialVariant.id,
    materialFeatures: describeMaterialFeatures(valueStructureMode, materialVariant),
    densityCoverage: describeDensityCoverage(
      densityCoverageMode,
      densityCoverageRequested,
      fieldSpec,
      records,
      renderResult,
      recordSource,
      materialVariant,
      densityCoverageNormalizations,
    ),
    grassCollapse: collapseMode,
    meadowRenderMode,
    meadowReliefDebugView,
    floorDebugMode,
    collapseStrength: renderResult.collapseStrength,
    bladeStrokeVisibility: renderResult.bladeStrokeVisibility,
    cameraMode: cameraSpec.mode,
    visibilityProfile: {
      id: visibilityProfile.id,
      fogNear: visibilityProfile.fogNear,
      fogFar: visibilityProfile.fogFar,
      closeCameraScoped: visibilityProfile.closeCameraScoped,
      topDownCameraScoped: visibilityProfile.topDownCameraScoped,
      note: visibilityProfile.note,
    },
    cameraSnappedGrid: true,
    snapCellSize: SNAP_CELL_SIZE,
    snappedOrigin,
    deterministicWorldSeeds: true,
    packedVec4PerBlade: 4,
    packedBytesPerBlade: 64,
    bladeRecords: records.length,
    fieldLayout,
    packedAttributeBytes: records.length * 64,
    voronoiClumpBlend: true,
    bezierBladeSpine: true,
    terrainNormalAlignment: true,
    slopeFiltering: true,
    viewDependentThickness: true,
    proceduralBladeShading: true,
    distanceDesaturation: true,
    lodMode:
      backend === "source-storage"
        ? "source-style storage indices + indirect tiers"
        : "bounded source tiers",
    lodTiers: renderResult.tierStats,
    submittedVertices: renderResult.submittedVertices,
    submittedTriangles: renderResult.submittedTriangles,
    drawCalls: renderResult.drawCalls,
    material: {
      variant: materialVariant.id,
      root: materialVariant.root,
      mid: materialVariant.mid,
      tip: materialVariant.tip,
      highlight: "TSL width-rim + height AO + red gloss",
      note: materialVariant.note,
    },
    floorDiagnostic: describeFloorDiagnostic(floorDebugMode),
    bladeHierarchy: describeBladeHierarchy(materialVariant),
    meadow: terrainLayer.meadowStats,
    camera: {
      mode: cameraSpec.mode,
      position: cameraSpec.position,
      target: cameraSpec.target,
      fov: camera.fov,
      width: size.width,
      height: size.height,
    },
  };

  ctx.status.innerHTML = reportTable({
    route: stats.route,
    renderer: stats.renderer,
    blades: stats.bladeRecords,
    triangles: Math.round(stats.submittedTriangles),
    packed: `${stats.packedVec4PerBlade} vec4 / ${Math.round(stats.packedAttributeBytes / 1024)} KiB`,
    lod: `${renderResult.tierStats.high.blades}/${renderResult.tierStats.medium.blades}/${renderResult.tierStats.low.blades}`,
    backend: stats.backend,
    variant: materialVariant.id,
    camera: cameraSpec.mode,
    visibility: visibilityProfile.id,
    collapse: collapseMode,
    meadow: meadowRenderMode,
    floor: floorDebugMode,
    compute: stats.gpuComputedBladeData ? "gpu" : "storage-preseed",
  });
  publish("false-earth-close-grass", true, stats);
}

function createReliefDiagnosticRenderResult(
  records: BladeRecord[],
  backend: GrassBackend,
  recordSource: GrassRecordSource,
): GrassRenderResult {
  const zeroTierStats: Record<
    string,
    { blades: number; segments: number; vertices: number; triangles: number }
  > = {
    high: { blades: 0, segments: TIERS[0].segments, vertices: 0, triangles: 0 },
    medium: { blades: 0, segments: TIERS[1].segments, vertices: 0, triangles: 0 },
    low: { blades: 0, segments: TIERS[2].segments, vertices: 0, triangles: 0 },
  };
  return {
    tierStats: zeroTierStats,
    submittedTriangles: 0,
    submittedVertices: 0,
    drawCalls: 0,
    backend,
    gpuComputedBladeData: recordSource === "gpu-generated",
    sourceInstancedPlanes: false,
    sharedBladePlaneGeometry: false,
    storageRecords: recordSource === "gpu-generated" ? SOURCE_CANDIDATE_COUNT : records.length,
    visibleIndexBuffers: 0,
    drawIndirect: false,
    computeStatus:
      "AA6B1 diagnostic route: grass draw is intentionally skipped so the terrain-owned relief field can be judged by itself",
    recordSource,
    gpuRuntimeLodRouting: false,
    gpuRuntimeCulling: false,
    gpuRuntimeCulledRecords: 0,
    collapseMode: "meadow",
    collapseStrength: 0.92,
    bladeStrokeVisibility: 0.025,
  };
}

function addCpuExpandedGrass(
  scene: any,
  records: BladeRecord[],
  cameraPosition: Vec3,
): GrassRenderResult {
  const material = createFalseEarthMaterial();
  const tierStats: Record<
    string,
    { blades: number; segments: number; vertices: number; triangles: number }
  > = {};
  let submittedTriangles = 0;
  let submittedVertices = 0;

  for (const tier of TIERS) {
    const tierRecords = records.filter((record) => record.lod === tier.id);
    const geometry = buildBladeGeometry(tierRecords, tier.segments, cameraPosition);
    const vertices = geometry.getAttribute("position").count;
    const triangles = geometry.index ? geometry.index.count / 3 : 0;
    submittedVertices += vertices;
    submittedTriangles += triangles;
    tierStats[tier.id] = {
      blades: tierRecords.length,
      segments: tier.segments,
      vertices,
      triangles,
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  return {
    tierStats,
    submittedTriangles,
    submittedVertices,
    drawCalls: TIERS.length,
    backend: "cpu-expanded",
    gpuComputedBladeData: false,
    sourceInstancedPlanes: false,
    sharedBladePlaneGeometry: false,
    storageRecords: records.length,
    visibleIndexBuffers: 0,
    drawIndirect: false,
    computeStatus:
      "rejected baseline: CPU-generated packed records expanded into unique Three geometry before draw",
    recordSource: "cpu-preseeded",
    gpuRuntimeLodRouting: false,
    gpuRuntimeCulling: false,
    gpuRuntimeCulledRecords: 0,
    collapseMode: "strands",
    collapseStrength: 0,
    bladeStrokeVisibility: 1,
  };
}

function addSourceStorageGrass(
  scene: any,
  records: BladeRecord[],
  materialVariant: MaterialVariant,
  collapseMode: GrassCollapseMode,
  cameraPosition: Vec3,
  origin: Vec3,
  fieldLayout: GrassFieldLayout,
  recordSource: GrassRecordSource,
  tiers: TierSpec[] = TIERS,
): GrassRenderResult {
  const storageRecordCount =
    recordSource === "gpu-generated" ? SOURCE_CANDIDATE_COUNT : records.length;
  const grassDataArray = new Float32Array(storageRecordCount * 16);
  const tierIndices: Record<TierSpec["id"], number[]> = { high: [], medium: [], low: [] };
  let culledRecords = 0;
  const cullDistance = tiers[tiers.length - 1].maxDistance;

  records.forEach((record, index) => {
    if (recordSource === "cpu-preseeded") {
      grassDataArray.set(record.data0, index * 16);
      grassDataArray.set(record.data1, index * 16 + 4);
      grassDataArray.set(record.data2, index * 16 + 8);
      grassDataArray.set(record.data3, index * 16 + 12);
    }
    const distance = distance3([record.data0[0], record.data0[1], record.data0[2]], cameraPosition);
    if (distance >= cullDistance) {
      culledRecords++;
    } else if (distance < tiers[0].maxDistance) {
      tierIndices.high.push(index);
    } else if (distance < tiers[1].maxDistance) {
      tierIndices.medium.push(index);
    } else {
      tierIndices.low.push(index);
    }
  });

  const grassData = instancedArray(grassDataArray, grassStructure).setName(
    "FalseEarthCloseGrassData",
  );
  const runtimeConfigs: SourceLodRuntimeConfig[] = [];
  const tierStats: Record<
    string,
    { blades: number; segments: number; vertices: number; triangles: number }
  > = {};
  let submittedTriangles = 0;
  let submittedVertices = 0;

  for (const tier of tiers) {
    const expectedIndices = tierIndices[tier.id];
    const indices = new Uint32Array(storageRecordCount);
    const visibleIndices = instancedArray(indices, "uint").setName(`FalseEarthVisible${tier.id}`);
    const geometry = isBladeOwnedHierarchy(materialVariant)
      ? createSourceBladeHierarchyGeometry(tier.segments)
      : createSourceBladePlaneGeometry(tier.segments);
    const indexCount = geometry.index
      ? geometry.index.count
      : geometry.getAttribute("position").count;
    const drawBuffer = new THREE.IndirectStorageBufferAttribute(
      new Uint32Array([indexCount, 0, 0, 0, 0]),
      5,
    );
    const drawStorage = storage(drawBuffer, drawIndirectStructure, 1).setName(
      `FalseEarthDraw${tier.id}`,
    );
    geometry.setIndirect(drawBuffer);
    const material = createSourceStorageMaterial(
      grassData,
      visibleIndices,
      materialVariant,
      collapseMode,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.count = storageRecordCount;
    mesh.frustumCulled = false;
    scene.add(mesh);

    const vertices = geometry.getAttribute("position").count * expectedIndices.length;
    const triangles = (indexCount / 3) * expectedIndices.length;
    submittedVertices += vertices;
    submittedTriangles += triangles;
    tierStats[tier.id] = {
      blades: expectedIndices.length,
      segments: tier.segments,
      vertices,
      triangles,
    };
    runtimeConfigs.push({ ...tier, indices: visibleIndices, drawStorage, vertexCount: indexCount });
  }
  const runtimeCompute = createSourceRuntimeLodCompute(
    grassData,
    runtimeConfigs,
    storageRecordCount,
    cameraPosition,
    cullDistance,
    recordSource === "gpu-generated"
      ? {
          origin,
          fieldLayout,
        }
      : undefined,
  );

  return {
    tierStats,
    submittedTriangles,
    submittedVertices,
    drawCalls: TIERS.length,
    backend: "source-storage",
    gpuComputedBladeData: recordSource === "gpu-generated",
    sourceInstancedPlanes: true,
    sharedBladePlaneGeometry: true,
    storageRecords: storageRecordCount,
    visibleIndexBuffers: tiers.length,
    drawIndirect: true,
    computeStatus:
      recordSource === "gpu-generated"
        ? "source path: GPU compute generates camera-snapped packed blade records, then resets indirect draw buffers, culls the far field, and routes visible LOD indices before render"
        : collapseMode === "meadow"
          ? "AA6 source path: packed records still own the field domain; GPU compute now resets indirect draw buffers, culls the far field, and routes visible LOD indices before render"
          : "source path: packed records live in storage; GPU compute now resets indirect draw buffers, culls the far field, and routes visible LOD indices before render",
    recordSource,
    gpuRuntimeLodRouting: true,
    gpuRuntimeCulling: true,
    gpuRuntimeCulledRecords: culledRecords,
    collapseMode,
    collapseStrength: collapseMode === "meadow" ? 0.92 : 0,
    bladeStrokeVisibility: collapseMode === "meadow" ? 0.025 : 1,
    runtimeCompute,
  };
}

interface SourceLodRuntimeConfig extends TierSpec {
  indices: any;
  drawStorage: any;
  vertexCount: number;
}

interface SourceGenerateConfig {
  origin: Vec3;
  fieldLayout: GrassFieldLayout;
}

function createSourceRuntimeLodCompute(
  grassData: any,
  lodConfigs: SourceLodRuntimeConfig[],
  recordCount: number,
  cameraPos: Vec3,
  cullDistance: number,
  generateConfig?: SourceGenerateConfig,
) {
  const camera = uniform(new THREE.Vector3(cameraPos[0], cameraPos[1], cameraPos[2]));
  const generateFn = generateConfig
    ? createSourceBladeGenerateCompute(grassData, generateConfig)
    : undefined;
  const resetFn = Fn(() => {
    for (const config of lodConfigs) {
      const draw = config.drawStorage;
      draw.get("vertexCount").assign(uint(config.vertexCount));
      atomicStore(draw.get("instanceCount"), uint(0));
      draw.get("firstVertex").assign(uint(0));
      draw.get("firstInstance").assign(uint(0));
      draw.get("offset").assign(uint(0));
    }
  });
  const appendToLod = (config: SourceLodRuntimeConfig) => {
    const slot = atomicAdd(config.drawStorage.get("instanceCount"), uint(1));
    config.indices.element(slot).assign(uint(instanceIndex));
  };
  const routeFn = Fn(() => {
    const data = grassData.element(instanceIndex);
    const pos = data.get("data0").xyz;
    const dist = length(camera.sub(pos));
    If(dist.lessThan(float(lodConfigs[0].maxDistance)), () => {
      appendToLod(lodConfigs[0]);
    })
      .ElseIf(dist.lessThan(float(lodConfigs[1].maxDistance)), () => {
        appendToLod(lodConfigs[1]);
      })
      .ElseIf(dist.lessThan(float(cullDistance)), () => {
        appendToLod(lodConfigs[2]);
      });
  });
  return {
    generate: generateFn?.().compute(recordCount).setName("FalseEarthGrassGenerateRecords"),
    reset: resetFn().compute(1).setName("FalseEarthGrassResetIndirect"),
    route: routeFn().compute(recordCount).setName("FalseEarthGrassRouteLod"),
  };
}

function createSourceBladeGenerateCompute(grassData: any, config: SourceGenerateConfig) {
  const origin = uniform(new THREE.Vector3(config.origin[0], config.origin[1], config.origin[2]));
  const nearZ = config.fieldLayout === "top-down-centered" ? SOURCE_DEPTH * 0.5 : -1.25;
  const seed = 0x5ea7_2026;

  return Fn(() => {
    const i = float(instanceIndex);
    const col = mod(i, float(SOURCE_COLUMNS));
    const row = floor(i.div(float(SOURCE_COLUMNS)));
    const z01 = row.div(float(SOURCE_ROWS - 1));
    const density = float(0.93).sub(z01.mul(0.12));
    const densityRand = hash2Node(col, row, seed + 91);
    const keep = oneMinus(smoothstep(density, density.add(0.001), densityRand));
    const jitterX = hash2Node(col, row, seed);
    const jitterZ = hash2Node(col, row, seed + 53);
    const x = origin.x.add(
      col
        .add(jitterX)
        .sub(float(SOURCE_COLUMNS * 0.5))
        .mul(SOURCE_WIDTH / SOURCE_COLUMNS),
    );
    const z = origin.z.add(float(nearZ)).sub(row.add(jitterZ).mul(SOURCE_DEPTH / SOURCE_ROWS));
    const phaseA = x.mul(0.33).add(z.mul(0.12));
    const phaseB = x.mul(0.77).sub(z.mul(0.18));
    const terrainHeight = sin(phaseA).mul(0.2).add(sin(phaseB).mul(0.14));
    const normal = normalize(vec3(cos(phaseA).mul(-0.066), float(1.0), cos(phaseA).mul(-0.024)));
    const bladeSeed = hash2Node(col, row, seed + 17);
    const clumpSeed = hash2Node(floor(x.div(1.55)), floor(z.div(1.55)), seed + 29);
    const yaw = bladeSeed.sub(0.5).mul(6.2831853);
    const farOffset = oneMinus(keep).mul(10000);
    const record = grassData.element(instanceIndex);
    record.get("data0").assign(vec4(x.add(farOffset), terrainHeight, z.add(farOffset), bladeSeed));
    record
      .get("data1")
      .assign(
        vec4(
          float(0.007).add(hash2Node(col, row, seed + 33).mul(0.012)),
          float(0.36).add(bladeSeed.mul(0.58)).mul(keep),
          float(0.25).add(clumpSeed.mul(0.5)),
          float(0.32).add(hash2Node(col, row, seed + 61).mul(0.65)),
        ),
      );
    record.get("data2").assign(vec4(sin(yaw), cos(yaw), clumpSeed, bladeSeed));
    record.get("data3").assign(vec4(normal.x, normal.z, keep, float(0.0)));
  });
}

function hash2Node(x: any, y: any, seed: number) {
  return fract(sin(x.mul(127.1).add(y.mul(311.7)).add(float(seed).mul(0.013))).mul(43758.5453));
}

function buildBladeRecords(
  fieldSpec: BladeFieldSpec,
  seed: number,
  origin: Vec3,
  cameraPosition: Vec3,
): BladeRecord[] {
  const records: BladeRecord[] = [];
  const columns = fieldSpec.columns;
  const rows = fieldSpec.rows;
  const width = fieldSpec.width;
  const depth = fieldSpec.depth;
  const nearZ = fieldSpec.nearZ;
  const gridStepX = width / columns;
  const gridStepZ = depth / rows;

  for (let row = 0; row < rows && records.length < fieldSpec.limit; row++) {
    for (let col = 0; col < columns && records.length < fieldSpec.limit; col++) {
      const gx = col - columns * 0.5;
      const gz = row;
      const densityRand = hash2(gx, gz, seed + 91);
      const z01 = row / (rows - 1);
      const density = Math.min(0.985, 0.93 - z01 * 0.12 + fieldSpec.densityBoost);
      if (densityRand > density) continue;

      const jitter = hash2Pair(gx, gz, seed);
      const x = origin[0] + (col + jitter[0] - columns * 0.5) * gridStepX;
      const z = origin[2] + nearZ - (row + jitter[1]) * gridStepZ;
      const terrain = terrainAt(x, z);
      if (terrain.slope > 0.78) continue;

      const clump = clumpInfo(x, z, seed);
      const bladeSeed = hash2(gx, gz, seed + 17);
      const clumpSeed = hash2(
        Math.floor(clump.best[0] * 13),
        Math.floor(clump.best[1] * 17),
        seed + 29,
      );
      const p = clump.blend;
      const hA = 0.42 + hash2(clump.best[0], clump.best[1], seed + 301) * 0.58;
      const hB = 0.42 + hash2(clump.second[0], clump.second[1], seed + 301) * 0.58;
      const wA = 0.006 + hash2(clump.best[0], clump.best[1], seed + 401) * 0.014;
      const wB = 0.006 + hash2(clump.second[0], clump.second[1], seed + 401) * 0.014;
      const bA = 0.26 + hash2(clump.best[0], clump.best[1], seed + 501) * 0.58;
      const bB = 0.26 + hash2(clump.second[0], clump.second[1], seed + 501) * 0.58;
      const height = mixNumber(hB, hA, p) * (0.82 + bladeSeed * 0.42) * (1.08 - z01 * 0.22);
      const bladeWidth = mixNumber(wB, wA, p) * (0.82 + hash2(gx, gz, seed + 33) * 0.52);
      const bend = mixNumber(bB, bA, p);
      const centerYaw = Math.atan2(clump.toCenter[1], clump.toCenter[0]) * 0.16;
      const yaw = centerYaw + (bladeSeed - 0.5) * 5.2 + (clumpSeed - 0.5) * 1.1 * p;
      const wind = 0.32 + hash2(gx, gz, seed + 61) * 0.65;
      const distance = distance3([x, terrain.height, z], cameraPosition);
      const lod =
        distance < fieldSpec.tiers[0].maxDistance
          ? "high"
          : distance < fieldSpec.tiers[1].maxDistance
            ? "medium"
            : "low";
      records.push({
        data0: [x, terrain.height, z, hash2(gx, gz, seed + 7)],
        data1: [bladeWidth, height, bend, wind],
        data2: [Math.sin(yaw), Math.cos(yaw), clumpSeed, bladeSeed],
        data3: [terrain.normal[0], terrain.normal[2], 1, 0],
        lod,
      });
    }
  }
  return records;
}

function buildBladeGeometry(records: BladeRecord[], segments: number, cameraPosition: Vec3): any {
  const vertexCount = records.length * (segments + 1) * 2;
  const indexCount = records.length * segments * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vp = 0;
  let up = 0;
  let ip = 0;
  let vertexBase = 0;
  const windDir = normalize3([0.82, 0.0, 0.36]);

  for (const record of records) {
    const base: Vec3 = [record.data0[0], record.data0[1], record.data0[2]];
    const width = record.data1[0];
    const height = record.data1[1];
    const bend = record.data1[2];
    const wind = record.data1[3];
    const rotSin = record.data2[0];
    const rotCos = record.data2[1];
    const terrainNormal = reconstructNormal(record.data3[0], record.data3[1]);
    const forward = normalize3([rotSin, 0, rotCos]);
    const tangentForward = normalize3(projectOnPlane(forward, terrainNormal));
    const side = normalize3(cross3(tangentForward, terrainNormal));
    const p0 = base;
    const p1 = add3(
      base,
      add3(scale3(terrainNormal, height * 0.28), scale3(tangentForward, bend * height * 0.1)),
    );
    const p2 = add3(
      base,
      add3(
        add3(scale3(terrainNormal, height * 0.7), scale3(tangentForward, bend * height * 0.34)),
        scale3(windDir, wind * height * 0.035),
      ),
    );
    const p3 = add3(
      base,
      add3(
        add3(scale3(terrainNormal, height), scale3(tangentForward, bend * height * 0.62)),
        scale3(windDir, wind * height * 0.07),
      ),
    );

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const center = bezier3(p0, p1, p2, p3, t);
      const tangent = normalize3(bezier3Tangent(p0, p1, p2, p3, t));
      const normal = normalize3(cross3(side, tangent));
      const widthFactor = (t + 0.32) * Math.pow(Math.max(0, 1 - t), 0.94);
      const halfWidth = width * widthFactor;
      const camDir = normalize3(sub3(cameraPosition, center));
      const camSide = dot3(camDir, side);
      const centerMask = Math.pow(1 - t, 0.48) * Math.pow(t + 0.05, 0.33);
      const viewBulk = Math.pow(Math.abs(camSide), 1.2) * centerMask * 0.026;

      for (const sideSign of [-1, 1]) {
        const edgeOffset = add3(
          scale3(side, halfWidth * sideSign),
          scale3(normal, viewBulk * camSide * sideSign),
        );
        const pos = add3(center, edgeOffset);
        positions[vp++] = pos[0];
        positions[vp++] = pos[1];
        positions[vp++] = pos[2];
        normals[vp - 3] = normal[0];
        normals[vp - 2] = normal[1];
        normals[vp - 1] = normal[2];
        uvs[up++] = sideSign < 0 ? 0 : 1;
        uvs[up++] = t;
      }
    }

    for (let s = 0; s < segments; s++) {
      const a = vertexBase + s * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices[ip++] = a;
      indices[ip++] = c;
      indices[ip++] = b;
      indices[ip++] = b;
      indices[ip++] = c;
      indices[ip++] = d;
    }
    vertexBase += (segments + 1) * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function createSourceBladePlaneGeometry(segments: number): any {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, segments);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

function createSourceBladeHierarchyGeometry(segments: number): any {
  const blades = BLADE_HIERARCHY_SUB_BLADES;
  const vertexCount = blades * (segments + 1) * 2;
  const indexCount = blades * segments * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(indexCount);
  let vp = 0;
  let np = 0;
  let up = 0;
  let ip = 0;
  let base = 0;

  for (let blade = 0; blade < blades; blade++) {
    const lane = blade / (blades - 1);
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      for (const sideSign of [-0.5, 0.5]) {
        positions[vp++] = sideSign;
        positions[vp++] = t;
        positions[vp++] = lane;
        normals[np++] = 0;
        normals[np++] = 0;
        normals[np++] = 1;
        uvs[up++] = sideSign + 0.5;
        uvs[up++] = t;
      }
    }
    for (let s = 0; s < segments; s++) {
      const a = base + s * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices[ip++] = a;
      indices[ip++] = c;
      indices[ip++] = b;
      indices[ip++] = b;
      indices[ip++] = c;
      indices[ip++] = d;
    }
    base += (segments + 1) * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function isBladeOwnedHierarchy(variant: MaterialVariant): boolean {
  return variant.id === "blade-owned-hierarchy";
}

function describeBladeHierarchy(variant: MaterialVariant): BladeHierarchyStats {
  const enabled = isBladeOwnedHierarchy(variant);
  return {
    sourceRole: enabled
      ? "coverage/density/slope/orientation hints only"
      : "coverage plus visible blade strokes",
    visibleHierarchyOwner: enabled
      ? "clustered close-camera blade geometry/material"
      : "single source blade plane",
    enabled,
    subBladesPerRecord: enabled ? BLADE_HIERARCHY_SUB_BLADES : 1,
    materialVariant: variant.id,
    note: enabled
      ? "AA6B1AJ: each accepted source-storage record expands into several deterministic sub-blades; source diagnostics should stay clean and non-textural"
      : "legacy false-earth lab path retained for comparison",
  };
}

function createSourceStorageMaterial(
  grassData: any,
  visibleIndices: any,
  variant: MaterialVariant,
  collapseMode: GrassCollapseMode,
): any {
  const material = new THREE.MeshStandardNodeMaterial();
  material.side = THREE.DoubleSide;
  material.roughness = variant.roughness;
  material.metalness = variant.metalness;

  const local = attribute("position", "vec3");
  const bladeHierarchy = isBladeOwnedHierarchy(variant);
  const hierarchyMix = float(bladeHierarchy ? 1.0 : 0.0);
  const sourceProfileMix = float(variant.valueProfile === "source-value" ? 1.0 : 0.0);
  const vGeoNormal = varying(vec3(0.0));
  const vHeight = varying(float(0.0));
  const vDistFade = varying(float(0.0));
  const vSide = varying(vec3(0.0));
  const vClumpSeed = varying(float(0.0));
  const vBladeSeed = varying(float(0.0));
  const vLaneSeed = varying(float(0.0));
  const collapseHeightScale = collapseMode === "meadow" ? 0.045 : 1.0;
  const collapseWidthScale = collapseMode === "meadow" ? 0.22 : 1.0;
  const trueIndex = visibleIndices.element(instanceIndex);
  const data = grassData.element(trueIndex);

  const buildVertex = Fn(() => {
    const d0 = data.get("data0").toConst();
    const d1 = data.get("data1").toConst();
    const d2 = data.get("data2").toConst();
    const d3 = data.get("data3").toConst();

    const instancePos = d0.xyz;
    const t = local.y;
    const s = local.x.mul(2.0);
    const lane01 = local.z;
    const laneCentered = lane01.sub(0.5);
    const bend = d1.z;
    const windStrength = d1.w;
    const rotSin = d2.x;
    const rotCos = d2.y;
    const clumpSeed = d2.z;
    const bladeSeed = d2.w;
    const laneSeed = fract(bladeSeed.add(clumpSeed.mul(0.37)).add(lane01.mul(1.618)));
    const heightJitter = mix(float(1.0), float(0.58).add(laneSeed.mul(0.34)), hierarchyMix);
    const widthJitter = mix(
      float(1.0),
      float(0.14).add(oneMinus(laneSeed).mul(0.18)),
      hierarchyMix,
    );
    const width = d1.x.mul(collapseWidthScale).mul(widthJitter);
    const height = d1.y.mul(collapseHeightScale).mul(heightJitter);
    const tnX = d3.x;
    const tnZ = d3.y;
    const tnY = sqrt(max(float(0.0), float(1.0).sub(tnX.mul(tnX)).sub(tnZ.mul(tnZ))));
    const terrainNormal = normalize(vec3(tnX, tnY, tnZ));
    const yawJitter = laneCentered.mul(0.72).add(laneSeed.sub(0.5).mul(0.4)).mul(hierarchyMix);
    const jitterSin = sin(yawJitter);
    const jitterCos = cos(yawJitter);
    const forward = normalize(
      vec3(
        rotSin.mul(jitterCos).add(rotCos.mul(jitterSin)),
        float(0.0),
        rotCos.mul(jitterCos).sub(rotSin.mul(jitterSin)),
      ),
    );
    const tangentForward = normalize(forward.sub(terrainNormal.mul(dot(forward, terrainNormal))));
    const side = normalize(cross(tangentForward, terrainNormal));
    const windDir = normalize(vec3(0.82, 0.0, 0.36));
    const u = oneMinus(t);
    const t2 = t.mul(t);
    const u2 = u.mul(u);
    const laneBase = side
      .mul(laneCentered)
      .mul(float(0.026).add(width.mul(0.7)))
      .add(tangentForward.mul(laneSeed.sub(0.5)).mul(0.018))
      .mul(hierarchyMix);
    const p0 = instancePos.add(laneBase);
    const p1 = instancePos
      .add(laneBase)
      .add(terrainNormal.mul(height).mul(0.28))
      .add(tangentForward.mul(bend).mul(height).mul(0.1));
    const p2 = instancePos
      .add(laneBase)
      .add(terrainNormal.mul(height).mul(0.7))
      .add(tangentForward.mul(bend).mul(height).mul(0.34))
      .add(windDir.mul(windStrength).mul(height).mul(0.035));
    const p3 = instancePos
      .add(laneBase)
      .add(terrainNormal.mul(height))
      .add(tangentForward.mul(bend).mul(height).mul(0.62))
      .add(windDir.mul(windStrength).mul(height).mul(0.07));
    const center = p0
      .mul(u2.mul(u))
      .add(p1.mul(float(3.0)).mul(u2).mul(t))
      .add(p2.mul(float(3.0)).mul(u).mul(t2))
      .add(p3.mul(t2).mul(t));
    const tangent = normalize(
      p1
        .sub(p0)
        .mul(float(3.0))
        .mul(u2)
        .add(p2.sub(p1).mul(float(6.0)).mul(u).mul(t))
        .add(p3.sub(p2).mul(float(3.0)).mul(t2)),
    );
    const geoNormal = normalize(cross(side, tangent));
    const widthFactor = t
      .add(mix(float(0.32), float(0.3), sourceProfileMix))
      .mul(pow(oneMinus(t), mix(float(0.94), float(1.02), sourceProfileMix)));
    const centerMask = pow(oneMinus(t), float(0.48)).mul(pow(t.add(float(0.05)), float(0.33)));
    const cameraDir = normalize(cameraPosition.sub(center));
    const viewSideSigned = dot(cameraDir, side);
    const viewSide = abs(viewSideSigned);
    const bladeSideOffset = side.mul(width).mul(widthFactor).mul(s);
    const legacyViewBulk = viewSide
      .mul(centerMask)
      .mul(mix(float(0.022), float(0.026), hierarchyMix));
    const legacyPos = center.add(bladeSideOffset).add(geoNormal.mul(legacyViewBulk).mul(s));
    const sourceEdgeMask = clamp(
      uv()
        .x.sub(float(0.5))
        .mul(viewSideSigned)
        .mul(pow(viewSide, float(1.2))),
      float(0.0),
      float(1.0),
    );
    const sourceThickness = width
      .mul(float(1.6))
      .mul(sourceEdgeMask)
      .mul(clamp(centerMask, float(0.0), float(1.0)));
    const sourceNormalXz = normalize(vec3(geoNormal.x, float(0.0), geoNormal.z));
    const sourcePos = center
      .add(side.mul(width).mul(widthFactor).mul(s))
      .add(sourceNormalXz.mul(sourceThickness));
    const finalPos = mix(legacyPos, sourcePos, sourceProfileMix);

    vGeoNormal.assign(geoNormal);
    vHeight.assign(t);
    vDistFade.assign(smoothstep(float(18.0), float(42.0), length(cameraPosition.sub(instancePos))));
    vSide.assign(side);
    vClumpSeed.assign(clumpSeed);
    vBladeSeed.assign(bladeSeed);
    vLaneSeed.assign(laneSeed);
    return finalPos;
  });

  material.positionNode = Fn(() => buildVertex())();
  material.normalNode = Fn(() => {
    const bladeUv = uv();
    const u = bladeUv.x.sub(0.5);
    const sideNormal = normalize(vSide);
    const rimMask = smoothstep(float(0.32), float(0.5), abs(u));
    const midMask = oneMinus(smoothstep(float(0.0), float(0.18), abs(u)));
    const legacyWidthNormal = sideNormal.mul(rimMask.mul(0.4).sub(midMask.mul(0.1)));
    const legacyNormal = normalize(vGeoNormal.add(legacyWidthNormal));
    const sourceMid01 = smoothstep(float(-0.25), float(0.25), u);
    const sourceRimMask = smoothstep(float(0.42), float(0.45), abs(u));
    const sourceV01 = mix(sourceMid01, oneMinus(sourceMid01), sourceRimMask);
    const sourceNy = sourceV01.mul(float(2.0)).sub(float(1.0));
    const sourceNormal = normalize(vGeoNormal.add(sideNormal.mul(sourceNy).mul(float(0.35))));
    return transformNormalToView(normalize(mix(legacyNormal, sourceNormal, sourceProfileMix))).mul(
      faceDirection,
    );
  })();
  material.colorNode = Fn(() => {
    const h = vHeight;
    const root = vec3(variant.root[0], variant.root[1], variant.root[2]);
    const mid = vec3(variant.mid[0], variant.mid[1], variant.mid[2]);
    const tip = vec3(variant.tip[0], variant.tip[1], variant.tip[2]);
    const legacyBaseColor = mix(
      mix(root, mid, smoothstep(float(0.0), float(0.62), h)),
      tip,
      smoothstep(float(0.4), float(1.0), h),
    );
    const sourceBaseColor = mix(root, tip, h);
    const baseColor = mix(legacyBaseColor, sourceBaseColor, sourceProfileMix);
    const clumpFactor = mix(float(variant.clumpRange[0]), float(variant.clumpRange[1]), vClumpSeed);
    const bladeFactor = mix(
      float(variant.bladeRange[0]),
      float(variant.bladeRange[1]),
      fract(vBladeSeed.add(vLaneSeed.mul(0.37))),
    );
    const aoFloor = mix(
      float(collapseMode === "meadow" ? 0.92 : 0.34),
      float(0.35),
      sourceProfileMix,
    );
    const ao = mix(
      aoFloor,
      float(1.0),
      clamp(pow(h, float(variant.aoPower)), float(0.0), float(1.0)),
    );
    const gray = dot(baseColor, vec3(0.333));
    const desaturated = mix(baseColor, vec3(gray), vDistFade.mul(variant.distDesat));
    const laneDark = oneMinus(smoothstep(float(0.0), float(0.3), h))
      .mul(float(0.1))
      .mul(hierarchyMix);
    const laneLift = smoothstep(float(0.34), float(0.92), h)
      .mul(vLaneSeed.sub(0.5))
      .mul(float(0.045))
      .mul(hierarchyMix);
    const highlight = smoothstep(float(0.58), float(0.96), abs(uv().x.sub(0.5)).mul(2.0))
      .mul(smoothstep(float(0.12), float(0.92), h))
      .mul(mix(float(variant.highlight), float(variant.highlight * 0.85), hierarchyMix))
      .mul(oneMinus(sourceProfileMix));
    const color = desaturated
      .mul(clumpFactor)
      .mul(bladeFactor)
      .mul(ao.sub(laneDark))
      .add(vec3(highlight.add(laneLift)));
    return vec4(color, float(1.0));
  })();
  material.roughnessNode = Fn(() => {
    const legacyRoughness = mix(
      float(0.72),
      float(0.22),
      clamp(pow(vHeight, float(0.7)), float(0.0), float(1.0)),
    );
    const sourceAo = mix(
      float(0.35),
      float(1.0),
      clamp(pow(vHeight, float(variant.aoPower)), float(0.0), float(1.0)),
    );
    const sourceRoughness = mix(
      float(variant.roughness),
      float(variant.roughness * 0.85),
      smoothstep(float(0.35), float(1.0), sourceAo),
    );
    return mix(legacyRoughness, sourceRoughness, sourceProfileMix);
  })();
  return material;
}

function createFalseEarthMaterial(): any {
  const material = new THREE.MeshStandardNodeMaterial();
  material.side = THREE.DoubleSide;
  material.roughness = 0.31;
  material.metalness = 0.1;
  material.colorNode = Fn(() => {
    const bladeUv = uv();
    const h = bladeUv.y;
    const u = abs(bladeUv.x.sub(0.5)).mul(2.0);
    const root = vec3(0.1, 0.006, 0.02);
    const mid = vec3(0.44, 0.07, 0.105);
    const tip = vec3(0.72, 0.23, 0.285);
    const body = mix(
      mix(root, mid, smoothstep(float(0.0), float(0.62), h)),
      tip,
      smoothstep(float(0.42), float(1.0), h),
    );
    const ao = mix(float(0.32), float(1.0), clamp(pow(h, float(0.52)), float(0.0), float(1.0)));
    const rim = smoothstep(float(0.46), float(0.96), u)
      .mul(float(0.16))
      .mul(smoothstep(float(0.1), float(0.82), h));
    const midrib = oneMinus(smoothstep(float(0.0), float(0.18), abs(bladeUv.x.sub(0.5)))).mul(
      float(0.06),
    );
    const desat = smoothstep(float(0.76), float(1.0), h).mul(float(0.05));
    const gray = dot(body, vec3(0.333));
    const color = mix(body, vec3(gray), desat)
      .mul(ao)
      .add(vec3(rim.add(midrib)));
    return vec4(color, float(1.0));
  })();
  return material;
}

function buildTerrainMesh(
  variant: MaterialVariant,
  collapseMode: GrassCollapseMode,
  records: BladeRecord[],
  seed: number,
  meadowRenderMode: MeadowRenderMode,
  meadowReliefDebugView: MeadowReliefDebugView,
  floorDebugMode: FloorDebugMode,
): { mesh: any; meadowStats: MeadowStats } {
  const isMeadowCollapse = collapseMode === "meadow";
  const terrainWidth = isMeadowCollapse ? 80 : 44;
  const terrainDepth = isMeadowCollapse ? 104 : 58;
  const terrainSegmentsX = isMeadowCollapse ? 220 : 72;
  const terrainSegmentsZ = isMeadowCollapse ? 260 : 72;
  const terrainCenterZ = isMeadowCollapse ? -25 : -23;
  const geometry = new THREE.PlaneGeometry(
    terrainWidth,
    terrainDepth,
    terrainSegmentsX,
    terrainSegmentsZ,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.035, terrainCenterZ);
  const meadowStats = isMeadowCollapse
    ? applyMeadowTerrainField(
        geometry,
        records,
        seed,
        -terrainWidth * 0.5,
        terrainWidth * 0.5,
        terrainCenterZ - terrainDepth * 0.5,
        terrainCenterZ + terrainDepth * 0.5,
        meadowRenderMode,
        meadowReliefDebugView,
      )
    : emptyMeadowStats();
  const material =
    floorDebugMode === "terrain-chroma"
      ? new THREE.MeshBasicMaterial({ color: FLOOR_DIAGNOSTIC_KEY_COLOR, fog: false })
      : meadowStats.enabled
        ? new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true })
        : new THREE.MeshBasicMaterial({ color: variant.terrainColor });
  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, meadowStats };
}

function applyMeadowTerrainField(
  geometry: any,
  records: BladeRecord[],
  seed: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  meadowRenderMode: MeadowRenderMode,
  meadowReliefDebugView: MeadowReliefDebugView,
): MeadowStats {
  const position = geometry.getAttribute("position");
  const vertexCount = position.count;
  const colors = new Float32Array(vertexCount * 3);
  const gridCols = 128;
  const gridRows = 160;
  const densityGrid = new Uint16Array(gridCols * gridRows);
  const edgeMaskWidth = 16;
  const sourceFootprintClampMargin = 1.5;
  let coveredCells = 0;

  for (const record of records) {
    const x = record.data0[0];
    const z = record.data0[2];
    const gx = Math.floor(((x - minX) / (maxX - minX)) * gridCols);
    const gz = Math.floor(((z - minZ) / (maxZ - minZ)) * gridRows);
    if (gx < 0 || gx >= gridCols || gz < 0 || gz >= gridRows) continue;
    const index = gz * gridCols + gx;
    if (densityGrid[index] === 0) coveredCells++;
    densityGrid[index]++;
  }

  const sampledDensities: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const terrain = terrainAt(x, z);
    const debugRelief = meadowReliefDebugAt(x, z, seed);
    const debugNormal =
      meadowRenderMode === "relief-debug" ? meadowReliefDebugNormalAt(x, z, seed) : terrain.normal;
    position.setY(
      i,
      terrain.height + (meadowRenderMode === "relief-debug" ? debugRelief.height : 0) - 0.055,
    );
    const edgeDistance = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    const terrainEdgeFade = smoothstepNumber(0, edgeMaskWidth, edgeDistance);
    const densitySampleX = Math.max(
      -SOURCE_WIDTH * 0.5 + sourceFootprintClampMargin,
      Math.min(SOURCE_WIDTH * 0.5 - sourceFootprintClampMargin, x),
    );
    const density = sampleMeadowDensity(
      densityGrid,
      gridCols,
      gridRows,
      minX,
      maxX,
      minZ,
      maxZ,
      densitySampleX,
      z,
    );
    sampledDensities.push(density);
    if (meadowRenderMode === "relief-debug") {
      const light = normalize3([-0.46, 0.74, 0.5]);
      if (meadowReliefDebugView === "scalar") {
        const heightTone = smoothstepNumber(-0.34, 0.34, debugRelief.height);
        const ridgeTone = smoothstepNumber(-1, 1, debugRelief.ridge);
        const tone = clamp01(heightTone * 0.74 + ridgeTone * 0.26);
        const finalColor: Vec3 = [tone, tone, tone];
        colors[i * 3] = finalColor[0];
        colors[i * 3 + 1] = finalColor[1];
        colors[i * 3 + 2] = finalColor[2];
        continue;
      }
      if (meadowReliefDebugView === "normal-lit") {
        const normalLight = clamp01(0.5 + (dot3(debugNormal, light) - 0.735) * 18);
        const heightTone = smoothstepNumber(-0.34, 0.34, debugRelief.height);
        const tone = clamp01(normalLight * 0.9 + heightTone * 0.1);
        const shadow: Vec3 = [0.06, 0.06, 0.06];
        const highlight: Vec3 = [0.94, 0.94, 0.94];
        const finalColor = mixVec3(shadow, highlight, tone);
        colors[i * 3] = finalColor[0];
        colors[i * 3 + 1] = finalColor[1];
        colors[i * 3 + 2] = finalColor[2];
        continue;
      }
      const reliefLight = dot3(debugNormal, light) - 0.7;
      const crest = smoothstepNumber(0.38, 0.72, debugRelief.ridge);
      const trough = smoothstepNumber(0.34, 0.7, -debugRelief.ridge);
      const sideSlope = smoothstepNumber(0.2, 0.72, Math.abs(debugRelief.ridge));
      const crossCut = smoothstepNumber(0.34, 0.82, debugRelief.mid);
      const ridgeTone =
        0.44 + crest * 0.34 - trough * 0.3 + sideSlope * 0.12 + crossCut * 0.08 + reliefLight * 1.2;
      const low: Vec3 = [0.16, 0.2, 0.15];
      const mid: Vec3 = [0.46, 0.53, 0.38];
      const high: Vec3 = [0.82, 0.86, 0.68];
      const baseColor = mixVec3(low, mid, clamp01(ridgeTone));
      const highlighted = mixVec3(baseColor, high, crest * 0.44);
      const finalColor = mixVec3(highlighted, low, trough * 0.42);
      colors[i * 3] = finalColor[0];
      colors[i * 3 + 1] = finalColor[1];
      colors[i * 3 + 2] = finalColor[2];
      continue;
    }
    const fieldPatch = smoothstepNumber(
      0.18,
      0.92,
      Math.sin(x * 0.36 - z * 0.2 + seed * 0.00007) * 0.5 +
        Math.sin(x * -0.24 + z * 0.18 + 3.1) * 0.5,
    );
    const cover = smoothstepNumber(0.015, 0.54, density);
    const macroWave =
      Math.sin(x * 0.18 + z * 0.16 + seed * 0.00011) * 0.45 +
      Math.sin(x * -0.12 + z * 0.24 + 1.7) * 0.35 +
      Math.sin(x * 0.29 - z * 0.11 + 2.9) * 0.2;
    const mediumWave = Math.sin(x * 0.62 + z * 0.44 + 0.9) * Math.sin(x * -0.34 + z * 0.56 + 2.1);
    const longRidge =
      Math.sin(x * 0.1 + z * 0.38 + 0.5) * 0.65 + Math.sin(x * -0.18 + z * 0.3 + 2.4) * 0.35;
    const laneMask = mixNumber(0.9, 1, terrainEdgeFade);
    const darkLane = smoothstepNumber(0.18, 0.86, -longRidge) * laneMask;
    const lightCrest = smoothstepNumber(0.35, 0.96, longRidge) * laneMask;
    const light = normalize3([-0.46, 0.74, 0.5]);
    const relief = dot3(terrain.normal, light) - 0.72;
    const shade =
      macroWave * 0.19 + mediumWave * 0.055 + relief * 0.62 + lightCrest * 0.13 - darkLane * 0.2;
    const base: Vec3 = [0.25, 0.34, 0.16];
    const high: Vec3 = [0.42, 0.5, 0.28];
    const dark: Vec3 = [0.08, 0.14, 0.06];
    const grassColor = mixVec3(base, high, cover * 0.56 + fieldPatch * 0.22);
    const trough = mixVec3(
      grassColor,
      dark,
      (1 - cover) * 0.22 + darkLane * 0.32 + Math.max(0, -shade) * 0.55,
    );
    const finalColor: Vec3 = [
      clamp01(trough[0] + shade * 0.38),
      clamp01(trough[1] + shade * 0.32),
      clamp01(trough[2] + shade * 0.22),
    ];
    colors[i * 3] = finalColor[0];
    colors[i * 3 + 1] = finalColor[1];
    colors[i * 3 + 2] = finalColor[2];
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  sampledDensities.sort((a, b) => a - b);
  const meanDensity =
    sampledDensities.reduce((sum, value) => sum + value, 0) / Math.max(1, sampledDensities.length);
  const densityP95 =
    sampledDensities[
      Math.min(sampledDensities.length - 1, Math.floor(sampledDensities.length * 0.95))
    ] ?? 0;
  return {
    enabled: true,
    sourceRecordsOwnField: true,
    terrainVertexColors: true,
    terrainRelief: true,
    edgeMaskEnabled: true,
    edgeMaskWidth,
    sourceFootprintDensityExtrapolation: true,
    sourceFootprintClampMargin,
    reliefDebugEnabled: meadowRenderMode === "relief-debug",
    reliefDebugView: meadowReliefDebugView,
    reliefDomainRotationDegrees: meadowRenderMode === "relief-debug" ? 28 : 0,
    reliefRidgeScale: meadowRenderMode === "relief-debug" ? 0.34 : 0,
    coverage: coveredCells / densityGrid.length,
    meanDensity,
    densityP95,
    gridCells: densityGrid.length,
    collapseStrength: 0.92,
    bladeStrokeVisibility: 0.025,
    note:
      meadowRenderMode === "relief-debug"
        ? `AA6B1B diagnostic mode: ${meadowReliefDebugView} relief view over the existing rejected rotated ridge/trough source`
        : `AA6A top-down mode: grass records are binned into a darker meadow colour field with no carrier-edge tint and source-footprint density extrapolation outside x +/-${SOURCE_WIDTH * 0.5 - sourceFootprintClampMargin}m`,
  };
}

function meadowReliefDebugAt(
  x: number,
  z: number,
  seed: number,
): { height: number; ridge: number; mid: number } {
  const angle = (28 * Math.PI) / 180;
  const rx = x * Math.cos(angle) - z * Math.sin(angle);
  const rz = x * Math.sin(angle) + z * Math.cos(angle);
  const flow = Math.sin(rx * 0.11 + seed * 0.00003) * 0.36 + Math.sin(rx * 0.27 + 1.7) * 0.18;
  const ridge =
    Math.sin(rz * 0.92 + flow) * 0.52 +
    Math.sin(rz * 1.44 + rx * 0.11 + 2.1) * 0.32 +
    Math.sin(rz * 0.58 - rx * 0.18 + 4.4) * 0.16;
  const mid =
    Math.sin(rz * 1.92 + rx * 0.24 + 0.6) * 0.42 +
    Math.sin(rz * 2.5 - rx * 0.18 + 2.7) * 0.31 +
    Math.sin(rz * 1.36 + rx * 0.38 + 4.8) * 0.27;
  return {
    height: ridge * 0.2 + mid * 0.05,
    ridge,
    mid,
  };
}

function meadowReliefDebugNormalAt(x: number, z: number, seed: number): Vec3 {
  const eps = 0.24;
  const hx =
    terrainHeight(x + eps, z) +
    meadowReliefDebugAt(x + eps, z, seed).height -
    terrainHeight(x - eps, z) -
    meadowReliefDebugAt(x - eps, z, seed).height;
  const hz =
    terrainHeight(x, z + eps) +
    meadowReliefDebugAt(x, z + eps, seed).height -
    terrainHeight(x, z - eps) -
    meadowReliefDebugAt(x, z - eps, seed).height;
  return normalize3([-hx / (2 * eps), 1, -hz / (2 * eps)]);
}

function sampleMeadowDensity(
  densityGrid: Uint16Array,
  gridCols: number,
  gridRows: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  x: number,
  z: number,
): number {
  const gx = Math.floor(((x - minX) / (maxX - minX)) * gridCols);
  const gz = Math.floor(((z - minZ) / (maxZ - minZ)) * gridRows);
  let sum = 0;
  let weight = 0;
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox;
      const cz = gz + oz;
      if (cx < 0 || cx >= gridCols || cz < 0 || cz >= gridRows) continue;
      const w = ox === 0 && oz === 0 ? 1.0 : 0.45;
      sum += densityGrid[cz * gridCols + cx] * w;
      weight += w;
    }
  }
  return Math.min(1, sum / Math.max(1, weight) / 3.6);
}

function emptyMeadowStats(): MeadowStats {
  return {
    enabled: false,
    sourceRecordsOwnField: false,
    terrainVertexColors: false,
    terrainRelief: false,
    edgeMaskEnabled: false,
    edgeMaskWidth: 0,
    sourceFootprintDensityExtrapolation: false,
    sourceFootprintClampMargin: 0,
    reliefDebugEnabled: false,
    reliefDebugView: "none",
    reliefDomainRotationDegrees: 0,
    reliefRidgeScale: 0,
    coverage: 0,
    meanDensity: 0,
    densityP95: 0,
    gridCells: 0,
    collapseStrength: 0,
    bladeStrokeVisibility: 1,
    note: "close/material strand mode: terrain is a flat diagnostic fill so strand failures remain visible",
  };
}

function resolveMaterialVariant(
  value: string | null,
  collapseMode: GrassCollapseMode,
): MaterialVariant {
  if (
    value === "source-pbr" ||
    value === "source-pbr-base-fill" ||
    value === "source-value-structure" ||
    value === "top-down-meadow-collapse" ||
    value === "blade-owned-hierarchy"
  ) {
    return MATERIAL_VARIANTS[value];
  }
  if (collapseMode === "meadow") return MATERIAL_VARIANTS["top-down-meadow-collapse"];
  return MATERIAL_VARIANTS["aa1-storage"];
}

function resolveCameraSpec(value: string | null): GrassCameraSpec {
  return value === "top-down" ? TOP_DOWN_CAMERA : CLOSE_CAMERA;
}

function resolveGrassCollapse(
  value: string | null,
  cameraSpec: GrassCameraSpec,
): GrassCollapseMode {
  return value === "meadow" && cameraSpec.mode === "top-down" ? "meadow" : "strands";
}

function resolveMeadowRenderMode(
  value: string | null,
  collapseMode: GrassCollapseMode,
): MeadowRenderMode {
  return collapseMode === "meadow" && value === "relief" ? "relief-debug" : "material";
}

function resolveMeadowReliefDebugView(
  value: string | null,
  meadowRenderMode: MeadowRenderMode,
): MeadowReliefDebugView {
  if (meadowRenderMode !== "relief-debug") return "none";
  if (value === "scalar" || value === "normal-lit") return value;
  return "presentation";
}

function resolveFloorDebugMode(value: string | null): FloorDebugMode {
  return value === "terrain-chroma" || value === "chroma" || value === "magenta"
    ? "terrain-chroma"
    : "none";
}

function resolveDensityCoverageMode(params: URLSearchParams): DensityCoverageMode {
  const value = params.get("densityCoverage") ?? params.get("parity");
  return value === "bf2-density" ||
    value === "bf2-density-parity" ||
    value === "false-earth-density" ||
    value === "false-earth-density-parity"
    ? "bf2-density-parity"
    : "source-close";
}

function resolveValueStructureMode(
  params: URLSearchParams,
  densityCoverageMode: DensityCoverageMode,
): ValueStructureMode {
  const value = params.get("valueStructure") ?? params.get("materialPass");
  return densityCoverageMode === "bf2-density-parity" &&
    (value === "bf3-source" || value === "source-value" || value === "false-earth-value")
    ? "bf3-source"
    : "none";
}

function resolveBladeFieldSpec(
  mode: DensityCoverageMode,
  fieldLayout: GrassFieldLayout,
  cullProof: boolean,
  bladeLimit: number,
  sourceDensityBoost: number,
): BladeFieldSpec {
  if (mode === "bf2-density-parity") {
    const targetBladesPerAxis = 1024 / 80;
    const columns = Math.round(SOURCE_WIDTH * targetBladesPerAxis);
    const rows = Math.round(SOURCE_DEPTH * targetBladesPerAxis);
    const candidateCount = columns * rows;
    return {
      id: mode,
      columns,
      rows,
      width: SOURCE_WIDTH,
      depth: SOURCE_DEPTH,
      nearZ: -1.25,
      limit: candidateCount,
      densityBoost: 0.07,
      tiers: FALSE_EARTH_DENSITY_TIERS,
      targetBladesPerAxis,
      targetAreaM2: 80 * 80,
      targetDensityPerM2: targetBladesPerAxis * targetBladesPerAxis,
      capReason: null,
      note: "BF2 density parity candidate: one skinny plane per accepted record, false-earth 12.8 blade/m placement lattice over the close-lab footprint, and candidate-scoped 15/5/2 LOD tiers",
    };
  }

  const depth = fieldLayout === "top-down-centered" ? 50 : cullProof ? 66 : SOURCE_DEPTH;
  const candidateCount = SOURCE_COLUMNS * SOURCE_ROWS;
  return {
    id: mode,
    columns: SOURCE_COLUMNS,
    rows: SOURCE_ROWS,
    width: SOURCE_WIDTH,
    depth,
    nearZ: fieldLayout === "top-down-centered" ? depth * 0.5 : -1.25,
    limit: bladeLimit,
    densityBoost: sourceDensityBoost,
    tiers: TIERS,
    targetBladesPerAxis: SOURCE_COLUMNS / SOURCE_WIDTH,
    targetAreaM2: SOURCE_WIDTH * depth,
    targetDensityPerM2: candidateCount / Math.max(1, SOURCE_WIDTH * depth),
    capReason:
      bladeLimit < candidateCount
        ? "profile cap truncates the row-major diagnostic field before all candidate cells are considered"
        : null,
    note: "existing close-lab source field retained for control and historical slice comparison",
  };
}

function describeDensityCoverageNormalizations(
  params: URLSearchParams,
  requested: boolean,
  requestedCameraSpec: GrassCameraSpec,
  requestedRecordSource: GrassRecordSource,
): string[] {
  if (!requested) return [];
  const notes: string[] = [];
  if (params.get("backend") === "cpu-expanded") {
    notes.push("backend=cpu-expanded normalized to source-storage for the storage-backed BF2 path");
  }
  if (requestedCameraSpec.mode !== "close") {
    notes.push("camera normalized to close so BF2 compares against BF0/BF1 foreground captures");
  }
  if (params.get("grassCollapse") === "meadow") {
    notes.push("grassCollapse=meadow normalized to strands; BF2 judges individual blade coverage");
  }
  if (params.get("materialVariant") === "blade-owned-hierarchy") {
    notes.push(
      "materialVariant=blade-owned-hierarchy normalized to source-pbr; BF2 requires one plane per blade",
    );
  } else if (params.has("materialVariant") && params.get("materialVariant") !== "source-pbr") {
    notes.push("materialVariant normalized to source-pbr so BF2 changes density/geometry only");
  }
  if (requestedRecordSource === "gpu-generated") {
    notes.push(
      "records=gpu normalized to cpu-preseeded because the current GPU generator does not share the CPU field spec",
    );
  }
  if (params.get("cullProof") === "1") {
    notes.push("cullProof ignored; BF2 uses the fixed close source footprint");
  }
  if (params.get("profile") === "bounded-lite") {
    notes.push("profile=bounded-lite ignored; BF2 publishes the uncapped parity candidate");
  }
  return notes;
}

function resolveRecordSource(value: string | null, backend: GrassBackend): GrassRecordSource {
  return backend === "source-storage" && (value === "gpu" || value === "gpu-generated")
    ? "gpu-generated"
    : "cpu-preseeded";
}

function roundMetric(value: number): number {
  return Number(value.toFixed(5));
}

function describeMaterialFeatures(
  mode: ValueStructureMode,
  variant: MaterialVariant,
): MaterialFeatureStats {
  const sourceProfile = variant.valueProfile === "source-value";
  return {
    mode,
    materialVariant: variant.id,
    valueProfile: variant.valueProfile,
    sourceHeightAO: sourceProfile,
    sourceHeightColorBlend: sourceProfile,
    sourceDistanceDesaturation: sourceProfile,
    sourceWidthNormalShaping: sourceProfile,
    sourceViewDependentThickness: sourceProfile,
    roughnessFollowsAO: sourceProfile,
    geometryStatsFrozen: mode === "bf3-source",
    aoPower: variant.aoPower,
    metalness: variant.metalness,
    roughness: variant.roughness,
    additiveHighlight: variant.highlight > 0,
    apparentWidthBase: sourceProfile ? 0.3 : 0.32,
    apparentTipThin: sourceProfile ? 1.02 : 0.94,
    viewThickness: sourceProfile ? "bladeWidth * 1.6" : "absolute 0.022-0.026m",
    note: sourceProfile
      ? "BF3 source-value profile mirrors false-earth material/value shaping while leaving BF2 density, record source, LOD tiers, draw calls, and submitted geometry stats fixed"
      : "legacy lab material profile",
  };
}

function describeDensityCoverage(
  mode: DensityCoverageMode,
  requested: boolean,
  fieldSpec: BladeFieldSpec,
  records: BladeRecord[],
  renderResult: GrassRenderResult,
  recordSource: GrassRecordSource,
  materialVariant: MaterialVariant,
  normalizations: string[],
): DensityCoverageStats {
  const area = fieldSpec.width * fieldSpec.depth;
  const gridStepX = fieldSpec.width / fieldSpec.columns;
  const gridStepZ = fieldSpec.depth / fieldSpec.rows;
  const renderedRecords = Object.values(renderResult.tierStats).reduce(
    (sum, tier) => sum + tier.blades,
    0,
  );
  return {
    mode,
    requested,
    onePlanePerBlade: !isBladeOwnedHierarchy(materialVariant),
    targetBladesPerAxis: roundMetric(fieldSpec.targetBladesPerAxis),
    targetAreaM2: roundMetric(fieldSpec.targetAreaM2),
    targetDensityPerM2: roundMetric(fieldSpec.targetDensityPerM2),
    actualColumns: fieldSpec.columns,
    actualRows: fieldSpec.rows,
    actualAreaM2: roundMetric(area),
    gridStepX: roundMetric(gridStepX),
    gridStepZ: roundMetric(gridStepZ),
    snapCellSize: roundMetric(SNAP_CELL_SIZE),
    gridStepMatchesSnap:
      Math.abs(gridStepX - SNAP_CELL_SIZE) < 0.0008 &&
      Math.abs(gridStepZ - SNAP_CELL_SIZE) < 0.0008,
    candidateCount: fieldSpec.columns * fieldSpec.rows,
    acceptedRecords: records.length,
    renderedRecords,
    acceptedDensityPerM2: roundMetric(records.length / Math.max(1, area)),
    renderedDensityPerM2: roundMetric(renderedRecords / Math.max(1, area)),
    recordSource,
    lodDistances: fieldSpec.tiers.map((tier) => ({
      id: tier.id,
      minDistance: tier.minDistance,
      maxDistance: tier.maxDistance,
      segments: tier.segments,
    })),
    drawCalls: renderResult.drawCalls,
    submittedTriangles: renderResult.submittedTriangles,
    cap: {
      limit: fieldSpec.limit,
      exists: fieldSpec.limit < fieldSpec.columns * fieldSpec.rows,
      reason: fieldSpec.capReason,
    },
    normalizedQuery: normalizations,
    note: requested
      ? fieldSpec.note
      : "control route: density stats describe the current lab field rather than a BF2 candidate",
  };
}

function describeFloorDiagnostic(mode: FloorDebugMode): FloorDiagnosticStats {
  return {
    enabled: mode === "terrain-chroma",
    mode,
    keyColor: "#ff00ff",
    terrainOnly: true,
    preservesGrassGeometry: true,
    preservesGrassMaterial: true,
    note:
      mode === "terrain-chroma"
        ? "BF1 diagnostic: terrain/floor is rendered magenta so screenshot analysis can measure exposed floor separately from dark grass roots"
        : "normal route: terrain uses the selected material variant; floor visibility is not instrumented",
  };
}

function resolveVisibilityProfile(
  cameraSpec: GrassCameraSpec,
  collapseMode: GrassCollapseMode,
): VisibilityProfile {
  return cameraSpec.mode === "top-down" && collapseMode === "meadow"
    ? VISIBILITY_PROFILES["top-down-review"]
    : VISIBILITY_PROFILES["close-strand-fog"];
}

function resolveFieldLayout(
  cameraSpec: GrassCameraSpec,
  collapseMode: GrassCollapseMode,
): GrassFieldLayout {
  return cameraSpec.mode === "top-down" && collapseMode === "meadow"
    ? "top-down-centered"
    : "close-forward";
}

function terrainAt(x: number, z: number): { height: number; normal: Vec3; slope: number } {
  const h = terrainHeight(x, z);
  const eps = 0.18;
  const hx = terrainHeight(x + eps, z) - terrainHeight(x - eps, z);
  const hz = terrainHeight(x, z + eps) - terrainHeight(x, z - eps);
  const normal = normalize3([-hx / (2 * eps), 1, -hz / (2 * eps)]);
  return { height: h, normal, slope: 1 - normal[1] };
}

function terrainHeight(x: number, z: number): number {
  const far = smoothstepNumber(-10, -42, z);
  const roll = 0.2 * Math.sin(x * 0.33 + z * 0.12) + 0.14 * Math.sin(x * 0.77 - z * 0.18);
  const clumpRise =
    0.28 * Math.exp(-((x + 7) ** 2) / 70 - (z + 19) ** 2 / 220) +
    0.34 * Math.exp(-((x - 9) ** 2) / 120 - (z + 28) ** 2 / 180);
  return roll + clumpRise + far * 2.6;
}

function clumpInfo(x: number, z: number, seed: number) {
  const size = 1.55;
  const cx = Math.floor(x / size);
  const cz = Math.floor(z / size);
  let bestD = Number.POSITIVE_INFINITY;
  let secondD = Number.POSITIVE_INFINITY;
  let best: [number, number] = [cx, cz];
  let second: [number, number] = [cx + 1, cz];
  let toCenter: [number, number] = [0, 0];
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) {
      const idX = cx + ox;
      const idZ = cz + oz;
      const r = hash2Pair(idX, idZ, seed + 707);
      const px = (idX + r[0]) * size;
      const pz = (idZ + r[1]) * size;
      const dx = px - x;
      const dz = pz - z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        secondD = bestD;
        second = best;
        bestD = d;
        best = [idX, idZ];
        toCenter = [dx, dz];
      } else if (d < secondD) {
        secondD = d;
        second = [idX, idZ];
      }
    }
  }
  return {
    best,
    second,
    toCenter,
    blend: mixNumber(0.5, 1.0, smoothstepNumber(0.0, 0.62, secondD - bestD)),
  };
}

function canvasSize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width || window.innerWidth)),
    height: Math.max(1, Math.round(rect.height || window.innerHeight)),
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  };
}

function publish(route: string, ok: boolean, stats: unknown) {
  const w = window as unknown as { __rendererLabReady?: boolean; __rendererLabStats?: unknown };
  w.__rendererLabReady = true;
  w.__rendererLabStats = { ok, route, stats };
}

function reportTable(values: Record<string, unknown>) {
  const rows = Object.entries(values)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reconstructNormal(x: number, z: number): Vec3 {
  return normalize3([x, Math.sqrt(Math.max(0, 1 - x * x - z * z)), z]);
}

function bezier3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return [
    u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    u ** 3 * p0[2] + 3 * u * u * t * p1[2] + 3 * u * t * t * p2[2] + t ** 3 * p3[2],
  ];
}

function bezier3Tangent(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return [
    3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
    3 * u * u * (p1[2] - p0[2]) + 6 * u * t * (p2[2] - p1[2]) + 3 * t * t * (p3[2] - p2[2]),
  ];
}

function projectOnPlane(v: Vec3, normal: Vec3): Vec3 {
  return sub3(v, scale3(normal, dot3(v, normal)));
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(v: Vec3): Vec3 {
  const d = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / d, v[1] / d, v[2] / d];
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mixNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [mixNumber(a[0], b[0], t), mixNumber(a[1], b[1], t), mixNumber(a[2], b[2], t)];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstepNumber(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number, seed: number): number {
  let n =
    Math.imul(Math.trunc(x) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.trunc(y) + seed, 0xc2b2ae35);
  n ^= n >>> 16;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

function hash2Pair(x: number, y: number, seed: number): [number, number] {
  return [hash2(x, y, seed), hash2(x + 97, y - 31, seed + 53)];
}
