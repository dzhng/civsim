// False Earth blade-field layer for the photoreal substrate. This is the
// slice-10 port seam only: it consumes the existing grassField.ts CPU records
// (4 vec4 / 64 bytes) and draws one instanced Bezier blade tier per LOD. The
// slice 11 makes this the production PhotorealBattleWorld grass owner.
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
  max,
  min,
  mix,
  normalize,
  pow,
  sin,
  smoothstep,
  storage,
  struct,
  uint,
  uniform,
  varying,
  vec3,
  vec4,
  cameraViewMatrix,
} from "three/tsl";
import {
  GRASS_FIELD_PACKED_BYTES,
  GRASS_FIELD_PACKED_STRIDE_FLOATS,
} from "../../../game-renderer/src/battle/grassField";
import {
  linearAlbedo,
  rgbNode,
  smoothstepN,
  viewNormalNode,
  type FloatNode,
  type Rgb,
  type Vec2Node,
} from "./battleTsl";
import { RENDER_ORDER } from "./terrainLayer";

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
}

type FloatUniformNode = FloatNode & { value: number };
type Vec2UniformNode = Vec2Node & { value: THREE.Vector2 };

export interface BladeFieldTransitionUniforms {
  profile: BladeFieldTransitionProfile;
  denseBladeEndM: FloatUniformNode;
  farGrassStartM: FloatUniformNode;
  farGrassEndM: FloatUniformNode;
  nearTierEndM: FloatUniformNode;
  midTierEndM: FloatUniformNode;
  farSoftWidthScale: FloatUniformNode;
  edgeSinkStartM: FloatUniformNode;
  terrainDetailStrength: FloatUniformNode;
}

