// Production blade-field layer for the photoreal substrate. It consumes the
// existing grassField.ts CPU records (4 vec4 / 64 bytes) and draws one
// instanced Bezier blade tier per LOD.
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  abs,
  attribute,
  atomicAdd,
  atomicStore,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  float,
  fract,
  instanceIndex,
  instancedArray,
  length,
  log,
  max,
  min,
  mix,
  normalize,
  pow,
  sin,
  smoothstep,
  step,
  storage,
  struct,
  uint,
  varying,
  vec2,
  vec3,
  vec4,
  cameraViewMatrix,
} from "three/tsl";
import {
  GRASS_FIELD_PACKED_BYTES,
  GRASS_FIELD_PACKED_STRIDE_FLOATS,
} from "../../../game-renderer/src/battle/grassField";
import { MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import {
  MEADOW_GRASS_MESH_NAME_PREFIX,
  type MeadowGrassLayer,
} from "./meadowGrassLayer";
import {
  linearAlbedo,
  rgbNode,
  smoothstepN,
  typedUniform,
  viewNormalNode,
  type FloatNode,
  type UniformNode,
  type Vec2Node,
  type Vec3Node,
} from "./battleTsl";
import { RENDER_ORDER } from "./terrainLayer";
import {
  createWindUniforms,
  type BattleWindUniforms,
} from "../../../game-renderer/src/battle/windSignal";

export type BladeFieldTierId = "near" | "mid" | "far";

export interface BladeFieldTierSpec {
  id: BladeFieldTierId;
  lodTier: 0 | 1 | 2;
  segments: number;
  minDistanceM: number;
  maxDistanceM: number;
}

export interface BladeFieldTransitionProfile {
  denseBladeEndM: number;
  farGrassStartM: number;
  farGrassEndM: number;
  nearTierEndM?: number;
  midTierEndM?: number;
  farSoftWidthScale?: number;
  /** Blades sink to turf across [start, end] so the coverage radius never
   *  shows a full-height cutoff. Production-scale rings only - the ratified
   *  close-lab profile (64m ring) keeps its hard edge (undefined = no sink). */
  edgeSinkStartM?: number;
  /** Strength of the terrain-only far grass brush. Blade-field lab routes can
   *  keep ratified blade statistics by setting this to zero. */
  terrainDetailStrength?: number;
  /** Near/mid width lift for living-meadow density. Defaults to 1. */
  nearCoverageWidthScale?: number;
  /** Lower-far width lift. Defaults to 1 and fades out by lowerFarWidthEndM so
   *  true horizon density stays sampling-owned. */
  lowerFarWidthScale?: number;
  lowerFarWidthEndM?: number;
}

type FloatUniformNode = UniformNode<number>;
type Vec2UniformNode = UniformNode<THREE.Vector2>;
type Vec3UniformNode = UniformNode<THREE.Vector3>;

export const BLADE_FIELD_TRANSLUCENCY = {
  // Baked from the orchestrator's live sweep (2026-07-26): with the display
  // cap + distance fade in place, the timid post-fix defaults were invisible;
  // these read as soft warm backlight with no far-field sparkle.
  rimStrength: 2.5,
  subsurfaceStrength: 5.1,
  maxDisplayEmission: 1.25,
  nearDissolveFloor: 0.3,
  rimExponent: 4.2,
  subsurfaceViewPower: 3.2,
  subsurfaceSunEdgePower: 2.2,
} as const;

export type BladeFieldTransition = Required<
  Omit<BladeFieldTransitionProfile, "edgeSinkStartM">
> &
  Pick<BladeFieldTransitionProfile, "edgeSinkStartM">;

export class BladeFieldTransitionUniforms {
  private snapshot: Readonly<BladeFieldTransition>;
  readonly denseBladeEndM: FloatUniformNode;
  readonly farGrassStartM: FloatUniformNode;
  readonly farGrassEndM: FloatUniformNode;
  readonly nearTierEndM: FloatUniformNode;
  readonly midTierEndM: FloatUniformNode;
  readonly farSoftWidthScale: FloatUniformNode;
  readonly edgeSinkStartM: FloatUniformNode;
  readonly terrainDetailStrength: FloatUniformNode;
  readonly nearCoverageWidthScale: FloatUniformNode;
  readonly lowerFarWidthScale: FloatUniformNode;
  readonly lowerFarWidthEndM: FloatUniformNode;

  constructor(profile: BladeFieldTransitionProfile) {
    this.snapshot = transitionSnapshot(profile);
    this.denseBladeEndM = typedUniform(this.snapshot.denseBladeEndM);
    this.farGrassStartM = typedUniform(this.snapshot.farGrassStartM);
    this.farGrassEndM = typedUniform(this.snapshot.farGrassEndM);
    this.nearTierEndM = typedUniform(this.snapshot.nearTierEndM);
    this.midTierEndM = typedUniform(this.snapshot.midTierEndM);
    this.farSoftWidthScale = typedUniform(this.snapshot.farSoftWidthScale);
    this.edgeSinkStartM = typedUniform(
      this.snapshot.edgeSinkStartM ?? Math.max(0, this.snapshot.farGrassEndM - 0.001),
    );
    this.terrainDetailStrength = typedUniform(this.snapshot.terrainDetailStrength);
    this.nearCoverageWidthScale = typedUniform(this.snapshot.nearCoverageWidthScale);
    this.lowerFarWidthScale = typedUniform(this.snapshot.lowerFarWidthScale);
    this.lowerFarWidthEndM = typedUniform(this.snapshot.lowerFarWidthEndM);
  }

  transition(): Readonly<BladeFieldTransition> {
    return this.snapshot;
  }

  update(profile: BladeFieldTransitionProfile): Readonly<BladeFieldTransition> {
    const snapshot = transitionSnapshot(profile);
    this.snapshot = snapshot;
    this.denseBladeEndM.value = snapshot.denseBladeEndM;
    this.farGrassStartM.value = snapshot.farGrassStartM;
    this.farGrassEndM.value = snapshot.farGrassEndM;
    this.nearTierEndM.value = snapshot.nearTierEndM;
    this.midTierEndM.value = snapshot.midTierEndM;
    this.farSoftWidthScale.value = snapshot.farSoftWidthScale;
    this.edgeSinkStartM.value =
      snapshot.edgeSinkStartM ?? Math.max(0, snapshot.farGrassEndM - 0.001);
    this.terrainDetailStrength.value = snapshot.terrainDetailStrength;
    this.nearCoverageWidthScale.value = snapshot.nearCoverageWidthScale;
    this.lowerFarWidthScale.value = snapshot.lowerFarWidthScale;
    this.lowerFarWidthEndM.value = snapshot.lowerFarWidthEndM;
    return snapshot;
  }
}

export interface BladeFieldWindUniforms extends BattleWindUniforms {
  meanDirection: Vec2UniformNode;
  speed: FloatUniformNode;
  gustPhase: FloatUniformNode;
  gustStrength: FloatUniformNode;
  bandVelocity: Vec2UniformNode;
  bandFrequency: FloatUniformNode;
  bandSharpness: FloatUniformNode;
}

export function createBladeFieldWindUniforms(): BladeFieldWindUniforms {
  return createWindUniforms({
    meanDirection: typedUniform(new THREE.Vector2(0, 0)),
    speed: typedUniform(0),
    gustPhase: typedUniform(0),
    gustStrength: typedUniform(0),
    bandVelocity: typedUniform(new THREE.Vector2(0, 0)),
    bandFrequency: typedUniform(0),
    bandSharpness: typedUniform(0),
  });
}

export interface BladeFieldMeadowFarDensityProfile {
  farGrassEndM: number;
  densityReferenceM: number;
  falloffPower: 1.5;
  farSoftWidthScale?: number;
  edgeSinkStartM?: number;
  /** Local mesh fan-out per packed record; keeps the 16-float record schema. */
  bladesPerRecord?: Partial<Record<BladeFieldTierId, number>>;
  /** Width lift applied before the far-soft band. */
  nearCoverageWidthScale?: number;
  /** Moves the mid tier into the close crop's real foreground band. */
  midTierEndM?: number;
  /** Extra lower-far width so the close foreground band does not fall
   *  back to scattered spikes. */
  lowerFarWidthScale?: number;
  lowerFarWidthEndM?: number;
}

export const LIVING_MEADOW_FAR_DENSITY_PROFILE: BladeFieldMeadowFarDensityProfile = {
  farGrassEndM: 1250,
  densityReferenceM: 300,
  falloffPower: 1.5,
  farSoftWidthScale: 3.1,
  edgeSinkStartM: 1120,
  // Far tier trades count for width one-for-one (the pen's own far-ring rule:
  // "a quarter fewer blades at a proportionally wider stroke ... identical").
  // fan 3->2 with farSoft width 2.2->3.1 bought the last ~2-3ms of the locked
  // 33ms vista budget without a visible density change.
  bladesPerRecord: { near: 6, mid: 28, far: 2 },
  nearCoverageWidthScale: 1.0,
  midTierEndM: 64,
  lowerFarWidthScale: 1.35,
  lowerFarWidthEndM: 112,
};

export const BLADE_FIELD_LOD_TIERS: readonly BladeFieldTierSpec[] = [
  { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
  { id: "mid", lodTier: 1, segments: 6, minDistanceM: 5, maxDistanceM: 20 },
  { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 64 },
];

export const DEFAULT_BLADE_FIELD_TRANSITION: BladeFieldTransitionProfile = {
  denseBladeEndM: 20,
  farGrassStartM: 20,
  farGrassEndM: 64,
  nearTierEndM: 5,
  midTierEndM: 20,
};

export function createBladeFieldTransitionUniforms(
  profile: BladeFieldTransitionProfile,
): BladeFieldTransitionUniforms {
  return new BladeFieldTransitionUniforms(profile);
}

export const BLADE_FIELD_PALETTE = MEADOW.blade;

export interface BladeFieldStats {
  layer: "photoreal-blade-field";
  enabled: boolean;
  farTierVisible: boolean;
  routeCullMask: {
    enabled: boolean;
    center: [number, number];
    radiusSq: number;
  };
  routeCullWedge: {
    enabled: boolean;
    forward: [number, number];
    side: [number, number];
    halfWidthSlope: number;
    backMarginM: number;
    farMarginM: number;
  };
  packedUpload: {
    mode: "idle" | "chunking";
    targetFrames: number;
    uploadedRecords: number;
    totalRecords: number;
  };
  depthPrepass: {
    enabled: boolean;
    tiers: BladeFieldTierId[];
    drawCalls: number;
    renderOrder: number;
    beautyDepth: "less-equal-read-write";
  };
  packedStrideFloats: number;
  packedBytesPerRecord: number;
  recordCount: number;
  drawCalls: number;
  submittedTriangles: number;
  submittedVertices: number;
  tiers: Record<
    BladeFieldTierId,
    {
      lodTier: 0 | 1 | 2;
      segments: number;
      minDistanceM: number;
      maxDistanceM: number;
      bladesPerRecord: number;
      candidateRecords: number;
      records: number;
      droppedByThinning: number;
      triangles: number;
      vertices: number;
    }
  >;
  tierCountSource: "cpu-mirror-live-distance-rule" | "cpu-mirror-live-distance-hash-thinning";
  culledRecords: number;
  thinnedRecords: number;
  thinning: BladeFieldThinningProfile;
  farDensityProfile: BladeFieldMeadowFarDensityProfile;
  transition: Readonly<BladeFieldTransition>;
  sourceStorageCore: {
    packedVec4PerBlade: 4;
    packedBytesPerBlade: 64;
    cpuRecordsOnly: true;
    cameraSnappedPlacement: true;
    voronoiClumpBlend: true;
    bezierBladeSpine: true;
    viewDependentThickness: true;
    distanceDesaturation: true;
    drawIndirect: true;
    visibleIndexBuffers: 3;
    runtimeComputeRoute: "not-run" | "active";
  };
  wind: {
    source: "packages/game-renderer/src/battle/windSignal.ts";
    timeUniform: "PhotorealWorld.uTime -> updateWindUniforms";
    bandFunction: "sin-front cheap mirror of windBandAnalytic";
    bandWavelengthM: number;
    modulationDepth: { trough: number; crest: number };
    tipAmplitudeScaleM: number;
  };
  palette: typeof BLADE_FIELD_PALETTE;
  recordHash: string;
}

export interface BladeFieldThinningProfile {
  enabled: boolean;
  densityLaw: "pen-1.5-power";
  densityReferenceM: number;
  falloffPower: 1 | 1.5;
  hashSource: "record.bladeSeed fract(seed01 * 7.13)";
  survivorAlbedoBlend: number;
}

interface TierBucket {
  spec: BladeFieldTierSpec;
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardNodeMaterial>;
  prepassMesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshBasicNodeMaterial> | null;
  records: number;
  candidateRecords: number;
  droppedByThinning: number;
  bladesPerRecord: number;
  drawBuffer: THREE.IndirectStorageBufferAttribute;
  visibleIndices: unknown | null;
  drawStorage: unknown | null;
}

interface BladeFieldMaterialTier {
  beauty: THREE.MeshStandardNodeMaterial;
  depthPrepass: THREE.MeshBasicNodeMaterial | null;
  grassData: StorageNodeWithValue<unknown>;
  visibleIndices: StorageNodeWithValue<unknown>;
  anchor: Vec2UniformNode;
}

export interface BladeFieldMaterialSet {
  tiers: Record<BladeFieldTierId, BladeFieldMaterialTier> | null;
  perDrawBindings: boolean;
  sunDirection: Vec3UniformNode;
  rimStrength: FloatUniformNode;
  subsurfaceStrength: FloatUniformNode;
}

interface BladeFieldGpuRuntime {
  camera: { value: THREE.Vector3 };
  anchor: Vec2UniformNode;
  cullMaskCenter: Vec2UniformNode;
  cullMaskRadiusSq: FloatUniformNode;
  cullMaskEnabled: FloatUniformNode;
  cullWedgeForward: Vec2UniformNode;
  cullWedgeSide: Vec2UniformNode;
  cullWedgeHalfWidthSlope: FloatUniformNode;
  cullWedgeBackMarginM: FloatUniformNode;
  cullWedgeFarMarginM: FloatUniformNode;
  cullWedgeEnabled: FloatUniformNode;
  reset: Parameters<THREE.WebGPURenderer["compute"]>[0];
  route: Parameters<THREE.WebGPURenderer["compute"]>[0];
  uploadTouch: Parameters<THREE.WebGPURenderer["compute"]>[0];
  routed: boolean;
  grassData: StorageNodeWithValue;
  recordData: StorageUploadAttribute;
}

interface RuntimeConfig {
  spec: BladeFieldTierSpec;
  visibleIndices: any;
  drawStorage: any;
  vertexCount: number;
}

interface Vec4StorageNode {
  x: FloatNode;
  y: FloatNode;
  z: FloatNode;
  w: FloatNode;
  xyz: ReturnType<typeof vec3>;
}

interface StorageRecordNode {
  get(field: string): { toConst(): Vec4StorageNode };
}

interface StorageUploadAttribute {
  array: Float32Array;
  addUpdateRange(start: number, count: number): void;
  clearUpdateRanges(): void;
  setUsage?(usage: number): StorageUploadAttribute;
  needsUpdate: boolean;
}

interface StorageNodeWithValue<Value = StorageUploadAttribute> {
  value: Value;
  element(index: unknown): any;
}

interface PendingPackedRecordUpload {
  source: Float32Array;
  visible: boolean;
  runtime: BladeFieldGpuRuntime;
  uploadedFloats: number;
  floatsPerFrame: number;
  hashState: number;
  hashComplete: string | null;
  recordCount: number;
}

const grassStorageStruct = struct({
  data0: "vec4",
  data1: "vec4",
  data2: "vec4",
  data3: "vec4",
});
const drawIndirectStruct = struct({
  vertexCount: "uint",
  instanceCount: { type: "uint", atomic: true },
  firstVertex: "uint",
  firstInstance: "uint",
  offset: "uint",
});
const SEED24_MASK = 0x00ff_ffff;
const MAX_BLADES_PER_RECORD = 6;
const BLADE_FIELD_PACKED_UPLOAD_FRAMES = 6;
const BLADE_FIELD_PREPASS_TIERS = new Set<BladeFieldTierId>(["near", "mid"]);
const BLADE_FIELD_PREPASS_RENDER_ORDER = RENDER_ORDER.worldOpaque - 0.01;

export interface BladeFieldLayerOptions {
  depthPrepass?: boolean;
  materials?: BladeFieldMaterialSet;
  nameSuffix?: string;
}

export interface BladeFieldPackedRecordApplyOptions {
  incremental?: boolean;
}

export class PhotorealBladeFieldLayer implements MeadowGrassLayer {
  private readonly buckets: TierBucket[];
  private readonly materials: BladeFieldMaterialSet;
  private readonly wind: BladeFieldWindUniforms;
  private recordCount = 0;
  private recordHash = "00000000";
  private enabled = true;
  private runtime: BladeFieldGpuRuntime | null = null;
  private pendingPackedUpload: PendingPackedRecordUpload | null = null;
  private packedRecords: Float32Array<ArrayBufferLike> = new Float32Array();
  private statsDirty = false;
  private culledRecords = 0;
  private thinnedRecords = 0;
  private farTierVisible = true;
  private depthPrepassEnabled: boolean;
  private cullMask = {
    enabled: false,
    center: new THREE.Vector2(0, 0),
    radiusSq: 0,
  };
  private cullWedge = {
    enabled: false,
    forward: new THREE.Vector2(0, 1),
    side: new THREE.Vector2(1, 0),
    halfWidthSlope: 1,
    backMarginM: 0,
    farMarginM: 0,
  };

  private readonly tiers: readonly BladeFieldTierSpec[];
  private thinning: BladeFieldThinningProfile;
  private activeTransition: Readonly<BladeFieldTransition>;
  private readonly transitionUniforms: BladeFieldTransitionUniforms;
  private readonly farDensityProfile = LIVING_MEADOW_FAR_DENSITY_PROFILE;

  /** `tiers` overrides the ratified close-lab envelope (far 64 m) - the
   *  production battle passes a wider far tier so vista framing (eye ~59 m
   *  up) does not distance-cull the whole field. */
  constructor(
    scene: THREE.Scene,
    tiers: readonly BladeFieldTierSpec[] = BLADE_FIELD_LOD_TIERS,
    edgeFade = false,
    transition:
      | BladeFieldTransitionProfile
      | BladeFieldTransitionUniforms = DEFAULT_BLADE_FIELD_TRANSITION,
    wind: BladeFieldWindUniforms = createBladeFieldWindUniforms(),
    options: BladeFieldLayerOptions = {},
  ) {
    // Default OFF: measured on apple/metal-3 (TBDR hardware HSR already kills
    // opaque overdraw) the prepass is net-negative — 27.2 vs 26.8 ms median,
    // p95 67 vs 63 — because it doubles near/mid vertex work while we are
    // vertex-bound. Keep the toggle for immediate-mode GPUs where the pen's
    // trick pays (its WebGL painterly fragments were the bottleneck).
    this.depthPrepassEnabled = options.depthPrepass ?? false;
    this.wind = wind;
    this.tiers = tiers;
    this.transitionUniforms =
      transition instanceof BladeFieldTransitionUniforms
        ? transition
        : createBladeFieldTransitionUniforms(transition);
    this.activeTransition = this.applyTransitionProfile(this.transitionUniforms.transition());
    this.thinning = thinningProfileForTransition(
      this.activeTransition,
      edgeFade,
      this.farDensityProfile,
    );
    this.materials = options.materials ?? createBladeFieldMaterialSet();
    const placeholder = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.84,
      metalness: 0,
    });
    this.buckets = tiers.map((spec) => {
      const bladesPerRecord = bladesPerRecordFor(this.farDensityProfile, spec.id);
      const geometry = bladeGeometry(spec.segments, bladesPerRecord);
      const drawBuffer = new THREE.IndirectStorageBufferAttribute(
        new Uint32Array([geometry.index?.count ?? 0, 0, 0, 0, 0]),
        5,
      );
      geometry.setIndirect(drawBuffer);
      const mesh = new THREE.Mesh(geometry, placeholder);
      // Scenes and debug isolation filters (?only=...battle-grass...) select
      // grass by this prefix.
      mesh.name = grassMeshName(options.nameSuffix, `blades-${spec.id}`);
      mesh.frustumCulled = false;
      mesh.renderOrder = tierRenderOrder(spec.id);
      mesh.receiveShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      const prepassMesh = BLADE_FIELD_PREPASS_TIERS.has(spec.id)
        ? new THREE.Mesh(geometry, emptyBladeFieldDepthPrepassMaterial())
        : null;
      if (prepassMesh) {
        prepassMesh.name = grassMeshName(
          options.nameSuffix,
          `blades-${spec.id}-depth-prepass`,
        );
        prepassMesh.frustumCulled = false;
        prepassMesh.renderOrder = tierPrepassRenderOrder(spec.id);
        prepassMesh.visible = false;
        scene.add(prepassMesh);
      }
      return {
        spec,
        mesh,
        prepassMesh,
        records: 0,
        candidateRecords: 0,
        droppedByThinning: 0,
        bladesPerRecord,
        drawBuffer,
        visibleIndices: null,
        drawStorage: null,
      };
    });
  }

  materialSet(): BladeFieldMaterialSet {
    this.materials.perDrawBindings = true;
    this.materials.tiers ??= createUnboundBladeFieldMaterialTiers(
      this.tiers,
      this.transitionUniforms,
      this.thinning.survivorAlbedoBlend,
      this.materials,
      this.wind,
    );
    return this.materials;
  }

  materialCompileCount(): number {
    return this.tiers.length + this.tiers.filter((tier) => BLADE_FIELD_PREPASS_TIERS.has(tier.id)).length;
  }

  applyPackedRecords(
    packedRecords: Float32Array,
    visible = true,
    options: BladeFieldPackedRecordApplyOptions = {},
  ): void {
    if (packedRecords.length % GRASS_FIELD_PACKED_STRIDE_FLOATS !== 0) {
      throw new Error(
        `blade field expected ${GRASS_FIELD_PACKED_STRIDE_FLOATS}-float records, got ${packedRecords.length}`,
      );
    }
    if (options.incremental && packedRecords.length > 0) {
      this.startIncrementalPackedRecordUpload(packedRecords, visible);
      return;
    }
    this.pendingPackedUpload = null;
    const copiedRecords = new Float32Array(packedRecords);
    this.activatePackedRecords(
      copiedRecords,
      visible,
      createGpuRuntime(copiedRecords, this.buckets, this.transitionUniforms, this.thinning),
      hashPackedRecords(packedRecords),
    );
  }

  settlePackedRecordUpload(renderer: THREE.WebGPURenderer): void {
    while (this.pendingPackedUpload) this.advancePendingPackedRecordUpload(renderer);
  }

  private activatePackedRecords(
    packedRecords: Float32Array,
    visible: boolean,
    runtime: BladeFieldGpuRuntime,
    recordHash: string,
  ): void {
    this.enabled = visible;
    this.recordCount = packedRecords.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
    this.recordHash = recordHash;
    this.packedRecords = packedRecords;
    if (this.recordCount === 0) {
      this.runtime = null;
      this.culledRecords = 0;
      this.thinnedRecords = 0;
      this.statsDirty = false;
      for (const bucket of this.buckets) {
        bucket.records = 0;
        bucket.candidateRecords = 0;
        bucket.droppedByThinning = 0;
        bucket.mesh.geometry.instanceCount = 0;
        bucket.mesh.visible = false;
        if (bucket.prepassMesh) bucket.prepassMesh.visible = false;
      }
      return;
    }
    this.runtime = runtime;
    this.statsDirty = true;
    this.applyCullMaskToRuntime();
    this.applyCullWedgeToRuntime();
    this.materials.tiers ??= createBladeFieldMaterialTiers(
      this.buckets,
      this.runtime,
      this.transitionUniforms,
      this.thinning.survivorAlbedoBlend,
      this.materials,
      this.wind,
    );

    for (const bucket of this.buckets) {
      const materials = this.materials.tiers[bucket.spec.id];
      if (bucket.mesh.material !== materials.beauty) bucket.mesh.material.dispose();
      bucket.mesh.material = materials.beauty;
      bindBladeFieldMaterialTier(materials, this.runtime, bucket);
      if (this.materials.perDrawBindings) {
        bucket.mesh.onBeforeRender = () =>
          bindBladeFieldMaterialTier(materials, this.runtime, bucket);
      }
      if (bucket.prepassMesh) {
        if (bucket.prepassMesh.material !== materials.depthPrepass) {
          bucket.prepassMesh.material.dispose();
        }
        bucket.prepassMesh.material = materials.depthPrepass!;
        if (this.materials.perDrawBindings) {
          bucket.prepassMesh.onBeforeRender = () =>
            bindBladeFieldMaterialTier(materials, this.runtime, bucket);
        }
      }
      bucket.records = 0;
      // Capacity, not the drawn count: the indirect buffer's GPU-routed
      // instanceCount decides what draws, but three skips geometry with
      // instanceCount 0 before the indirect path is consulted.
      bucket.mesh.geometry.instanceCount = this.recordCount;
      bucket.mesh.visible = this.tierVisible(bucket.spec, visible);
      this.updatePrepassVisibility(bucket, visible);
    }
  }

  routeGpu(
    renderer: THREE.WebGPURenderer,
    eye: readonly [number, number, number],
    anchor: readonly [number, number] = [eye[0], eye[1]],
  ): void {
    this.advancePendingPackedRecordUpload(renderer);
    if (!this.runtime) return;
    this.runtime.camera.value.set(eye[0], eye[1], eye[2]);
    this.runtime.anchor.value.set(anchor[0], anchor[1]);
    if (this.statsDirty) {
      this.updateCpuMirrorTierCounts(anchor);
      this.statsDirty = false;
    }
    const compute = renderer.compute.bind(renderer);
    compute(this.runtime.reset);
    compute(this.runtime.route);
    this.runtime.routed = true;
  }

  setSunDirection(direction: THREE.Vector3 | readonly [number, number, number]): void {
    const isTuple = Array.isArray(direction);
    const x = isTuple ? direction[0] : (direction as THREE.Vector3).x;
    const y = isTuple ? direction[1] : (direction as THREE.Vector3).y;
    const z = isTuple ? direction[2] : (direction as THREE.Vector3).z;
    const len = Math.hypot(x, y, z);
    if (len > 1e-6 && Number.isFinite(len)) {
      this.materials.sunDirection.value.set(x / len, y / len, z / len);
    }
  }

  setTranslucencyStrengths(strengths: { rim?: number; subsurface?: number }): void {
    if (strengths.rim !== undefined && Number.isFinite(strengths.rim)) {
      this.materials.rimStrength.value = Math.max(0, strengths.rim);
    }
    if (strengths.subsurface !== undefined && Number.isFinite(strengths.subsurface)) {
      this.materials.subsurfaceStrength.value = Math.max(0, strengths.subsurface);
    }
  }

  setVisible(visible: boolean): void {
    this.enabled = visible;
    for (const bucket of this.buckets) {
      bucket.mesh.visible = this.tierVisible(bucket.spec, visible);
      this.updatePrepassVisibility(bucket, visible);
    }
  }

  setFarTierVisible(visible: boolean): void {
    this.farTierVisible = visible;
    for (const bucket of this.buckets) {
      bucket.mesh.visible = this.tierVisible(bucket.spec, this.enabled);
      this.updatePrepassVisibility(bucket, this.enabled);
    }
  }

  setDepthPrepass(enabled: boolean): void {
    this.depthPrepassEnabled = enabled;
    for (const bucket of this.buckets) {
      this.updatePrepassVisibility(bucket, this.enabled);
    }
  }

  setRouteCullCircle(
    mask: { center: readonly [number, number]; radiusSq: number; enabled: boolean } | null,
  ): void {
    if (!mask || !mask.enabled || !Number.isFinite(mask.radiusSq) || mask.radiusSq <= 0) {
      this.cullMask.enabled = false;
      this.cullMask.radiusSq = 0;
    } else {
      this.cullMask.enabled = true;
      this.cullMask.center.set(mask.center[0], mask.center[1]);
      this.cullMask.radiusSq = Math.max(0, mask.radiusSq);
    }
    this.applyCullMaskToRuntime();
  }

  setRouteCullWedge(
    wedge: {
      forward: readonly [number, number];
      side: readonly [number, number];
      halfWidthSlope: number;
      backMarginM: number;
      farMarginM: number;
      enabled: boolean;
    } | null,
  ): void {
    if (
      !wedge ||
      !wedge.enabled ||
      !Number.isFinite(wedge.halfWidthSlope) ||
      wedge.halfWidthSlope <= 0 ||
      !Number.isFinite(wedge.farMarginM) ||
      wedge.farMarginM <= 0
    ) {
      this.cullWedge.enabled = false;
      this.cullWedge.backMarginM = 0;
      this.cullWedge.farMarginM = 0;
    } else {
      const fx = wedge.forward[0];
      const fy = wedge.forward[1];
      const fl = Math.hypot(fx, fy);
      const sx = wedge.side[0];
      const sy = wedge.side[1];
      const sl = Math.hypot(sx, sy);
      if (fl < 1e-6 || sl < 1e-6) {
        this.cullWedge.enabled = false;
      } else {
        this.cullWedge.enabled = true;
        this.cullWedge.forward.set(fx / fl, fy / fl);
        this.cullWedge.side.set(sx / sl, sy / sl);
        this.cullWedge.halfWidthSlope = Math.max(0.1, wedge.halfWidthSlope);
        this.cullWedge.backMarginM = Math.max(0, wedge.backMarginM);
        this.cullWedge.farMarginM = Math.max(0, wedge.farMarginM);
      }
    }
    this.applyCullWedgeToRuntime();
  }

  setTransition(profile: BladeFieldTransitionProfile): Readonly<BladeFieldTransition> {
    const previous = this.activeTransition;
    this.activeTransition = this.applyTransitionProfile(profile);
    this.thinning = thinningProfileForTransition(
      this.activeTransition,
      this.thinning.enabled,
      this.farDensityProfile,
    );
    if (!sameTransition(previous, this.activeTransition)) this.statsDirty = true;
    return this.activeTransition;
  }

  private updateCpuMirrorTierCounts(anchor: readonly [number, number]): void {
    for (const bucket of this.buckets) {
      bucket.records = 0;
      bucket.candidateRecords = 0;
      bucket.droppedByThinning = 0;
    }
    this.culledRecords = 0;
    this.thinnedRecords = 0;
    const tierRanges = tierRangesForTransition(this.activeTransition);
    // These counts are STATS ONLY — the GPU route pass owns what actually draws.
    // Refresh them only after records or transition bands change; camera motion
    // must not put a 200k-record telemetry scan back on every rendered frame.
    // Large fields sample a stride and scale the tallies; lab fields stay exact.
    // Records are packed in scan order, so the sample stays spatially even.
    const MIRROR_SAMPLE_CAP = 200_000;
    const stride =
      this.recordCount > MIRROR_SAMPLE_CAP ? Math.ceil(this.recordCount / MIRROR_SAMPLE_CAP) : 1;
    for (let i = 0; i < this.recordCount; i += stride) {
      const o = i * GRASS_FIELD_PACKED_STRIDE_FLOATS;
      const x = this.packedRecords[o];
      const y = this.packedRecords[o + 1];
      if (this.cullMask.enabled) {
        const dx = x - this.cullMask.center.x;
        const dy = y - this.cullMask.center.y;
        if (dx * dx + dy * dy < this.cullMask.radiusSq) {
          this.culledRecords++;
          continue;
        }
      }
      if (this.cullWedge.enabled && !recordSurvivesCullWedge(x, y, anchor, this.cullWedge)) {
        this.culledRecords++;
        continue;
      }
      // GROUND-anchor distance: band by the looked-at/focused field point, not
      // the camera footprint. Shallow cameras sit tens of metres behind target.
      const dist = Math.hypot(x - anchor[0], y - anchor[1]);
      const bucketIndex =
        dist < tierRanges.near.maxDistanceM
          ? 0
          : dist < tierRanges.mid.maxDistanceM
            ? 1
            : dist < tierRanges.far.maxDistanceM || !this.thinning.enabled
              ? 2
              : -1;
      if (bucketIndex < 0) {
        this.culledRecords++;
        continue;
      }
      const bucket = this.buckets[bucketIndex];
      bucket.candidateRecords++;
      const bladeSeed = this.packedRecords[o + 10];
      if (!bladeSurvivesDistanceThinning(dist, bladeSeed, this.thinning)) {
        bucket.droppedByThinning++;
        this.thinnedRecords++;
        continue;
      }
      bucket.records++;
    }
    if (stride > 1) {
      for (const bucket of this.buckets) {
        bucket.records *= stride;
        bucket.candidateRecords *= stride;
        bucket.droppedByThinning *= stride;
      }
      this.culledRecords *= stride;
      this.thinnedRecords *= stride;
    }
  }

  stats(): BladeFieldStats {
    const tiers = Object.fromEntries(
      this.buckets.map((bucket) => {
        const range = tierRangesForTransition(this.activeTransition)[bucket.spec.id];
        const verticesPerRecord = (bucket.spec.segments + 1) * 2 * bucket.bladesPerRecord;
        const trianglesPerRecord = bucket.spec.segments * 2 * bucket.bladesPerRecord;
        return [
          bucket.spec.id,
          {
            lodTier: bucket.spec.lodTier,
            segments: bucket.spec.segments,
            minDistanceM: range.minDistanceM,
            maxDistanceM: range.maxDistanceM,
            bladesPerRecord: bucket.bladesPerRecord,
            candidateRecords: bucket.candidateRecords,
            records: bucket.records,
            droppedByThinning: bucket.droppedByThinning,
            triangles: bucket.records * trianglesPerRecord,
            vertices: bucket.records * verticesPerRecord,
          },
        ];
      }),
    ) as BladeFieldStats["tiers"];
    const prepassTiers = this.buckets
      .filter((bucket) => bucket.prepassMesh !== null)
      .map((bucket) => bucket.spec.id);
    const prepassDrawCalls = this.depthPrepassEnabled ? prepassTiers.length : 0;
    return {
      layer: "photoreal-blade-field",
      enabled: this.enabled,
      farTierVisible: this.farTierVisible,
      routeCullMask: {
        enabled: this.cullMask.enabled,
        center: [
          Number(this.cullMask.center.x.toFixed(3)),
          Number(this.cullMask.center.y.toFixed(3)),
        ],
        radiusSq: Number(this.cullMask.radiusSq.toFixed(3)),
      },
      routeCullWedge: {
        enabled: this.cullWedge.enabled,
        forward: [
          Number(this.cullWedge.forward.x.toFixed(4)),
          Number(this.cullWedge.forward.y.toFixed(4)),
        ],
        side: [
          Number(this.cullWedge.side.x.toFixed(4)),
          Number(this.cullWedge.side.y.toFixed(4)),
        ],
        halfWidthSlope: Number(this.cullWedge.halfWidthSlope.toFixed(4)),
        backMarginM: Number(this.cullWedge.backMarginM.toFixed(3)),
        farMarginM: Number(this.cullWedge.farMarginM.toFixed(3)),
      },
      packedUpload: this.pendingPackedUpload
        ? {
            mode: "chunking",
            targetFrames: BLADE_FIELD_PACKED_UPLOAD_FRAMES,
            uploadedRecords:
              this.pendingPackedUpload.uploadedFloats / GRASS_FIELD_PACKED_STRIDE_FLOATS,
            totalRecords: this.pendingPackedUpload.recordCount,
          }
        : {
            mode: "idle",
            targetFrames: BLADE_FIELD_PACKED_UPLOAD_FRAMES,
            uploadedRecords: this.recordCount,
            totalRecords: this.recordCount,
          },
      depthPrepass: {
        enabled: this.depthPrepassEnabled,
        tiers: prepassTiers,
        drawCalls: prepassDrawCalls,
        renderOrder: BLADE_FIELD_PREPASS_RENDER_ORDER,
        beautyDepth: "less-equal-read-write",
      },
      packedStrideFloats: GRASS_FIELD_PACKED_STRIDE_FLOATS,
      packedBytesPerRecord: GRASS_FIELD_PACKED_BYTES,
      recordCount: this.recordCount,
      drawCalls: 3 + prepassDrawCalls,
      submittedTriangles: Object.values(tiers).reduce((sum, tier) => sum + tier.triangles, 0),
      submittedVertices: Object.values(tiers).reduce((sum, tier) => sum + tier.vertices, 0),
      tiers,
      tierCountSource: this.thinning.enabled
        ? "cpu-mirror-live-distance-hash-thinning"
        : "cpu-mirror-live-distance-rule",
      culledRecords: this.culledRecords,
      thinnedRecords: this.thinnedRecords,
      thinning: this.thinning,
      farDensityProfile: this.farDensityProfile,
      transition: this.activeTransition,
      sourceStorageCore: {
        packedVec4PerBlade: 4,
        packedBytesPerBlade: 64,
        cpuRecordsOnly: true,
        cameraSnappedPlacement: true,
        voronoiClumpBlend: true,
        bezierBladeSpine: true,
        viewDependentThickness: true,
        distanceDesaturation: true,
        drawIndirect: true,
        visibleIndexBuffers: 3,
        runtimeComputeRoute: this.runtime?.routed ? "active" : "not-run",
      },
      wind: {
        source: "packages/game-renderer/src/battle/windSignal.ts",
        timeUniform: "PhotorealWorld.uTime -> updateWindUniforms",
        bandFunction: "sin-front cheap mirror of windBandAnalytic",
        bandWavelengthM: 64,
        modulationDepth: { trough: 0.3, crest: 1.8 },
        tipAmplitudeScaleM: 0.018,
      },
      palette: BLADE_FIELD_PALETTE,
      recordHash: this.recordHash,
    };
  }

  private tierVisible(spec: BladeFieldTierSpec, visible: boolean): boolean {
    return visible && (this.farTierVisible || spec.id !== "far");
  }

  private updatePrepassVisibility(bucket: TierBucket, visible: boolean): void {
    if (!bucket.prepassMesh) return;
    bucket.prepassMesh.visible =
      this.depthPrepassEnabled && this.tierVisible(bucket.spec, visible);
  }

  private applyCullMaskToRuntime(runtime = this.runtime): void {
    if (!runtime) return;
    runtime.cullMaskCenter.value.copy(this.cullMask.center);
    runtime.cullMaskRadiusSq.value = this.cullMask.radiusSq;
    runtime.cullMaskEnabled.value = this.cullMask.enabled ? 1 : 0;
  }

  private applyCullWedgeToRuntime(runtime = this.runtime): void {
    if (!runtime) return;
    runtime.cullWedgeForward.value.copy(this.cullWedge.forward);
    runtime.cullWedgeSide.value.copy(this.cullWedge.side);
    runtime.cullWedgeHalfWidthSlope.value = this.cullWedge.halfWidthSlope;
    runtime.cullWedgeBackMarginM.value = this.cullWedge.backMarginM;
    runtime.cullWedgeFarMarginM.value = this.cullWedge.farMarginM;
    runtime.cullWedgeEnabled.value = this.cullWedge.enabled ? 1 : 0;
  }

  private startIncrementalPackedRecordUpload(
    packedRecords: Float32Array,
    visible: boolean,
  ): void {
    const target = new Float32Array(packedRecords.length);
    const runtime = createGpuRuntime(target, this.buckets, this.transitionUniforms, this.thinning);
    runtime.recordData.setUsage?.(THREE.DynamicDrawUsage);
    this.applyCullMaskToRuntime(runtime);
    this.applyCullWedgeToRuntime(runtime);
    const floatsPerRecord = GRASS_FIELD_PACKED_STRIDE_FLOATS;
    const recordsPerFrame = Math.max(
      1,
      Math.ceil(
        packedRecords.length / floatsPerRecord / BLADE_FIELD_PACKED_UPLOAD_FRAMES,
      ),
    );
    this.pendingPackedUpload = {
      source: packedRecords,
      visible,
      runtime,
      uploadedFloats: 0,
      floatsPerFrame: recordsPerFrame * floatsPerRecord,
      hashState: 0x811c9dc5,
      hashComplete: null,
      recordCount: packedRecords.length / floatsPerRecord,
    };
  }

  private advancePendingPackedRecordUpload(renderer: THREE.WebGPURenderer): void {
    const pending = this.pendingPackedUpload;
    if (!pending) return;
    const start = pending.uploadedFloats;
    const end = Math.min(pending.source.length, start + pending.floatsPerFrame);
    if (end > start) {
      pending.runtime.recordData.array.set(pending.source.subarray(start, end), start);
      pending.runtime.recordData.addUpdateRange(start, end - start);
      pending.runtime.recordData.needsUpdate = true;
      pending.hashState = hashPackedRecordsRange(pending.source, start, end, pending.hashState);
      pending.uploadedFloats = end;
      const compute = renderer.compute.bind(renderer);
      compute(pending.runtime.uploadTouch);
    }
    if (pending.uploadedFloats < pending.source.length) return;
    pending.hashComplete ??= hashToString(pending.hashState);
    this.pendingPackedUpload = null;
    this.activatePackedRecords(
      pending.runtime.recordData.array,
      pending.visible,
      pending.runtime,
      pending.hashComplete,
    );
  }

  private applyTransitionProfile(
    profile: BladeFieldTransitionProfile,
  ): Readonly<BladeFieldTransition> {
    const clamped = transitionProfileForTiers(
      this.tiers,
      profile,
      this.farDensityProfile,
    );
    return this.transitionUniforms.update(clamped);
  }
}

