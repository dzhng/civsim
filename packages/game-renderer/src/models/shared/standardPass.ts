import type { RawFrameShell, WorldRenderPass } from '../../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../../renderer-core/src/cameraWgsl';
import { GrowableBuffer, makeIndexBuffer, makeVertexBuffer } from '../../../../renderer-core/src/gpuBuffers';
import { cameraOnlyPipeline } from '../../../../renderer-core/src/pipelineContracts';
import {
  buildStandardMesh,
  STANDARD_SIZE_TIER_IDS,
  STANDARD_VERTEX_STRIDE_FLOATS,
  STANDARD_WAVE_BACK_LOBE,
  STANDARD_WAVE,
  type StandardLivery,
  standardLiveryForFaction,
  standardSeed,
  standardWindPhase,
  standardWindStrength,
  type StandardMeshData,
  type StandardSizeTier,
} from './standardAsset';
import type { BattleFactionId } from '../../battle/factionColors';

export interface StandardInstance {
  x: number;
  y: number;
  z?: number;
  tier: StandardSizeTier;
  factionId: BattleFactionId;
  livery?: StandardInstanceLivery;
  yaw?: number;
  scale?: number;
  windPhase?: number;
  windStrength?: number;
}

interface StandardInstanceLivery {
  field: readonly [number, number, number];
  trim?: readonly [number, number, number];
  emblem?: readonly [number, number, number];
}

const STANDARD_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) alpha: f32,
  @location(2) light: f32,
  @location(3) material: f32,
};

// Twin of standardWaveDisplacement (standardAsset.ts) — keep in sync. The
// back lobe (toward the pole) is quarter-amplitude so the cloth never swings
// back far enough to pierce the pole it hangs in front of.
fn clothWave(local: vec3f, weight: f32, phase: f32, strength: f32) -> f32 {
  let primary = sin(cam.time * ${STANDARD_WAVE.primaryTime} + phase + local.x * ${STANDARD_WAVE.primaryX} + local.z * ${STANDARD_WAVE.primaryZ});
  let secondary = sin(cam.time * ${STANDARD_WAVE.secondaryTime} + phase * ${STANDARD_WAVE.secondaryPhase} + local.x * ${STANDARD_WAVE.secondaryX} - local.z * ${STANDARD_WAVE.secondaryZ});
  let wave = primary * ${STANDARD_WAVE.primaryMix} + secondary * ${STANDARD_WAVE.secondaryMix};
  let shaped = select(wave, wave * ${STANDARD_WAVE_BACK_LOBE}, wave > 0.0);
  return weight * strength * shaped;
}

fn materialColor(material: f32, field: vec3f, trim: vec3f, emblem: vec3f) -> vec4f {
  if (material < 0.5) {
    return vec4f(0.34, 0.22, 0.12, 1.0);
  }
  if (material < 1.5) {
    return vec4f(trim, 1.0);
  }
  if (material < 2.5) {
    return vec4f(field, 1.0);
  }
  if (material < 3.5) {
    return vec4f(trim, 1.0);
  }
  if (material < 4.5) {
    return vec4f(emblem, 1.0);
  }
  return vec4f(0.045, 0.036, 0.026, 0.20);
}

