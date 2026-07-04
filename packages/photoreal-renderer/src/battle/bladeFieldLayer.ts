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

export const BLADE_FIELD_LOD_TIERS: readonly BladeFieldTierSpec[] = [
  { id: "near", lodTier: 0, segments: 15, minDistanceM: 0, maxDistanceM: 5 },
  { id: "mid", lodTier: 1, segments: 5, minDistanceM: 5, maxDistanceM: 20 },
  { id: "far", lodTier: 2, segments: 2, minDistanceM: 20, maxDistanceM: 64 },
];

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
      records: number;
      triangles: number;
      vertices: number;
    }
  >;
  tierCountSource: "cpu-mirror-live-distance-rule";
  culledRecords: number;
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

interface TierBucket {
  spec: BladeFieldTierSpec;
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardNodeMaterial>;
  records: number;
  drawBuffer: THREE.IndirectStorageBufferAttribute;
  visibleIndices: unknown | null;
  drawStorage: unknown | null;
}

interface BladeFieldGpuRuntime {
  camera: { value: THREE.Vector3 };
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

export class PhotorealBladeFieldLayer {
  private readonly buckets: TierBucket[];
  private readonly time: FloatNode;
  private recordCount = 0;
  private recordHash = "00000000";
  private enabled = true;
  private runtime: BladeFieldGpuRuntime | null = null;
  private packedRecords = new Float32Array();
  private culledRecords = 0;

  private readonly tiers: readonly BladeFieldTierSpec[];
  // Blend blades into the meadow tone at the cull ring (production edge
  // treatment; the ratified close-lab envelope renders unfaded).
  private readonly edgeFade: boolean;

  /** `tiers` overrides the ratified close-lab envelope (far 64 m) - the
   *  production battle passes a wider far tier so vista framing (eye ~59 m
   *  up) does not distance-cull the whole field. Slice 12 owns real
   *  stratified budgets/thinning. */
  constructor(
    scene: THREE.Scene,
    time: FloatNode = uniform(0) as unknown as FloatNode,
    tiers: readonly BladeFieldTierSpec[] = BLADE_FIELD_LOD_TIERS,
    edgeFade = false,
  ) {
    this.time = time;
    this.tiers = tiers;
    this.edgeFade = edgeFade;
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
      return { spec, mesh, records: 0, drawBuffer, visibleIndices: null, drawStorage: null };
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
      for (const bucket of this.buckets) {
        bucket.records = 0;
        bucket.mesh.geometry.instanceCount = 0;
        bucket.mesh.visible = false;
      }
      return;
    }
    this.runtime = createGpuRuntime(this.packedRecords, this.buckets, this.tiers);

    for (const bucket of this.buckets) {
      bucket.mesh.material.dispose();
      bucket.mesh.material = bladeFieldMaterial(
        this.runtime.grassData,
        bucket.visibleIndices,
        this.time,
        this.tiers[2].maxDistanceM,
        this.edgeFade,
      );
      bucket.records = 0;
      // Capacity, not the drawn count: the indirect buffer's GPU-routed
      // instanceCount decides what draws, but three skips geometry with
      // instanceCount 0 before the indirect path is consulted.
      bucket.mesh.geometry.instanceCount = this.recordCount;
      bucket.mesh.visible = visible;
    }
  }

  routeGpu(renderer: THREE.WebGPURenderer, eye: readonly [number, number, number]): void {
    if (!this.runtime) return;
    this.runtime.camera.value.set(eye[0], eye[1], eye[2]);
    this.updateCpuMirrorTierCounts(eye);
    const compute = (renderer as unknown as { compute(node: unknown): void }).compute.bind(
      renderer,
    );
    compute(this.runtime.reset);
    compute(this.runtime.route);
    this.runtime.routed = true;
  }

  setVisible(visible: boolean): void {
    this.enabled = visible;
    for (const bucket of this.buckets) bucket.mesh.visible = visible;
  }

  private updateCpuMirrorTierCounts(eye: readonly [number, number, number]): void {
    for (const bucket of this.buckets) bucket.records = 0;
    this.culledRecords = 0;
    for (let i = 0; i < this.recordCount; i++) {
      const o = i * GRASS_FIELD_PACKED_STRIDE_FLOATS;
      const x = this.packedRecords[o];
      const y = this.packedRecords[o + 1];
      const z = this.packedRecords[o + 2];
      const dist = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
      if (dist < this.tiers[0].maxDistanceM) this.buckets[0].records++;
      else if (dist < this.tiers[1].maxDistanceM) this.buckets[1].records++;
      else if (dist < this.tiers[2].maxDistanceM) this.buckets[2].records++;
      else this.culledRecords++;
    }
  }