function bladeGeometry(segments: number, bladesPerRecord: number): THREE.InstancedBufferGeometry {
  const bladeCopies = Math.max(
    1,
    Math.min(MAX_BLADES_PER_RECORD, Math.floor(bladesPerRecord)),
  );
  const vertexCount = (segments + 1) * 2 * bladeCopies;
  const indexCount = segments * 6 * bladeCopies;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(indexCount);
  let vp = 0;
  let np = 0;
  let up = 0;
  let ip = 0;
  for (let copy = 0; copy < bladeCopies; copy++) {
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      for (const side of [-0.5, 0.5]) {
        positions[vp++] = s === segments ? 0 : side;
        positions[vp++] = t;
        positions[vp++] = copy;
        normals[np++] = 0;
        normals[np++] = 0;
        normals[np++] = 1;
        uvs[up++] = side + 0.5;
        uvs[up++] = t;
      }
    }
    const base = copy * (segments + 1) * 2;
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
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.instanceCount = 0;
  return geometry;
}

function createGpuRuntime(
  packedRecords: Float32Array,
  buckets: readonly TierBucket[],
  transition: BladeFieldTransitionUniforms,
  thinning: BladeFieldThinningProfile,
): BladeFieldGpuRuntime {
  const grassData = createGrassStorageNode(packedRecords);
  const recordData = grassData.value;
  const camera = typedUniform(new THREE.Vector3(0, 0, 0));
  const anchor = typedUniform(new THREE.Vector2(0, 0));
  const cullMaskCenter = typedUniform(new THREE.Vector2(0, 0));
  const cullMaskRadiusSq = typedUniform(0);
  const cullMaskEnabled = typedUniform(0);
  const cullWedgeForward = typedUniform(new THREE.Vector2(0, 1));
  const cullWedgeSide = typedUniform(new THREE.Vector2(1, 0));
  const cullWedgeHalfWidthSlope = typedUniform(1);
  const cullWedgeBackMarginM = typedUniform(0);
  const cullWedgeFarMarginM = typedUniform(0);
  const cullWedgeEnabled = typedUniform(0);
  const uploadScratch = instancedArray(new Float32Array([0]), "float").setName(
    "PhotorealBladeFieldUploadTouch",
  ) as { element(index: unknown): { assign(value: unknown): void } };
  const configs: RuntimeConfig[] = buckets.map((bucket) => {
    const visibleIndices = instancedArray(
      new Uint32Array(packedRecords.length / 16),
      "uint",
    ).setName(`PhotorealBladeFieldVisible${bucket.spec.id}`) as RuntimeConfig["visibleIndices"];
    const drawStorage = storage(bucket.drawBuffer, drawIndirectStruct, 1).setName(
      `PhotorealBladeFieldDraw${bucket.spec.id}`,
    ) as RuntimeConfig["drawStorage"];
    bucket.visibleIndices = visibleIndices;
    bucket.drawStorage = drawStorage;
    return {
      spec: bucket.spec,
      visibleIndices,
      drawStorage,
      vertexCount: bucket.mesh.geometry.index?.count ?? 0,
    };
  });

  const resetFn = Fn(() => {
    for (const config of configs) {
      const draw = config.drawStorage;
      draw.get("vertexCount").assign(uint(config.vertexCount));
      atomicStore(draw.get("instanceCount"), uint(0));
      draw.get("firstVertex").assign(uint(0));
      draw.get("firstInstance").assign(uint(0));
      draw.get("offset").assign(uint(0));
    }
  });
  const appendToTier = (config: (typeof configs)[number]) => {
    const slot = atomicAdd(config.drawStorage.get("instanceCount"), uint(1));
    config.visibleIndices.element(slot).assign(uint(instanceIndex));
  };
  const routeFn = Fn(() => {
    const data = grassData.element(instanceIndex);
    const d0 = data.get("data0") as { xyz: ReturnType<typeof vec3> };
    const d2 = data.get("data2") as { z: FloatNode };
    const pos = d0.xyz;
    const dist = length(anchor.sub(pos.xy));
    const maskDelta = pos.xy.sub(cullMaskCenter);
    const outsideMask = step(cullMaskRadiusSq, dot(maskDelta, maskDelta));
    const maskSurvival = mix(1.0, outsideMask, cullMaskEnabled);
    const wedgeDelta = pos.xy.sub(anchor);
    const wedgeDepth = dot(wedgeDelta, cullWedgeForward);
    const wedgeLateral = abs(dot(wedgeDelta, cullWedgeSide));
    const insideWedgeDepth = step(cullWedgeBackMarginM.mul(-1.0), wedgeDepth).mul(
      step(wedgeDepth, cullWedgeFarMarginM),
    );
    const wedgeHalfWidth = wedgeDepth
      .add(cullWedgeBackMarginM)
      .mul(cullWedgeHalfWidthSlope)
      .add(float(24.0));
    const wedgeSurvival = mix(
      1.0,
      insideWedgeDepth.mul(step(wedgeLateral, wedgeHalfWidth)),
      cullWedgeEnabled,
    );
    const seed01 = clamp(d2.z.div(float(SEED24_MASK)), 0.0, 1.0);
    const bladeHash = fract(seed01.mul(7.13));
    const penDensity = min(
      float(1.0),
      pow(float(thinning.densityReferenceM).div(max(dist, float(0.001))), thinning.falloffPower),
    );
    const survival = thinning.enabled ? penDensity : float(1.0);
    const farTierEnd = thinning.enabled
      ? transition.farGrassEndM
      : transition.farGrassEndM.add(float(1_000_000.0));
    If(bladeHash.lessThan(survival.mul(maskSurvival).mul(wedgeSurvival)), () => {
      If(dist.lessThan(transition.nearTierEndM), () => {
        appendToTier(configs[0]);
      })
        .ElseIf(dist.lessThan(transition.midTierEndM), () => {
          appendToTier(configs[1]);
        })
        .ElseIf(dist.lessThan(farTierEnd), () => {
          appendToTier(configs[2]);
        });
    });
  });
  const uploadTouchFn = Fn(() => {
    const data = grassData.element(uint(0));
    const d0 = data.get("data0") as { x: FloatNode };
    uploadScratch.element(uint(0)).assign(d0.x);
  });

  return {
    camera,
    anchor,
    cullMaskCenter,
    cullMaskRadiusSq,
    cullMaskEnabled,
    cullWedgeForward,
    cullWedgeSide,
    cullWedgeHalfWidthSlope,
    cullWedgeBackMarginM,
    cullWedgeFarMarginM,
    cullWedgeEnabled,
    reset: resetFn().compute(1).setName("PhotorealBladeFieldResetIndirect"),
    route: routeFn()
      .compute(packedRecords.length / 16)
      .setName("PhotorealBladeFieldRouteLod"),
    uploadTouch: uploadTouchFn().compute(1).setName("PhotorealBladeFieldUploadTouch"),
    routed: false,
    grassData,
    recordData,
  };
}