@vertex
fn vs(
  @location(0) local0: vec3f,
  @location(1) normal: vec3f,
  @location(2) uvWeightMaterial: vec4f,
  @location(3) pose: vec4f,
  @location(4) fieldPhase: vec4f,
  @location(5) trimStrength: vec4f,
  @location(6) emblemShade: vec4f,
) -> VsOut {
  let weight = uvWeightMaterial.z;
  let material = uvWeightMaterial.w;
  let instanceScale = max(emblemShade.a, 0.0001);
  var local = local0;
  local.y = local.y + clothWave(local0, weight, fieldPhase.a, trimStrength.a);
  local = local * instanceScale;
  let cy = cos(pose.w);
  let sy = sin(pose.w);
  let world = vec3f(
    pose.x + local.x * cy - local.y * sy,
    pose.y + local.x * sy + local.y * cy,
    pose.z + local.z
  );
  let rnormal = normalize(vec3f(
    normal.x * cy - normal.y * sy,
    normal.x * sy + normal.y * cy,
    normal.z
  ));
  let base = materialColor(material, fieldPhase.rgb, trimStrength.rgb, emblemShade.rgb);
  let sun = sunDirection();
  let lift = clamp(world.z / 6.6, 0.0, 1.0);
  var out: VsOut;
  out.pos = projectWorld(world);
  out.color = base.rgb;
  out.alpha = base.a;
  // abs(): the mesh is single-sided with cull off, so light cloth and strips
  // the same from either side instead of dropping the back to the floor.
  out.light = clamp(abs(dot(rnormal, sun)) * 0.36 + 0.78 + lift * 0.08, 0.48, 1.18);
  out.material = material;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let warmKey = vec3f(1.10, 1.01, 0.82);
  let coolFill = vec3f(0.72, 0.77, 0.86);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.48) / 0.70, 0.0, 1.0));
  var color = in.color * in.light * grade;
  if (in.material > 0.5 && in.material < 1.5) {
    color = color + vec3f(0.10, 0.07, 0.015);
  }
  if (in.material > 2.5 && in.material < 4.5) {
    color = color + vec3f(0.07, 0.05, 0.01);
  }
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), in.alpha);
}`;

export class SharedStandardPass {
  private opaquePipeline: GPURenderPipeline;
  private shadowPipeline: GPURenderPipeline;
  private meshes: Record<StandardSizeTier, StandardMeshData>;
  private vertexBuffers: Record<StandardSizeTier, GPUBuffer>;
  private indexBuffers: Record<StandardSizeTier, GPUBuffer>;
  private shadowVertexBuffers: Record<StandardSizeTier, GPUBuffer>;
  private shadowIndexBuffers: Record<StandardSizeTier, GPUBuffer>;
  private instanceBuffers: Record<StandardSizeTier, GrowableBuffer>;
  private counts: Record<StandardSizeTier, number>;
  private shell: RawFrameShell;

  constructor(shell: RawFrameShell) {
    this.shell = shell;
    const device = shell.device;
    const module = device.createShaderModule({ label: 'shared-standard-wgsl', code: STANDARD_WGSL });
    this.opaquePipeline = this.makePipeline(module, 'opaque');
    this.shadowPipeline = this.makePipeline(module, 'shadow');
    this.meshes = standardTierRecord((tier) => buildStandardMesh(tier));
    this.vertexBuffers = standardTierRecord((tier) =>
      makeVertexBuffer(device, `shared-standard-${tier}-vertices`, this.meshes[tier].opaque.vertices),
    );
    this.indexBuffers = standardTierRecord((tier) =>
      makeIndexBuffer(device, `shared-standard-${tier}-indices`, this.meshes[tier].opaque.indices),
    );
    this.shadowVertexBuffers = standardTierRecord((tier) =>
      makeVertexBuffer(
        device,
        `shared-standard-${tier}-shadow-vertices`,
        this.meshes[tier].shadow.vertices,
      ),
    );
    this.shadowIndexBuffers = standardTierRecord((tier) =>
      makeIndexBuffer(device, `shared-standard-${tier}-shadow-indices`, this.meshes[tier].shadow.indices),
    );
    this.instanceBuffers = standardTierRecord((tier) =>
      new GrowableBuffer(device, `shared-standard-${tier}-instances`, GPUBufferUsage.VERTEX, 32 * 16 * 4),
    );
    this.counts = standardTierRecord(() => 0);
  }

  upload(instances: readonly StandardInstance[]) {
    for (const tier of STANDARD_SIZE_TIER_IDS) {
      const bucket = instances.filter((instance) => instance.tier === tier);
      this.counts[tier] = bucket.length;
      this.instanceBuffers[tier].write(packInstances(bucket));
    }
  }

  drawOpaque(pass: WorldRenderPass) {
    this.draw(pass, this.opaquePipeline, false);
  }

  drawShadows(pass: WorldRenderPass) {
    this.draw(pass, this.shadowPipeline, true);
  }

  stats() {
    const standards = STANDARD_SIZE_TIER_IDS.reduce((sum, tier) => sum + this.counts[tier], 0);
    return {
      standards,
      tiers: STANDARD_SIZE_TIER_IDS.filter((tier) => this.counts[tier] > 0),
      meshVerticesByTier: standardTierRecord(
        (tier) =>
          (this.meshes[tier].opaque.vertices.length + this.meshes[tier].shadow.vertices.length) /
          STANDARD_VERTEX_STRIDE_FLOATS,
      ),
      meshIndexCountByTier: standardTierRecord(
        (tier) => this.meshes[tier].opaque.indexCount + this.meshes[tier].shadow.indexCount,
      ),
      weightChannel: 'uvWeightMaterial.z: 0 rigid hardware, >0 cloth/trim/emblem',
      materialChannel: 'uvWeightMaterial.w: pole/gold/cloth/trim/emblem/shadow',
      liveryContract: 'instance livery overrides field/trim/emblem; battle faction table remains default',
      waveContract: 'cam.time + deterministic per-instance phase + strength',
      layer: 'shared-3d-standard-asset',
    };
  }

  private makePipeline(module: GPUShaderModule, material: 'opaque' | 'shadow') {
    return cameraOnlyPipeline(this.shell, {
      label:
        material === 'opaque'
          ? 'shared-standard-opaque-depth-pipeline'
          : 'shared-standard-shadow-decal-pipeline',
      module,
      buffers: [
          {
            arrayStride: STANDARD_VERTEX_STRIDE_FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x4' },
            ],
          },
          {
            arrayStride: 64,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x4' },
              { shaderLocation: 4, offset: 16, format: 'float32x4' },
              { shaderLocation: 5, offset: 32, format: 'float32x4' },
              { shaderLocation: 6, offset: 48, format: 'float32x4' },
            ],
          },
      ],
      target: material === 'opaque' ? 'opaque' : 'alpha',
      depth: material === 'opaque' ? 'read-write' : 'read',
    });
  }

  private draw(pass: WorldRenderPass, pipeline: GPURenderPipeline, shadow: boolean) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    for (const tier of STANDARD_SIZE_TIER_IDS) {
      const count = this.counts[tier];
      if (count === 0) continue;
      const mesh = this.meshes[tier];
      if (shadow) {
        pass.setVertexBuffer(0, this.shadowVertexBuffers[tier]);
        pass.setIndexBuffer(this.shadowIndexBuffers[tier], 'uint16');
        pass.setVertexBuffer(1, this.instanceBuffers[tier].buffer);
        pass.drawIndexed(mesh.shadow.indexCount, count);
      } else {
        pass.setVertexBuffer(0, this.vertexBuffers[tier]);
        pass.setIndexBuffer(this.indexBuffers[tier], 'uint16');
        pass.setVertexBuffer(1, this.instanceBuffers[tier].buffer);
        pass.drawIndexed(mesh.opaque.indexCount, count);
      }
    }
  }
}

function packInstances(instances: readonly StandardInstance[]) {
  const data = new Float32Array(instances.length * 16);
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const livery = instanceLivery(instance, standardLiveryForFaction(instance.factionId));
    const seed = standardSeed(instance.tier, instance.factionId);
    const offset = i * 16;
    data[offset] = instance.x;
    data[offset + 1] = instance.y;
    data[offset + 2] = instance.z ?? 0;
    data[offset + 3] = instance.yaw ?? 0;
    data.set(livery.field, offset + 4);
    data[offset + 7] = instance.windPhase ?? standardWindPhase(seed);
    data.set(livery.trim, offset + 8);
    data[offset + 11] = instance.windStrength ?? standardWindStrength(instance.tier);
    data.set(livery.emblem, offset + 12);
    data[offset + 15] = instance.scale ?? 1;
  }
  return data;
}

function instanceLivery(instance: StandardInstance, fallback: StandardLivery): StandardLivery {
  return {
    id: fallback.id,
    field: instance.livery?.field ?? fallback.field,
    trim: instance.livery?.trim ?? fallback.trim,
    emblem: instance.livery?.emblem ?? fallback.emblem,
  };
}

function standardTierRecord<T>(build: (tier: StandardSizeTier) => T): Record<StandardSizeTier, T> {
  return Object.fromEntries(STANDARD_SIZE_TIER_IDS.map((tier) => [tier, build(tier)])) as Record<
    StandardSizeTier,
    T
  >;
}