  stats(): BladeFieldStats {
    const tiers = Object.fromEntries(
      this.buckets.map((bucket) => {
        const verticesPerBlade = (bucket.spec.segments + 1) * 2;
        const trianglesPerBlade = bucket.spec.segments * 2;
        return [
          bucket.spec.id,
          {
            lodTier: bucket.spec.lodTier,
            segments: bucket.spec.segments,
            minDistanceM: bucket.spec.minDistanceM,
            maxDistanceM: bucket.spec.maxDistanceM,
            records: bucket.records,
            triangles: bucket.records * trianglesPerBlade,
            vertices: bucket.records * verticesPerBlade,
          },
        ];
      }),
    ) as BladeFieldStats["tiers"];
    return {
      layer: "photoreal-blade-field",
      enabled: this.enabled,
      packedStrideFloats: GRASS_FIELD_PACKED_STRIDE_FLOATS,
      packedBytesPerRecord: GRASS_FIELD_PACKED_BYTES,
      recordCount: this.recordCount,
      drawCalls: 3,
      submittedTriangles: Object.values(tiers).reduce((sum, tier) => sum + tier.triangles, 0),
      submittedVertices: Object.values(tiers).reduce((sum, tier) => sum + tier.vertices, 0),
      tiers,
      tierCountSource: "cpu-mirror-live-distance-rule",
      culledRecords: this.culledRecords,
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
  tiers: readonly BladeFieldTierSpec[],
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
    const pos = d0.xyz;
    const dist = length(camera.sub(pos));
    If(dist.lessThan(float(tiers[0].maxDistanceM)), () => {
      appendToTier(configs[0]);
    })
      .ElseIf(dist.lessThan(float(tiers[1].maxDistanceM)), () => {
        appendToTier(configs[1]);
      })
      .ElseIf(dist.lessThan(float(tiers[2].maxDistanceM)), () => {
        appendToTier(configs[2]);
      });
  });

  return {
    camera,
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
  farMaxM: number,
  edgeFade: boolean,
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
    // Tall clumps widen too: a clump reads as one bright mass, not stripes.
    const width = max(d1.x.mul(mix(0.85, 1.35, clamp(d2.w, 0.0, 1.0))), 0.018).toVar();
    const clumpWeight = clamp(d2.w, 0.0, 1.0);
    // Clump-scale canopy: the Voronoi clumpWeight (1.55 m cells) drives a
    // strong height swing so the field breaks into clumps with tip-lines at
    // many heights - the structure the close-gate oracle (and the reference)
    // shows.
    const height = max(d1.y.mul(mix(0.52, 1.32, clumpWeight)), 0.16).toVar();
    const bend = d1.z.mul(1.15).toVar();
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
      .mul(pow(float(1.0).sub(t), 1.6))
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
    const eyeDist = length(cameraPosition.sub(base)).toVar();
    const distFade = smoothstep(float(18.0), float(42.0), eyeDist);
    // Blend into the meadow tone toward the cull ring so the coverage edge
    // dissolves instead of cutting a hard disc (slice 12 owns real thinning).
    const ringFade = smoothstep(
      float(farMaxM * 0.72),
      float(farMaxM * 0.95),
      eyeDist,
    );
    const meadow = vec3(0.47, 0.53, 0.32);
    const shaded = mix(body, tip, dryTip)
      .mul(heightAo)
      .mul(clumpShade)
      .mul(clumpFactor)
      .mul(bladeFactor)
      .mul(0.92);
    const desat = mix(shaded, vec3(dot(shaded, vec3(0.333))), distFade.mul(0.16));
    const albedo = mix(desat, meadow, ringFade.mul(edgeFade ? 0.85 : 0.0));
    vAlbedo.assign(clamp(albedo, vec3(0.0), vec3(1.0)));
    vRough.assign(mix(0.97, 0.9, smoothstepN(0.18, 1.0, t)));

    return world;
  });

  material.positionNode = Fn(() => buildVertex())();
  material.normalNode = viewNormalNode(normalize(vShadeNormal));
  material.colorNode = vec4(linearAlbedo(vAlbedo), 1.0);
  material.roughnessNode = vRough;
  return material;
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