function createGrassStorageNode(packedRecords: Float32Array): StorageNodeWithValue {
  const storageArray = instancedArray as (
    array: Float32Array,
    type: unknown,
  ) => StorageNodeWithValue & {
    setName(name: string): {
      element(index: unknown): { get(field: string): unknown };
      value: StorageUploadAttribute;
    };
  };
  return storageArray(packedRecords, grassStorageStruct).setName(
    "PhotorealBladeFieldRecords",
  ) as StorageNodeWithValue;
}

function bladeFieldMaterial(
  grassData: unknown,
  visibleIndices: unknown,
  transition: BladeFieldTransitionUniforms,
  anchor: Vec2UniformNode,
  survivorAlbedoBlend: number,
  sunDirection: Vec3UniformNode,
  rimStrength: FloatUniformNode,
  subsurfaceStrength: FloatUniformNode,
  wind: BladeFieldWindUniforms,
): THREE.MeshStandardNodeMaterial {
  return createBladeFieldMaterial(
    grassData,
    visibleIndices,
    transition,
    anchor,
    survivorAlbedoBlend,
    sunDirection,
    rimStrength,
    subsurfaceStrength,
    wind,
    false,
  ) as THREE.MeshStandardNodeMaterial;
}

function createBladeFieldMaterialSet(): BladeFieldMaterialSet {
  return {
    tiers: null,
    perDrawBindings: false,
    sunDirection: typedUniform(new THREE.Vector3(0, 0, 1)),
    rimStrength: typedUniform(BLADE_FIELD_TRANSLUCENCY.rimStrength),
    subsurfaceStrength: typedUniform(BLADE_FIELD_TRANSLUCENCY.subsurfaceStrength),
  };
}