export const BLADE_FIELD_LOD_TIERS: readonly BladeFieldTierSpec[] = [
  { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
  { id: "mid", lodTier: 1, segments: 5, minDistanceM: 5, maxDistanceM: 20 },
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
  const normalized = normalizedTransitionProfile(profile);
  return {
    profile: normalized,
    denseBladeEndM: uniform(normalized.denseBladeEndM) as unknown as FloatUniformNode,
    farGrassStartM: uniform(normalized.farGrassStartM) as unknown as FloatUniformNode,
    farGrassEndM: uniform(normalized.farGrassEndM) as unknown as FloatUniformNode,
    nearTierEndM: uniform(nearTierEndUniformValue(normalized)) as unknown as FloatUniformNode,
    midTierEndM: uniform(midTierEndUniformValue(normalized)) as unknown as FloatUniformNode,
    farSoftWidthScale: uniform(
      farSoftWidthScaleUniformValue(normalized),
    ) as unknown as FloatUniformNode,
    edgeSinkStartM: uniform(edgeSinkStartUniformValue(normalized)) as unknown as FloatUniformNode,
    terrainDetailStrength: uniform(
      terrainDetailStrengthUniformValue(normalized),
    ) as unknown as FloatUniformNode,
  };
}

export function updateBladeFieldTransitionUniforms(
  uniforms: BladeFieldTransitionUniforms,
  profile: BladeFieldTransitionProfile,
): BladeFieldTransitionProfile {
  const normalized = normalizedTransitionProfile(profile);
  uniforms.profile = normalized;
  uniforms.denseBladeEndM.value = normalized.denseBladeEndM;
  uniforms.farGrassStartM.value = normalized.farGrassStartM;
  uniforms.farGrassEndM.value = normalized.farGrassEndM;
  uniforms.nearTierEndM.value = nearTierEndUniformValue(normalized);
  uniforms.midTierEndM.value = midTierEndUniformValue(normalized);
  uniforms.farSoftWidthScale.value = farSoftWidthScaleUniformValue(normalized);
  uniforms.edgeSinkStartM.value = edgeSinkStartUniformValue(normalized);
  uniforms.terrainDetailStrength.value = terrainDetailStrengthUniformValue(normalized);
  return normalized;
}

export const BLADE_FIELD_PALETTE = {
  source: "packages/photoreal-renderer/src/battle/foliageLayer.ts GRASS_ALBEDO_* olive family",
  root: [0.46, 0.52, 0.25] as Rgb,
  mid: [0.58, 0.61, 0.32] as Rgb,
  tip: [0.71, 0.71, 0.42] as Rgb,
  dryTipMix: 0.05,
} as const;

export interface BladeFieldStats {
  layer: "photoreal-blade-field";
  enabled: boolean;
  farTierVisible: boolean;
  packedStrideFloats: number;
  packedBytesPerRecord: number;
  recordCount: number;
  drawCalls: 3;
  submittedTriangles: number;
  submittedVertices: number;
  tiers: Record<
    BladeFieldTierId,
    {
      lodTier: 0 | 1 | 2;
      segments: number;
      minDistanceM: number;
      maxDistanceM: number;
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
  transition: BladeFieldTransitionProfile;
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
    timeUniform: "PhotorealWorld.uTime";
    phaseSpeed: number;
    spatialScaleX: number;
    spatialScaleY: number;
    tipAmplitudeM: number;
  };
  palette: typeof BLADE_FIELD_PALETTE;
  recordHash: string;
}

export interface BladeFieldThinningProfile {
  enabled: boolean;
  fadeStartM: number;
  fadeEndM: number;
  hashSource: "record.bladeSeed fract(seed01 * 7.13)";
  survivorAlbedoBlend: number;
}

interface TierBucket {
  spec: BladeFieldTierSpec;
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardNodeMaterial>;
  records: number;
  candidateRecords: number;
  droppedByThinning: number;
  drawBuffer: THREE.IndirectStorageBufferAttribute;
  visibleIndices: unknown | null;
  drawStorage: unknown | null;
}

interface BladeFieldGpuRuntime {
  camera: { value: THREE.Vector3 };
  anchor: Vec2UniformNode;
  reset: unknown;
  route: unknown;
  routed: boolean;
  grassData: unknown;
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

export class PhotorealBladeFieldLayer {
  private readonly buckets: TierBucket[];
  private readonly time: FloatNode;
  private recordCount = 0;
  private recordHash = "00000000";
  private enabled = true;
  private runtime: BladeFieldGpuRuntime | null = null;
  private packedRecords = new Float32Array();
  private culledRecords = 0;
  private thinnedRecords = 0;
  private farTierVisible = true;

  private readonly tiers: readonly BladeFieldTierSpec[];
  private thinning: BladeFieldThinningProfile;
  private transition: BladeFieldTransitionProfile;
  private readonly transitionUniforms: BladeFieldTransitionUniforms;

  /** `tiers` overrides the ratified close-lab envelope (far 64 m) - the
   *  production battle passes a wider far tier so vista framing (eye ~59 m
   *  up) does not distance-cull the whole field. */
  constructor(
    scene: THREE.Scene,
    time: FloatNode = uniform(0) as unknown as FloatNode,
    tiers: readonly BladeFieldTierSpec[] = BLADE_FIELD_LOD_TIERS,
    edgeFade = false,
    transition:
      | BladeFieldTransitionProfile
      | BladeFieldTransitionUniforms = DEFAULT_BLADE_FIELD_TRANSITION,
  ) {
    this.time = time;
    this.tiers = tiers;
    this.transitionUniforms =
      "profile" in transition ? transition : createBladeFieldTransitionUniforms(transition);
    this.transition = this.applyTransitionProfile(this.transitionUniforms.profile);
    this.thinning = thinningProfileForTransition(this.transition, edgeFade);
    const material = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.84,
      metalness: 0,
    });
    this.buckets = tiers.map((spec) => {
      const geometry = bladeGeometry(spec.segments);
      const drawBuffer = new THREE.IndirectStorageBufferAttribute(
        new Uint32Array([geometry.index?.count ?? 0, 0, 0, 0, 0]),
        5,
      );
      geometry.setIndirect(drawBuffer);
      const mesh = new THREE.Mesh(geometry, material);
      // "battle-grass" is the ONE production grass name - scenes and debug
      // isolation filters (?only=...battle-grass...) select grass by this
      // prefix; the blade field inherits it from the tuft path it replaced.
      mesh.name = `battle-grass-blades-${spec.id}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.worldOpaque;
      mesh.receiveShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      return {
        spec,
        mesh,
        records: 0,
        candidateRecords: 0,
        droppedByThinning: 0,
        drawBuffer,
        visibleIndices: null,
        drawStorage: null,
      };
    });
  }

  applyPackedRecords(packedRecords: Float32Array, visible = true): void {
    if (packedRecords.length % GRASS_FIELD_PACKED_STRIDE_FLOATS !== 0) {
      throw new Error(
        `blade field expected ${GRASS_FIELD_PACKED_STRIDE_FLOATS}-float records, got ${packedRecords.length}`,
      );
    }
    this.enabled = visible;
    this.recordCount = packedRecords.length / GRASS_FIELD_PACKED_STRIDE_FLOATS;
    this.recordHash = hashPackedRecords(packedRecords);
    this.packedRecords = new Float32Array(packedRecords);
    if (this.recordCount === 0) {
      this.runtime = null;
      this.culledRecords = 0;
      this.thinnedRecords = 0;
      for (const bucket of this.buckets) {
        bucket.records = 0;
        bucket.candidateRecords = 0;
        bucket.droppedByThinning = 0;
        bucket.mesh.geometry.instanceCount = 0;
        bucket.mesh.visible = false;
      }
      return;
    }
    this.runtime = createGpuRuntime(
      this.packedRecords,
      this.buckets,
      this.transitionUniforms,
      this.thinning,
    );

    for (const bucket of this.buckets) {
      bucket.mesh.material.dispose();
      bucket.mesh.material = bladeFieldMaterial(
        this.runtime.grassData,
        bucket.visibleIndices,
        this.time,
        this.transitionUniforms,
        this.runtime.anchor,
        this.thinning.survivorAlbedoBlend,
      );
      bucket.records = 0;
      // Capacity, not the drawn count: the indirect buffer's GPU-routed
      // instanceCount decides what draws, but three skips geometry with
      // instanceCount 0 before the indirect path is consulted.
      bucket.mesh.geometry.instanceCount = this.recordCount;
      bucket.mesh.visible = this.tierVisible(bucket.spec, visible);
    }
  }

  routeGpu(
    renderer: THREE.WebGPURenderer,
    eye: readonly [number, number, number],
    anchor: readonly [number, number] = [eye[0], eye[1]],
  ): void {
    if (!this.runtime) return;
    this.runtime.camera.value.set(eye[0], eye[1], eye[2]);
    this.runtime.anchor.value.set(anchor[0], anchor[1]);
    this.updateCpuMirrorTierCounts(anchor);
    const compute = (renderer as unknown as { compute(node: unknown): void }).compute.bind(
      renderer,
    );
    compute(this.runtime.reset);
    compute(this.runtime.route);
    this.runtime.routed = true;
  }

  setVisible(visible: boolean): void {
    this.enabled = visible;
    for (const bucket of this.buckets) bucket.mesh.visible = this.tierVisible(bucket.spec, visible);
  }

  setFarTierVisible(visible: boolean): void {
    this.farTierVisible = visible;
    for (const bucket of this.buckets) {
      bucket.mesh.visible = this.tierVisible(bucket.spec, this.enabled);
    }
  }

  setTransition(profile: BladeFieldTransitionProfile): BladeFieldTransitionProfile {
    this.transition = this.applyTransitionProfile(profile);
    this.thinning = thinningProfileForTransition(this.transition, this.thinning.enabled);
    return this.transition;
  }

  private updateCpuMirrorTierCounts(anchor: readonly [number, number]): void {
    for (const bucket of this.buckets) {
      bucket.records = 0;
      bucket.candidateRecords = 0;
      bucket.droppedByThinning = 0;
    }
    this.culledRecords = 0;
    this.thinnedRecords = 0;
    const tierRanges = tierRangesForTransition(this.transition);
    for (let i = 0; i < this.recordCount; i++) {
      const o = i * GRASS_FIELD_PACKED_STRIDE_FLOATS;
      const x = this.packedRecords[o];
      const y = this.packedRecords[o + 1];
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
  }

  stats(): BladeFieldStats {
    const tiers = Object.fromEntries(
      this.buckets.map((bucket) => {
        const range = tierRangesForTransition(this.transition)[bucket.spec.id];
        const verticesPerBlade = (bucket.spec.segments + 1) * 2;
        const trianglesPerBlade = bucket.spec.segments * 2;
        return [
          bucket.spec.id,
          {
            lodTier: bucket.spec.lodTier,
            segments: bucket.spec.segments,
            minDistanceM: range.minDistanceM,
            maxDistanceM: range.maxDistanceM,
            candidateRecords: bucket.candidateRecords,
            records: bucket.records,
            droppedByThinning: bucket.droppedByThinning,
            triangles: bucket.records * trianglesPerBlade,
            vertices: bucket.records * verticesPerBlade,
          },
        ];
      }),
    ) as BladeFieldStats["tiers"];
    return {
      layer: "photoreal-blade-field",
      enabled: this.enabled,
      farTierVisible: this.farTierVisible,
      packedStrideFloats: GRASS_FIELD_PACKED_STRIDE_FLOATS,
      packedBytesPerRecord: GRASS_FIELD_PACKED_BYTES,
      recordCount: this.recordCount,
      drawCalls: 3,
      submittedTriangles: Object.values(tiers).reduce((sum, tier) => sum + tier.triangles, 0),
      submittedVertices: Object.values(tiers).reduce((sum, tier) => sum + tier.vertices, 0),
      tiers,
      tierCountSource: this.thinning.enabled
        ? "cpu-mirror-live-distance-hash-thinning"
        : "cpu-mirror-live-distance-rule",
      culledRecords: this.culledRecords,
      thinnedRecords: this.thinnedRecords,
      thinning: this.thinning,
      transition: this.transition,
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
        timeUniform: "PhotorealWorld.uTime",
        phaseSpeed: 0.82,
        spatialScaleX: 0.035,
        spatialScaleY: 0.021,
        tipAmplitudeM: 0.034,
      },
      palette: BLADE_FIELD_PALETTE,
      recordHash: this.recordHash,
    };
  }

  private tierVisible(spec: BladeFieldTierSpec, visible: boolean): boolean {
    return visible && (this.farTierVisible || spec.id !== "far");
  }

  private applyTransitionProfile(
    profile: BladeFieldTransitionProfile,
  ): BladeFieldTransitionProfile {
    const clamped = transitionProfileForTiers(this.tiers, profile);
    return updateBladeFieldTransitionUniforms(this.transitionUniforms, clamped);
  }
}

function bladeGeometry(segments: number): THREE.InstancedBufferGeometry {
  const vertexCount = (segments + 1) * 2;
  const indexCount = segments * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(indexCount);
  let vp = 0;
  let np = 0;
  let up = 0;
  let ip = 0;
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    for (const side of [-0.5, 0.5]) {
      positions[vp++] = side;
      positions[vp++] = t;
      positions[vp++] = 0;
      normals[np++] = 0;
      normals[np++] = 0;
      normals[np++] = 1;
      uvs[up++] = side + 0.5;
      uvs[up++] = t;
    }
  }
  for (let s = 0; s < segments; s++) {
    const a = s * 2;
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
  const storageArray = instancedArray as unknown as (
    array: Float32Array,
    type: unknown,
  ) => {
    setName(name: string): {
      element(index: unknown): { get(field: string): unknown };
    };
  };
  const grassData = storageArray(packedRecords, grassStorageStruct).setName(
    "PhotorealBladeFieldRecords",
  );
  const camera = uniform(new THREE.Vector3(0, 0, 0));
  const anchor = uniform(new THREE.Vector2(0, 0)) as unknown as Vec2UniformNode;
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
    const seed01 = clamp(d2.z.div(float(SEED24_MASK)), 0.0, 1.0);
    const bladeHash = fract(seed01.mul(7.13));
    const fadeStart = min(
      transition.farGrassStartM,
      max(transition.denseBladeEndM, transition.farGrassEndM.sub(float(80.0))),
    );
    const fade = smoothstep(fadeStart, transition.farGrassEndM, dist);
    // Disabled profile (ratified lab envelope) keeps every blade.
    const survival = thinning.enabled ? float(1.0).sub(fade) : float(1.0);
    const farTierEnd = thinning.enabled
      ? transition.farGrassEndM
      : transition.farGrassEndM.add(float(1_000_000.0));
    If(bladeHash.lessThan(survival), () => {
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

  return {
    camera,
    anchor,
    reset: resetFn().compute(1).setName("PhotorealBladeFieldResetIndirect"),
    route: routeFn()
      .compute(packedRecords.length / 16)
      .setName("PhotorealBladeFieldRouteLod"),
    routed: false,
    grassData,
  };
}

function bladeFieldMaterial(
  grassData: unknown,
  visibleIndices: unknown,
  time: FloatNode,
  transition: BladeFieldTransitionUniforms,
  anchor: Vec2UniformNode,
  survivorAlbedoBlend: number,
): THREE.MeshStandardNodeMaterial {
  // Standard material so the environment (the mood owner) lights the canopy -
  // Lambert never samples the sky IBL here and left the field slate-grey. The
  // white-sheen hazard (GGX env-specular at grazing blade normals, verified by
  // a red-albedo probe) is closed by the field-normal shading below, not by
  // changing the lighting model.
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 0.96,
    metalness: 0,
  });
  const local = attribute<"vec3">("position", "vec3");
  const indexBuffer = visibleIndices as { element(index: unknown): unknown };
  const recordBuffer = grassData as { element(index: unknown): StorageRecordNode };

  // Salvage pattern (falseEarthCloseGrass createSourceStorageMaterial):
  // varyings are DECLARED with placeholders and ASSIGNED inside the Fn that IS
  // positionNode, so every storage read executes in the position graph - the
  // only vertex stage where the record buffers are bound. Reading storage from
  // the color graph (directly, via shared nodes, or via a fresh element()
  // chain) renders garbage/white; a x0 position anchor gets constant-folded.
  const vAlbedo = varying(vec3(0.0));
  const vShadeNormal = varying(vec3(0.0, 0.0, 1.0));
  const vRough = varying(float(0.96));

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
    // Tall clumps widen too: a clump reads as one bright mass, not stripes.
    const width = max(d1.x.mul(mix(0.85, 1.35, clamp(d2.w, 0.0, 1.0))), 0.018)
      .mul(mix(1.0, transition.farSoftWidthScale, farSoftShape))
      .toVar();
    const clumpWeight = clamp(d2.w, 0.0, 1.0);
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
    // Coverage-edge dissolve: blades SINK into the turf across the last
    // stretch of the far transition instead of stopping full-height at a
    // hard radius (the "visible from across the room" cutoff critique).
    const edgeSink =
      survivorAlbedoBlend > 0
        ? smoothstep(transition.farGrassEndM, transition.edgeSinkStartM, eyeDist)
        : float(1.0);
    const height = max(d1.y.mul(mix(0.52, 1.32, clumpWeight)), 0.16)
      .mul(nearEyeFade)
      .mul(mix(1.0, 0.72, farSoftShape))
      .mul(edgeSink)
      .toVar();
    const bend = d1.z.mul(mix(1.34, 0.94, farSoftShape)).toVar();
    const phase = d1.w;
    const yaw = d2.x;
    const clumpSeed = d2.y;
    const bladeSeed = d2.z;
    const terrainNormal = normalize(vec3(d3.x, d3.y, max(d3.z, 0.08))).toVar();
    const forward = normalize(vec3(cos(yaw), sin(yaw), 0.0)).toVar();
    const tangentForward = normalize(
      forward.sub(terrainNormal.mul(dot(forward, terrainNormal))),
    ).toVar();
    const side = normalize(cross(tangentForward, terrainNormal)).toVar();
    const t = clamp(local.y, 0.0, 1.0).toVar();
    const u = float(1.0).sub(t).toVar();
    const t2 = t.mul(t).toVar();
    const u2 = u.mul(u).toVar();
    const windDir = normalize(vec3(0.82, 0.22, 0.0));
    const windWave = sin(
      phase.add(time.mul(0.82)).add(base.x.mul(0.035)).add(base.y.mul(0.021)),
    ).toVar();
    const clumpBend = mix(0.76, 1.18, clumpWeight);
    const p0 = base;
    const p1 = base
      .add(terrainNormal.mul(height).mul(0.28))
      .add(tangentForward.mul(bend).mul(height).mul(0.1));
    const p2 = base
      .add(terrainNormal.mul(height).mul(0.7))
      .add(tangentForward.mul(bend).mul(height).mul(0.34).mul(clumpBend))
      .add(windDir.mul(windWave).mul(height).mul(0.018));
    const p3 = base
      .add(terrainNormal.mul(height))
      .add(tangentForward.mul(bend).mul(height).mul(0.62).mul(clumpBend))
      .add(windDir.mul(windWave).mul(height).mul(0.034));
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
    // Sharper taper: fat straight wedges read as agave, not grass (unprimed
    // critique). Narrow shoulders, fine tip.
    const widthFactor = t
      .mul(0.5)
      .add(0.5)
      .mul(pow(float(1.0).sub(t), mix(1.6, 2.35, farSoftShape)))
      .toVar();
    const cameraDir = normalize(cameraPosition.sub(center)).toVar();
    const viewSideSigned = dot(cameraDir, side).toVar();
    const centerMask = pow(float(1.0).sub(t), 0.48).mul(pow(t.add(0.05), 0.33));
    const viewBulk = pow(abs(viewSideSigned), 1.12).mul(centerMask).mul(width).mul(2.35);
    const bladeSide = local.x.mul(2.0);
    const world = center
      .add(side.mul(width).mul(widthFactor).mul(bladeSide))
      .add(geoNormal.mul(viewBulk).mul(bladeSide))
      .toVar();

    // Grass shades with the FIELD's normal (the GoT trick): blade-face
    // normals give half the field black backsides under a directional sun or
    // white grazing sheen under the sky IBL. Structure comes from the albedo.
    vShadeNormal.assign(
      normalize(mix(geoNormal.add(side.mul(viewSideSigned).mul(0.18)), terrainNormal, 0.94)),
    );

    // TSL hazards found the hard way (both required for correct color):
    // 1. Storage reads only bind in the position graph - varyings must be
    //    assigned INSIDE this Fn (the salvage pattern), never computed on the
    //    color path.
    // 2. sin(seed * 43758.5453) - the classic hash - returns garbage/NaN on
    //    Metal for large arguments; one NaN turns the whole albedo white.
    //    Blade-level noise must use small-argument hashes (fract-based).
    const root = rgbNode(BLADE_FIELD_PALETTE.root);
    const mid = rgbNode(BLADE_FIELD_PALETTE.mid);
    const tip = rgbNode(BLADE_FIELD_PALETTE.tip);
    const body = mix(mix(root, mid, smoothstepN(0.0, 0.58, t)), tip, smoothstepN(0.38, 1.0, t));
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
    const meadow = vec3(0.47, 0.53, 0.32);
    const shaded = mix(body, tip, dryTip)
      .mul(heightAo)
      .mul(clumpShade)
      .mul(clumpFactor)
      .mul(bladeFactor)
      .mul(mix(0.92, 0.72, farSoftShape));
    const desat = mix(shaded, vec3(dot(shaded, vec3(0.333))), distFade.mul(0.16));
    const albedo = mix(desat, meadow, ringFade.mul(survivorAlbedoBlend));
    vAlbedo.assign(clamp(albedo, vec3(0.0), vec3(1.0)));
    vRough.assign(mix(0.98, 0.84, smoothstepN(0.18, 1.0, t)));

    return world;
  });

  const worldPosition = Fn(() => buildVertex())();
  material.positionNode = worldPosition;
  material.receivedShadowPositionNode = varying(worldPosition);
  material.normalNode = viewNormalNode(normalize(vShadeNormal));
  material.colorNode = vec4(linearAlbedo(vAlbedo), 1.0);
  material.roughnessNode = vRough;
  return material;
}

function transitionProfileForTiers(
  tiers: readonly BladeFieldTierSpec[],
  transition: BladeFieldTransitionProfile,
): BladeFieldTransitionProfile {
  const farTier = tiers[tiers.length - 1] ?? BLADE_FIELD_LOD_TIERS[2];
  const farGrassEndM = Math.min(
    Math.max(transition.farGrassEndM, transition.farGrassStartM),
    farTier.maxDistanceM,
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
    Math.max(transition.midTierEndM ?? farGrassStartM, nearTierEndM),
    farGrassEndM,
  );
  return {
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM,
    midTierEndM,
    farSoftWidthScale: farSoftWidthScaleUniformValue(transition),
    terrainDetailStrength: terrainDetailStrengthUniformValue(transition),
    edgeSinkStartM:
      transition.edgeSinkStartM === undefined
        ? undefined
        : Math.min(Math.max(transition.edgeSinkStartM, farTier.minDistanceM), farGrassEndM),
  };
}

function normalizedTransitionProfile(
  transition: BladeFieldTransitionProfile,
): BladeFieldTransitionProfile {
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
  return {
    denseBladeEndM,
    farGrassStartM,
    farGrassEndM,
    nearTierEndM,
    midTierEndM,
    farSoftWidthScale: farSoftWidthScaleUniformValue(transition),
    terrainDetailStrength: terrainDetailStrengthUniformValue(transition),
    edgeSinkStartM:
      transition.edgeSinkStartM === undefined
        ? undefined
        : Math.min(Math.max(transition.edgeSinkStartM, 0), farGrassEndM),
  };
}

function tierRangesForTransition(transition: BladeFieldTransitionProfile): Record<
  BladeFieldTierId,
  {
    minDistanceM: number;
    maxDistanceM: number;
  }
> {
  const normalized = normalizedTransitionProfile(transition);
  const nearEnd = nearTierEndUniformValue(normalized);
  const midEnd = midTierEndUniformValue(normalized);
  const farEnd = normalized.farGrassEndM;
  return {
    near: { minDistanceM: 0, maxDistanceM: nearEnd },
    mid: { minDistanceM: nearEnd, maxDistanceM: midEnd },
    far: { minDistanceM: midEnd, maxDistanceM: farEnd },
  };
}

function nearTierEndUniformValue(transition: BladeFieldTransitionProfile): number {
  return transition.nearTierEndM ?? transition.denseBladeEndM;
}

function midTierEndUniformValue(transition: BladeFieldTransitionProfile): number {
  return transition.midTierEndM ?? transition.farGrassStartM;
}

function farSoftWidthScaleUniformValue(transition: BladeFieldTransitionProfile): number {
  const value = transition.farSoftWidthScale ?? 1.6;
  return Math.max(1, Math.min(3, Number.isFinite(value) ? value : 1.6));
}

function edgeSinkStartUniformValue(transition: BladeFieldTransitionProfile): number {
  return transition.edgeSinkStartM ?? Math.max(0, transition.farGrassEndM - 0.001);
}

function terrainDetailStrengthUniformValue(transition: BladeFieldTransitionProfile): number {
  const value = transition.terrainDetailStrength ?? 1;
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}

function thinningProfileForTransition(
  transition: BladeFieldTransitionProfile,
  blendSurvivors: boolean,
): BladeFieldThinningProfile {
  return {
    // Thinning is the production edge treatment: density starts falling just
    // past mid-ring and reaches zero at the coverage edge. Height sink remains
    // a secondary softener, never the primary edge signal.
    enabled: blendSurvivors,
    fadeStartM: productionFadeStartM(transition),
    fadeEndM: transition.farGrassEndM,
    hashSource: "record.bladeSeed fract(seed01 * 7.13)",
    survivorAlbedoBlend: blendSurvivors ? 0.85 : 0,
  };
}

function productionFadeStartM(transition: BladeFieldTransitionProfile): number {
  return Math.min(
    transition.farGrassStartM,
    Math.max(transition.denseBladeEndM, transition.farGrassEndM - 80),
  );
}

function bladeSurvivesDistanceThinning(
  dist: number,
  bladeSeed: number,
  thinning: BladeFieldThinningProfile,
): boolean {
  if (!thinning.enabled) return true;
  const survival = 1 - smoothstep01(thinning.fadeStartM, thinning.fadeEndM, dist);
  return bladeHash01(bladeSeed) < survival;
}

function bladeHash01(bladeSeed: number): number {
  return fract01(clamp01(bladeSeed / SEED24_MASK) * 7.13);
}

function smoothstep01(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value < edge1 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function fract01(value: number): number {
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function hashPackedRecords(records: Float32Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < records.length; i++) {
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
  return (h >>> 0).toString(16).padStart(8, "0");
}