function createBladeFieldMaterialTiers(
  buckets: readonly TierBucket[],
  runtime: BladeFieldGpuRuntime,
  transition: BladeFieldTransitionUniforms,
  survivorAlbedoBlend: number,
  uniforms: BladeFieldMaterialSet,
  wind: BladeFieldWindUniforms,
): Record<BladeFieldTierId, BladeFieldMaterialTier> {
  return Object.fromEntries(
    buckets.map((bucket) => {
      const grassData = runtime.grassData;
      const visibleIndices = bucket.visibleIndices as StorageNodeWithValue<unknown>;
      const anchor = runtime.anchor;
      return [
        bucket.spec.id,
        {
          beauty: bladeFieldMaterial(
            grassData,
            visibleIndices,
            transition,
            anchor,
            survivorAlbedoBlend,
            uniforms.sunDirection,
            uniforms.rimStrength,
            uniforms.subsurfaceStrength,
            wind,
          ),
          depthPrepass: BLADE_FIELD_PREPASS_TIERS.has(bucket.spec.id)
            ? bladeFieldDepthPrepassMaterial(
                grassData,
                visibleIndices,
                transition,
                anchor,
                survivorAlbedoBlend,
                wind,
              )
            : null,
          grassData,
          visibleIndices,
          anchor,
        } satisfies BladeFieldMaterialTier,
      ];
    }),
  ) as Record<BladeFieldTierId, BladeFieldMaterialTier>;
}

function createUnboundBladeFieldMaterialTiers(
  tiers: readonly BladeFieldTierSpec[],
  transition: BladeFieldTransitionUniforms,
  survivorAlbedoBlend: number,
  uniforms: BladeFieldMaterialSet,
  wind: BladeFieldWindUniforms,
): Record<BladeFieldTierId, BladeFieldMaterialTier> {
  return Object.fromEntries(
    tiers.map((tier) => {
      const grassData = createGrassStorageNode(
        new Float32Array(GRASS_FIELD_PACKED_STRIDE_FLOATS),
      );
      const visibleIndices = instancedArray(new Uint32Array(1), "uint").setName(
        `PhotorealBladeFieldMaterialVisible${tier.id}`,
      ) as StorageNodeWithValue<unknown>;
      const anchor = typedUniform(new THREE.Vector2(0, 0));
      return [
        tier.id,
        {
          beauty: bladeFieldMaterial(
            grassData,
            visibleIndices,
            transition,
            anchor,
            survivorAlbedoBlend,
            uniforms.sunDirection,
            uniforms.rimStrength,
            uniforms.subsurfaceStrength,
            wind,
          ),
          depthPrepass: BLADE_FIELD_PREPASS_TIERS.has(tier.id)
            ? bladeFieldDepthPrepassMaterial(
                grassData,
                visibleIndices,
                transition,
                anchor,
                survivorAlbedoBlend,
                wind,
              )
            : null,
          grassData,
          visibleIndices,
          anchor,
        } satisfies BladeFieldMaterialTier,
      ];
    }),
  ) as Record<BladeFieldTierId, BladeFieldMaterialTier>;
}

function bindBladeFieldMaterialTier(
  materials: BladeFieldMaterialTier,
  runtime: BladeFieldGpuRuntime | null,
  bucket: TierBucket,
): void {
  if (!runtime || !bucket.visibleIndices) return;
  materials.grassData.value = runtime.grassData.value;
  materials.visibleIndices.value = (
    bucket.visibleIndices as StorageNodeWithValue<unknown>
  ).value;
  materials.anchor.value.copy(runtime.anchor.value);
}

function bladeFieldDepthPrepassMaterial(
  grassData: unknown,
  visibleIndices: unknown,
  transition: BladeFieldTransitionUniforms,
  anchor: Vec2UniformNode,
  survivorAlbedoBlend: number,
  wind: BladeFieldWindUniforms,
): THREE.MeshBasicNodeMaterial {
  return createBladeFieldMaterial(
    grassData,
    visibleIndices,
    transition,
    anchor,
    survivorAlbedoBlend,
    null,
    null,
    null,
    wind,
    true,
  ) as THREE.MeshBasicNodeMaterial;
}

function emptyBladeFieldDepthPrepassMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.colorWrite = false;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = vec4(0.0, 0.0, 0.0, 1.0);
  return material;
}

function createBladeFieldMaterial(
  grassData: unknown,
  visibleIndices: unknown,
  transition: BladeFieldTransitionUniforms,
  anchor: Vec2UniformNode,
  survivorAlbedoBlend: number,
  sunDirection: Vec3UniformNode | null,
  rimStrength: FloatUniformNode | null,
  subsurfaceStrength: FloatUniformNode | null,
  wind: BladeFieldWindUniforms,
  depthOnly: boolean,
): THREE.MeshStandardNodeMaterial | THREE.MeshBasicNodeMaterial {
  // Beauty stays standard so the environment (the mood owner) lights the canopy.
  // The depth-only branch uses the same position solve but skips this lighting graph.
  const material = depthOnly
    ? new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
    : new THREE.MeshStandardNodeMaterial({
        side: THREE.DoubleSide,
        roughness: 0.96,
        metalness: 0,
      });
  if (depthOnly) {
    material.colorWrite = false;
    material.depthTest = true;
    material.depthWrite = true;
    material.colorNode = vec4(0.0, 0.0, 0.0, 1.0);
  }
  const local = attribute<"vec3">("position", "vec3");
  const indexBuffer = visibleIndices as { element(index: unknown): unknown };
  const recordBuffer = grassData as { element(index: unknown): StorageRecordNode };

  // Salvage pattern (falseEarthCloseGrass createSourceStorageMaterial):
  // varyings are DECLARED with placeholders and ASSIGNED inside the Fn that IS
  // positionNode, so every storage read executes in the position graph - the
  // only vertex stage where the record buffers are bound. Reading storage from
  // the color graph (directly, via shared nodes, or via a fresh element()
  // chain) renders garbage/white; a x0 position anchor gets constant-folded.
  const beautyVaryings = depthOnly
    ? null
    : {
        albedo: varying(vec3(0.0)),
        shadeNormal: varying(vec3(0.0, 0.0, 1.0)),
        worldPosition: varying(vec3(0.0)),
        lightWeights: varying(vec2(0.0)),
      };

  const buildVertex = Fn(() => {
    const trueIndex = indexBuffer.element(instanceIndex);
    const record = recordBuffer.element(trueIndex);
    const d0 = record.get("data0").toConst();
    const d1 = record.get("data1").toConst();
    const d2 = record.get("data2").toConst();
    const d3 = record.get("data3").toConst();

    const base = vec3(d0.x, d0.y, d0.z).toVar();
    // Ground-anchor distance (see CPU mirror note): tiers/transitions band by
    // the looked-at field point, not the camera footprint.
    const eyeDist = length(anchor.sub(base.xy)).toVar();
    const farSoft = smoothstep(transition.farGrassStartM, transition.farGrassEndM, eyeDist).toVar();
    // Far-LOD blade RESHAPING (widen + height-sink + taper + darken) is a
    // PRODUCTION coverage treatment: it trades blade fineness for a soft edge
    // past the dense ring. The ratified close-lab envelope (survivorAlbedoBlend
    // === 0) OMITS it - routing the lab through farSoft turns its fine tall
    // strands into stubby wide paddles and collapses the clump structure the
    // close-gate oracle measures (the round-3 leak).
    const farSoftShape = survivorAlbedoBlend > 0 ? farSoft : float(0.0);
    const lowerFarWidthBoost = smoothstep(
      transition.midTierEndM,
      transition.midTierEndM.add(float(0.001)),
      eyeDist,
    ).mul(
      float(1.0).sub(smoothstep(transition.midTierEndM, transition.lowerFarWidthEndM, eyeDist)),
    );
    // Tall clumps widen too: a clump reads as one bright mass, not stripes.
    const width = max(d1.x.mul(mix(0.85, 1.35, clamp(d2.w, 0.0, 1.0))), 0.018)
      .mul(mix(transition.nearCoverageWidthScale, 1.0, farSoft))
      .mul(mix(1.0, transition.lowerFarWidthScale, lowerFarWidthBoost))
      .mul(mix(1.0, transition.farSoftWidthScale, farSoftShape))
      .toVar();
    const clumpWeight = clamp(d2.w, 0.0, 1.0);
    const bladeSeed01 = clamp(d2.z.div(float(SEED24_MASK)), 0.0, 1.0);
    const clumpSeed01 = clamp(d2.y.div(float(SEED24_MASK)), 0.0, 1.0);
    const bladeCopy = local.z.toVar();
    const copyScatter = smoothstep(float(0.01), float(0.99), bladeCopy);
    const fanHashA = fract(
      bladeSeed01.mul(7.13).add(bladeCopy.mul(0.37)).add(clumpSeed01.mul(0.19)),
    );
    const fanHashB = fract(
      bladeSeed01.mul(5.31).add(bladeCopy.mul(0.61)).add(clumpSeed01.mul(0.43)),
    );
    const fanYaw = d2.x.add(fanHashA.sub(0.5).mul(0.72).mul(copyScatter));
    const terrainNormal = normalize(vec3(d3.x, d3.y, max(d3.z, 0.08))).toVar();
    const fanForward = normalize(vec3(cos(fanYaw), sin(fanYaw), 0.0)).toVar();
    const fanTangentForward = normalize(
      fanForward.sub(terrainNormal.mul(dot(fanForward, terrainNormal))),
    ).toVar();
    const fanSide = normalize(cross(fanTangentForward, terrainNormal)).toVar();
    const fanAngle = fanHashA.mul(6.28318530718);
    const fanRadius = mix(0.35, 0.95, fanHashB).mul(copyScatter);
    base.assign(
      base
        .add(fanSide.mul(cos(fanAngle)).mul(fanRadius))
        .add(fanTangentForward.mul(sin(fanAngle)).mul(fanRadius).mul(0.72)),
    );
    // Clump-scale canopy: the Voronoi clumpWeight (1.55 m cells) drives a
    // strong height swing so the field breaks into clumps with tip-lines at
    // many heights - the structure the close-gate oracle (and the reference)
    // shows.
    // Near-eye dissolve: blades near the camera render as giant paddles
    // filling the frame (close-zoom overdraw = the zoom-28 GPU cliff). The
    // dissolve band scales with EYE HEIGHT - a fixed 4.5m band did nothing
    // because at close zoom the offending blades sit 5-15m out; a low eye
    // widens the band, a vista eye keeps it tiny. Scale to turf, not alpha.
    const eyeHeight = cameraPosition.z.sub(base.z).max(0.0);
    const fadeEnd = clamp(eyeHeight.mul(1.2), 4.5, 16.0);
    // Blades BEHIND the near plane project inverted into the sky (the
    // upside-down grass band at max zoom) - collapse anything behind the
    // camera. View space looks down -z, so keep only clearly-negative z.
    const baseViewZ = cameraViewMatrix.mul(vec4(base, 1.0)).z;
    const behindCull = smoothstep(0.5, -1.5, baseViewZ);
    // Near-eye paddle DISSOLVE (blades within ~16 m of the lens sink to turf) is
    // a PRODUCTION anti-overdraw treatment for the max-zoom cliff. The ratified
    // close-lab envelope (survivorAlbedoBlend === 0) omits it - it is exactly
    // the close-gate foreground, and dissolving it leaves the ratified frame
    // bare (the round max-zoom-fix leak). behindCull stays (correctness: keeps
    // blades behind the lens out of the sky).
    const nearEyeDissolve =
      survivorAlbedoBlend > 0
        ? smoothstep(fadeEnd.mul(0.45), fadeEnd, length(cameraPosition.sub(base)))
        : float(1.0);
    const nearEyeFade = nearEyeDissolve.mul(behindCull);
    const translucencyNearFade = mix(
      BLADE_FIELD_TRANSLUCENCY.nearDissolveFloor,
      1.0,
      nearEyeFade,
    );
    // Coverage-edge dissolve: blades SINK into the turf across the last
    // stretch of the far transition instead of stopping full-height at a
    // hard radius (the "visible from across the room" cutoff critique).
    const edgeSink =
      survivorAlbedoBlend > 0
        ? smoothstep(transition.farGrassEndM, transition.edgeSinkStartM, eyeDist)
        : float(1.0);
    // Far blades lose height across the whole soft band (1.0 -> 0.42), not a
    // shallow step to 0.72 that held the canopy full-height until the sink and
    // drew a hard tip-line front against the ground (the "blades stop at a hard
    // horizontal front" critique). A continuous taper + the edge sink slopes the
    // canopy down into the textured ground term.
    const height = max(d1.y.mul(mix(0.52, 1.32, clumpWeight)), 0.16)
      .mul(nearEyeFade)
      .mul(mix(1.0, 0.42, farSoftShape))
      .mul(edgeSink)
      .toVar();
    const bend = d1.z.mul(mix(1.34, 0.94, farSoftShape)).toVar();
    const phase = d1.w;
    const yaw = fanYaw;
    const clumpSeed = d2.y;
    const bladeSeed = d2.z;
    const forward = normalize(vec3(cos(yaw), sin(yaw), 0.0)).toVar();
    const tangentForward = normalize(
      forward.sub(terrainNormal.mul(dot(forward, terrainNormal))),
    ).toVar();
    const side = normalize(cross(tangentForward, terrainNormal)).toVar();
    const t = clamp(local.y, 0.0, 1.0).toVar();
    const u = float(1.0).sub(t).toVar();
    const t2 = t.mul(t).toVar();
    const u2 = u.mul(u).toVar();
    const windSpeed = max(wind.speed, 0.0);
    const bandSeconds = wind.gustPhase.div(max(length(wind.bandVelocity), 0.001));
    const bandPoint = base.xy.sub(wind.bandVelocity.mul(bandSeconds)).toVar();
    const windSide = vec2(wind.meanDirection.y.mul(-1.0), wind.meanDirection.x);
    const bandAlong = dot(bandPoint, wind.meanDirection);
    const bandCross = dot(bandPoint, windSide);
    const bandPhase = bandAlong
      .mul(wind.bandFrequency)
      .add(sin(bandCross.mul(0.045)).mul(0.85))
      .add(sin(bandAlong.add(bandCross.mul(0.55)).mul(0.019)).mul(0.3));
    const bandWave = sin(bandPhase).toVar();
    const gustPeak = pow(smoothstep(float(0.05), float(1.0), bandWave), wind.bandSharpness)
      .toVar();
    const gustTrough = pow(smoothstep(float(0.05), float(1.0), bandWave.mul(-1.0)), 1.2)
      .toVar();
    const gustBand = clamp(gustPeak.mul(1.8).sub(gustTrough.mul(0.85)), -0.8, 1.8).toVar();
    const windJitter = fanHashA.sub(0.5).mul(0.22).add(clumpSeed01.sub(0.5).mul(0.08));
    const jitterCos = cos(windJitter);
    const jitterSin = sin(windJitter);
    const windDir = normalize(
      vec3(
        wind.meanDirection.x.mul(jitterCos).sub(wind.meanDirection.y.mul(jitterSin)),
        wind.meanDirection.x.mul(jitterSin).add(wind.meanDirection.y.mul(jitterCos)),
        0.0,
      ),
    ).toVar();
    const heightWindProfile = log(max(height, float(0.015)).add(0.06).div(0.06)).mul(0.19523);
    const bandModulation = clamp(float(0.55).add(gustBand.mul(0.72)), 0.3, 1.8).toVar();
    const windAmplitude = heightWindProfile.mul(windSpeed).mul(bandModulation).mul(0.018).toVar();
    const windWave = sin(
      phase
        .add(bandPhase.mul(0.8))
        .add(clumpSeed01.mul(1.7))
        .sub(t.mul(0.75)),
    ).toVar();
    const windOffset = windDir.mul(windWave).mul(height).mul(windAmplitude).toVar();
    const clumpBend = mix(0.76, 1.18, clumpWeight);
    const p0 = base;
    const p1 = base
      .add(terrainNormal.mul(height).mul(0.28))
      .add(tangentForward.mul(bend).mul(height).mul(0.1));
    const p2 = base
      .add(terrainNormal.mul(height).mul(0.7))
      .add(tangentForward.mul(bend).mul(height).mul(0.34).mul(clumpBend))
      .add(windOffset.mul(0.56));
    const p3 = base
      .add(terrainNormal.mul(height))
      .add(tangentForward.mul(bend).mul(height).mul(0.62).mul(clumpBend))
      .add(windOffset);
    const center = p0
      .mul(u2.mul(u))
      .add(p1.mul(3.0).mul(u2).mul(t))
      .add(p2.mul(3.0).mul(u).mul(t2))
      .add(p3.mul(t2).mul(t))
      .toVar();
    const tangent = normalize(
      p1
        .sub(p0)
        .mul(3.0)
        .mul(u2)
        .add(p2.sub(p1).mul(6.0).mul(u).mul(t))
        .add(p3.sub(p2).mul(3.0).mul(t2)),
    ).toVar();
    const geoNormal = normalize(cross(side, tangent)).toVar();
    // Pen-style silhouette: a slight shoulder above the root, then a terminal
    // collapse so the final span resolves to a point instead of a flat paddle.
    const shoulderFactor = mix(0.6, 1.02, smoothstep(float(0.0), float(0.16), t));
    const bodyTaper = pow(float(1.0).sub(t), mix(0.5, 0.62, farSoftShape));
    const tipTaper = pow(
      float(1.0).sub(smoothstep(float(0.78), float(1.0), t)),
      mix(1.15, 1.55, farSoftShape),
    );
    const widthFactor = shoulderFactor.mul(bodyTaper).mul(tipTaper).toVar();
    const cameraDir = normalize(cameraPosition.sub(center)).toVar();
    const viewSideSigned = dot(cameraDir, side).toVar();
    const centerMask = min(
      pow(float(1.0).sub(t), 0.48).mul(pow(t.add(0.05), 0.33)),
      widthFactor.mul(1.1),
    );
    const viewBulk = pow(abs(viewSideSigned), 1.12).mul(centerMask).mul(width).mul(2.35);
    const bladeSide = local.x.mul(2.0);
    const world = center
      .add(side.mul(width).mul(widthFactor).mul(bladeSide))
      .add(geoNormal.mul(viewBulk).mul(bladeSide))
      .toVar();
    if (beautyVaryings) {
      beautyVaryings.worldPosition.assign(world);

      // Grass shades with the FIELD's normal (the GoT trick): blade-face
      // normals give half the field black backsides under a directional sun or
      // white grazing sheen under the sky IBL. Structure comes from the albedo.
      beautyVaryings.shadeNormal.assign(
        normalize(mix(geoNormal.add(side.mul(viewSideSigned).mul(0.18)), terrainNormal, 0.94)),
      );

      // TSL hazards found the hard way (both required for correct color):
      // 1. Storage reads only bind in the position graph - varyings must be
      //    assigned INSIDE this Fn (the salvage pattern), never computed on the
      //    color path.
      // 2. sin(seed * 43758.5453) - the classic hash - returns garbage/NaN on
      //    Metal for large arguments; one NaN turns the whole albedo white.
      //    Blade-level noise must use small-argument hashes (fract-based).
      const baseColor = rgbNode(BLADE_FIELD_PALETTE.base);
      const low = rgbNode(BLADE_FIELD_PALETTE.low);
      const mid = rgbNode(BLADE_FIELD_PALETTE.mid);
      const upper = rgbNode(BLADE_FIELD_PALETTE.upper);
      const tip = rgbNode(BLADE_FIELD_PALETTE.tip);
      const dry = rgbNode(BLADE_FIELD_PALETTE.dry);
      const sheen = rgbNode(BLADE_FIELD_PALETTE.sheen);
      const body = mix(
        mix(
          mix(
            mix(baseColor, low, smoothstepN(0.0, 0.28, t)),
            mid,
            smoothstepN(0.18, 0.54, t),
          ),
          upper,
          smoothstepN(0.46, 0.78, t),
        ),
        tip,
        smoothstepN(0.72, 1.0, t),
      );
      const tipWeight = smoothstepN(0.38, 1.0, t);
      const dryTip = smoothstepN(0.72, 1.0, t).mul(BLADE_FIELD_PALETTE.dryTipMix);
      const heightAo = mix(0.5, 1.0, clamp(pow(t, 0.6), 0.0, 1.0));
      const clumpFactor = mix(0.92, 1.08, clamp(clumpSeed, 0.0, 1.0));
      const bladeFactor = mix(0.94, 1.04, fract(clamp(bladeSeed, 0.0, 1.0).mul(7.13)));
      // Clump shade is what turns the canopy into bright tall columns over dark
      // short clumps - the vertical-run structure the close target shows.
      const clumpShade = mix(0.42, 1.18, clumpWeight);
      const distFade = smoothstep(float(18.0), float(42.0), eyeDist);
      // Blend into the meadow tone toward the cull ring so the coverage edge
      // dissolves instead of cutting a hard disc (slice 12 owns real thinning).
      const ringFade = smoothstep(transition.farGrassStartM, transition.farGrassEndM, eyeDist);
      const meadow = rgbNode(BLADE_FIELD_PALETTE.ringMeadow);
      const shaded = mix(body, dry, dryTip)
        .mul(heightAo)
        .mul(clumpShade)
        .mul(clumpFactor)
        .mul(bladeFactor)
        .mul(mix(0.92, 0.72, farSoftShape));
      const gustTipFlash = gustPeak
        .mul(smoothstepN(0.58, 1.0, t))
        .mul(translucencyNearFade)
        .mul(edgeSink)
        .mul(mix(1.0, 0.5, farSoftShape));
      const desat = mix(shaded, vec3(dot(shaded, vec3(0.333))), distFade.mul(0.16));
      const windSheen = mix(desat, sheen, clamp(gustTipFlash.mul(0.5), 0.0, 0.58));
      const albedo = mix(windSheen, meadow, ringFade.mul(survivorAlbedoBlend));
      beautyVaryings.albedo.assign(clamp(albedo, vec3(0.0), vec3(1.0)));
      const windFlash = clamp(gustTipFlash.mul(0.24), 0.0, 0.22);
      const cameraGroundDist = length(cameraPosition.xy.sub(base.xy));
      const distanceFalloff = float(1.0).sub(
        smoothstep(transition.nearTierEndM, transition.midTierEndM, cameraGroundDist),
      );
      const translucencyWeight = tipWeight
        .mul(heightAo)
        .mul(translucencyNearFade)
        .mul(edgeSink)
        .mul(distanceFalloff);
      beautyVaryings.lightWeights.assign(
        vec2(translucencyWeight, windFlash),
      );
    }

    return world;
  });

  const worldPosition = Fn(() => buildVertex())();
  material.positionNode = worldPosition;
  if (!beautyVaryings || !sunDirection || !rimStrength || !subsurfaceStrength) return material;

  const beautyMaterial = material as THREE.MeshStandardNodeMaterial;
  beautyMaterial.receivedShadowPositionNode = varying(worldPosition);
  beautyMaterial.normalNode = viewNormalNode(normalize(beautyVaryings.shadeNormal));
  beautyMaterial.colorNode = vec4(linearAlbedo(beautyVaryings.albedo), 1.0);
  const viewDir = normalize(cameraPosition.sub(beautyVaryings.worldPosition));
  const sunDir = normalize(sunDirection);
  const backDir = sunDir.mul(-1.0);
  const towardBacklight = clamp(dot(viewDir, backDir), 0.0, 1.0);
  const fresnel = pow(
    float(1.0).sub(clamp(dot(normalize(beautyVaryings.shadeNormal), viewDir), 0.0, 1.0)),
    BLADE_FIELD_TRANSLUCENCY.rimExponent,
  );
  const back = smoothstep(float(0.05), float(0.85), towardBacklight);
  const translucencyWeight = beautyVaryings.lightWeights.x;
  const windFlash = beautyVaryings.lightWeights.y;
  const rim = back.mul(fresnel).mul(translucencyWeight).mul(rimStrength);
  const throughBlade = pow(towardBacklight, BLADE_FIELD_TRANSLUCENCY.subsurfaceViewPower);
  const sunEdge = pow(
    clamp(float(1.0).sub(abs(dot(normalize(beautyVaryings.shadeNormal), sunDir))), 0.0, 1.0),
    BLADE_FIELD_TRANSLUCENCY.subsurfaceSunEdgePower,
  );
  const subsurface = throughBlade.mul(sunEdge).mul(translucencyWeight).mul(subsurfaceStrength);
  const emissiveDisplayStrength = clamp(
    rim.add(subsurface),
    0.0,
    BLADE_FIELD_TRANSLUCENCY.maxDisplayEmission,
  );
  beautyMaterial.emissiveNode = linearAlbedo(
    rgbNode(BLADE_FIELD_PALETTE.trans).mul(emissiveDisplayStrength),
  ).add(
    linearAlbedo(rgbNode(BLADE_FIELD_PALETTE.sheen).mul(windFlash)),
  );
  return beautyMaterial;
}

function transitionProfileForTiers(
  tiers: readonly BladeFieldTierSpec[],
  transition: BladeFieldTransitionProfile,
  farDensityProfile: BladeFieldMeadowFarDensityProfile,
): BladeFieldTransitionProfile {
  const farTier = tiers[tiers.length - 1] ?? BLADE_FIELD_LOD_TIERS[2];
  const farTierMaxDistanceM = Math.max(farTier.maxDistanceM, farDensityProfile.farGrassEndM);
  const farGrassEndM = Math.min(
    Math.max(farDensityProfile.farGrassEndM, transition.farGrassStartM),
    farTierMaxDistanceM,
  );
  const farGrassStartM = Math.min(
    Math.max(transition.farGrassStartM, farTier.minDistanceM),
    farGrassEndM,
  );
  const denseBladeEndM = Math.min(Math.max(transition.denseBladeEndM, 0), farGrassEndM);
  const nearTierEndM = Math.min(
    Math.max(transition.nearTierEndM ?? denseBladeEndM, 0),
    farGrassEndM,
  );
  const midTierEndM = Math.min(
    Math.max(
      farDensityProfile.midTierEndM ?? transition.midTierEndM ?? farGrassStartM,
      nearTierEndM,
    ),
    farGrassEndM,
  );
  const lowerFarWidthEndM =
    farDensityProfile.lowerFarWidthEndM ?? transition.lowerFarWidthEndM ?? midTierEndM;
  return {
    ...transition,
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM,
    midTierEndM,
    farSoftWidthScale: farDensityProfile.farSoftWidthScale ?? transition.farSoftWidthScale,
    nearCoverageWidthScale:
      farDensityProfile.nearCoverageWidthScale ?? transition.nearCoverageWidthScale,
    lowerFarWidthScale:
      farDensityProfile.lowerFarWidthScale ?? transition.lowerFarWidthScale,
    lowerFarWidthEndM: Math.max(midTierEndM, lowerFarWidthEndM),
    edgeSinkStartM:
      (farDensityProfile.edgeSinkStartM ?? transition.edgeSinkStartM) === undefined
        ? undefined
        : Math.min(
            Math.max(
              farDensityProfile.edgeSinkStartM ?? transition.edgeSinkStartM!,
              farTier.minDistanceM,
            ),
            farGrassEndM,
          ),
  };
}

function transitionSnapshot(
  transition: BladeFieldTransitionProfile,
): Readonly<BladeFieldTransition> {
  const farGrassEndM = Math.max(0, transition.farGrassEndM);
  const farGrassStartM = Math.min(Math.max(0, transition.farGrassStartM), farGrassEndM);
  const denseBladeEndM = Math.min(Math.max(transition.denseBladeEndM, 0), farGrassEndM);
  const nearTierEndM = Math.min(
    Math.max(transition.nearTierEndM ?? denseBladeEndM, 0),
    farGrassEndM,
  );
  const midTierEndM = Math.min(
    Math.max(transition.midTierEndM ?? farGrassStartM, nearTierEndM),
    farGrassEndM,
  );
  const farSoftWidthScale = transition.farSoftWidthScale ?? 1.6;
  const nearCoverageWidthScale = transition.nearCoverageWidthScale ?? 1;
  const lowerFarWidthScale = transition.lowerFarWidthScale ?? 1;
  const lowerFarWidthEndM = transition.lowerFarWidthEndM ?? midTierEndM;
  const terrainDetailStrength = transition.terrainDetailStrength ?? 1;
  return Object.freeze({
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM,
    midTierEndM,
    farSoftWidthScale: Math.max(
      1,
      Math.min(3, Number.isFinite(farSoftWidthScale) ? farSoftWidthScale : 1.6),
    ),
    nearCoverageWidthScale: Math.max(
      1,
      Math.min(
        2.5,
        Number.isFinite(nearCoverageWidthScale) ? nearCoverageWidthScale : 1,
      ),
    ),
    lowerFarWidthScale: Math.max(
      1,
      Math.min(3, Number.isFinite(lowerFarWidthScale) ? lowerFarWidthScale : 1),
    ),
    lowerFarWidthEndM: Math.max(
      midTierEndM,
      Number.isFinite(lowerFarWidthEndM) ? lowerFarWidthEndM : 0,
    ),
    terrainDetailStrength: Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(terrainDetailStrength) ? terrainDetailStrength : 1,
      ),
    ),
    edgeSinkStartM:
      transition.edgeSinkStartM === undefined
        ? undefined
        : Math.min(Math.max(transition.edgeSinkStartM, 0), farGrassEndM),
  });
}

function tierRangesForTransition(transition: Readonly<BladeFieldTransition>): Record<
  BladeFieldTierId,
  {
    minDistanceM: number;
    maxDistanceM: number;
  }
> {
  return {
    near: { minDistanceM: 0, maxDistanceM: transition.nearTierEndM },
    mid: {
      minDistanceM: transition.nearTierEndM,
      maxDistanceM: transition.midTierEndM,
    },
    far: {
      minDistanceM: transition.midTierEndM,
      maxDistanceM: transition.farGrassEndM,
    },
  };
}

function sameTransition(
  a: Readonly<BladeFieldTransition>,
  b: Readonly<BladeFieldTransition>,
): boolean {
  return (Object.keys(a) as Array<keyof BladeFieldTransition>).every(
    (key) => a[key] === b[key],
  );
}

function bladesPerRecordFor(
  profile: BladeFieldMeadowFarDensityProfile,
  tier: BladeFieldTierId,
): number {
  const value = profile.bladesPerRecord?.[tier] ?? 1;
  return Math.max(
    1,
    Math.min(MAX_BLADES_PER_RECORD, Number.isFinite(value) ? Math.floor(value) : 1),
  );
}

function thinningProfileForTransition(
  transition: BladeFieldTransitionProfile,
  blendSurvivors: boolean,
  farDensityProfile: BladeFieldMeadowFarDensityProfile,
): BladeFieldThinningProfile {
  return {
    // Pen-style far density thins by distance hash, while height sink remains a
    // secondary softener instead of the primary edge signal.
    enabled: blendSurvivors,
    densityLaw: "pen-1.5-power",
    densityReferenceM: farDensityProfile.densityReferenceM,
    falloffPower: farDensityProfile.falloffPower,
    hashSource: "record.bladeSeed fract(seed01 * 7.13)",
    survivorAlbedoBlend: blendSurvivors ? 0.85 : 0,
  };
}

function bladeSurvivesDistanceThinning(
  dist: number,
  bladeSeed: number,
  thinning: BladeFieldThinningProfile,
): boolean {
  if (!thinning.enabled) return true;
  const survival = Math.min(
    1,
    Math.pow(thinning.densityReferenceM / Math.max(0.001, dist), thinning.falloffPower),
  );
  return bladeHash01(bladeSeed) < survival;
}

function recordSurvivesCullWedge(
  x: number,
  y: number,
  anchor: readonly [number, number],
  wedge: {
    enabled: boolean;
    forward: THREE.Vector2;
    side: THREE.Vector2;
    halfWidthSlope: number;
    backMarginM: number;
    farMarginM: number;
  },
): boolean {
  if (!wedge.enabled) return true;
  const dx = x - anchor[0];
  const dy = y - anchor[1];
  const depth = dx * wedge.forward.x + dy * wedge.forward.y;
  if (depth < -wedge.backMarginM || depth > wedge.farMarginM) return false;
  const lateral = Math.abs(dx * wedge.side.x + dy * wedge.side.y);
  return lateral <= (depth + wedge.backMarginM) * wedge.halfWidthSlope + 24;
}

function tierRenderOrder(id: BladeFieldTierId): number {
  return RENDER_ORDER.worldOpaque + tierDrawOrderOffset(id);
}

function tierPrepassRenderOrder(id: BladeFieldTierId): number {
  return BLADE_FIELD_PREPASS_RENDER_ORDER + tierDrawOrderOffset(id);
}

function tierDrawOrderOffset(id: BladeFieldTierId): number {
  return id === "near" ? 0 : id === "mid" ? 0.001 : 0.002;
}

function bladeHash01(bladeSeed: number): number {
  return fract01(clamp01(bladeSeed / SEED24_MASK) * 7.13);
}

function grassMeshName(suffix: string | undefined, leaf: string): string {
  return suffix
    ? `${MEADOW_GRASS_MESH_NAME_PREFIX}-${suffix}-${leaf}`
    : `${MEADOW_GRASS_MESH_NAME_PREFIX}-${leaf}`;
}

function fract01(value: number): number {
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function hashPackedRecords(records: Float32Array): string {
  return hashToString(hashPackedRecordsRange(records, 0, records.length, 0x811c9dc5));
}

function hashPackedRecordsRange(
  records: Float32Array,
  start: number,
  end: number,
  initial: number,
): number {
  let h = initial;
  for (let i = start; i < end; i++) {
    const q = Math.round(records[i] * 1000);
    h ^= q & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

function hashToString(h: number): string {
  return (h >>> 0).toString(16).padStart(8, "0");
}
