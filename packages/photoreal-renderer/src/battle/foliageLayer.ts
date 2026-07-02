// foliageLayer — grass + scenery on the photoreal substrate. Born as literal
// TSL ports of the production BattleGrassPass (legacy-tuft path) and
// CampaignSceneryPass shaders; since slice 09 they are standard-material
// responses with NEUTRAL albedos (baked lambert/grade/exposure extracted —
// the sun + IBL environment light them), still instancing the SAME CPU-built
// tuft mesh + scatter (buildBattleTerrainGrass) and the SAME shared prop
// meshes (SCENERY_PROP_MODELS) the bespoke passes upload.
import * as THREE from 'three/webgpu';
import {
  attribute, clamp, float, max, mix, normalize, sin, uniform, varying, vec3, vec4,
} from 'three/tsl';
import type { BattleTerrainGrassBuild } from '../../../game-renderer/src/battle/grassPass';
import { GRASS_INSTANCE_STRIDE_FLOATS } from '../../../game-renderer/src/battle/grassPass';
import type { CampaignSceneryInstance } from '../../../game-renderer/src/campaign/sceneryPass';
import { SCENERY_PROP_MODELS } from '../../../game-renderer/src/models/shared/sceneryPropRegistry';
import {
  battleEnvironmentStats,
  type BattleEnvironment,
} from '../../../game-renderer/src/environment/environment';
import {
  chartDepthDistNode, linearAlbedo, rgbNode, rotateYawN, smoothstepN, viewNormalNode,
  type BattleFrameUniforms,
} from './battleTsl';
import { RENDER_ORDER } from './terrainLayer';

// grassModels SLICE00_GRASS_ALBEDO — the constants GRASS_WGSL bakes in.
const GRASS_ALBEDO_ROOT: [number, number, number] = [0.42, 0.50, 0.24];
const GRASS_ALBEDO_SHADOW: [number, number, number] = [0.600, 0.627, 0.361];
const GRASS_ALBEDO_NEAR: [number, number, number] = [0.753, 0.757, 0.471];
// The tuft palette above was authored as LIT display colours under the baked
// bespoke pipeline; as a neutral albedo it reads a step too bright next to
// the ground it grows from — this factor extracts that bake (slice 09).
const GRASS_BAKED_LIGHT_EXTRACTION = 0.84;

/** The instanced tuft field. One material (all tuning via uniforms) whose
 *  geometry + instances are swapped whenever the production grass cache key
 *  rebuilds the scatter. */
export class PhotorealGrassField {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    windPhase: uniform(0),
    windStrength: uniform(0.075),
    baseHeight: uniform(0.72),
    baseWidth: uniform(0.055),
  };
  private tuftCount = 0;
  private bladesPerTuft = 0;
  private meshTriangles = 0;
  private readonly env: BattleEnvironment;

  constructor(scene: THREE.Scene, env: BattleEnvironment, frame: BattleFrameUniforms) {
    this.env = env;
    this.mesh = new THREE.Mesh(new THREE.InstancedBufferGeometry(), this.material(env, frame));
    this.mesh.name = 'battle-grass';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.worldOpaque;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private material(env: BattleEnvironment, frame: BattleFrameUniforms): THREE.MeshStandardNodeMaterial {
    const e = env.environment;
    const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    material.fog = false;
    const local = attribute<'vec3'>('position', 'vec3');
    const normal = attribute<'vec3'>('gNormal', 'vec3');
    const colorAndAlpha = attribute<'vec4'>('gColor', 'vec4');
    const instPose = attribute<'vec4'>('instPose', 'vec4');
    const instBlade = attribute<'vec4'>('instBlade', 'vec4');
    const instOrient = attribute<'vec4'>('instOrient', 'vec4');
    const instNormal = attribute<'vec4'>('instNormal', 'vec4');

    const terrainT = clamp(instPose.w, 0.0, 1.0).toVar();
    const bladeWidth = max(instBlade.x, 0.001);
    const bladeHeight = max(instBlade.y, 0.001).toVar();
    const yaw = instOrient.x;
    const phase = instBlade.w;
    const terrainN = normalize(vec3(instNormal.x, instNormal.y, max(instNormal.z, 0.0001))).toVar();
    const slopeAlive = clamp(instNormal.w, 0.0, 1.0).toVar();
    const shade = mix(instOrient.w.mul(0.22).add(0.86), instOrient.w.mul(0.12).add(0.94), terrainT);
    const heightT = clamp(local.z.div(max(this.uniforms.baseHeight, 0.001)), 0.0, 1.0).toVar();
    const wind = sin(this.uniforms.windPhase.add(phase).add(local.z.mul(4.7)).add(instPose.x.mul(0.045)).add(instPose.y.mul(0.036)));
    const sway = wind.mul(this.uniforms.windStrength).mul(heightT).mul(heightT).mul(bladeHeight).mul(slopeAlive).toVar();
    const widthScale = bladeWidth.div(max(this.uniforms.baseWidth, 0.001)).toVar();
    const lx = local.x.mul(widthScale).mul(slopeAlive);
    const ly = local.y.mul(widthScale).mul(slopeAlive);
    const { rx: rlx, ry: rly, cy, sy } = rotateYawN(lx, ly, yaw);
    const rlxV = rlx.toVar();
    const rlyV = rly.toVar();
    const slopeZ = terrainN.x.mul(rlxV).add(terrainN.y.mul(rlyV)).negate().div(max(terrainN.z, 0.18));
    const growthT = smoothstepN(0.08, 1.0, heightT);
    const growthDir = normalize(mix(terrainN, vec3(0.0, 0.0, 1.0), growthT.mul(0.86)));
    const world = vec3(
      instPose.x.add(rlxV).add(sway.mul(0.72)),
      instPose.y.add(rlyV).add(sway.mul(0.24)),
      instPose.z.add(slopeZ),
    ).add(growthDir.mul(local.z.mul(bladeHeight).div(max(this.uniforms.baseHeight, 0.001)).mul(slopeAlive))).toVar();
    material.positionNode = world;
    const rnormal = normalize(vec3(
      normal.x.mul(cy).sub(normal.y.mul(sy)),
      normal.x.mul(sy).add(normal.y.mul(cy)),
      normal.z,
    ));
    const tiltedNormal = normalize(mix(terrainN, rnormal, heightT.mul(0.48).add(0.38)));
    material.normalNode = viewNormalNode(tiltedNormal);
    const vColor = varying(colorAndAlpha.rgb.mul(shade)).toVar();
    const vAlpha = varying(colorAndAlpha.a);
    const vHeightT = varying(heightT).toVar();
    const vTerrainT = varying(terrainT).toVar();
    const vFog = varying(smoothstepN(620.0, 1650.0, chartDepthDistNode(world.xy, frame)).mul(0.64));

    // NEUTRAL blade albedo: per-blade shade/tip/stubble variation stays (it is
    // material character), the baked lambert/key-fill/exposure grade is gone —
    // the sun + IBL light the blades through tiltedNormal.
    const strawTip = rgbNode(GRASS_ALBEDO_NEAR);
    const tipDry = smoothstepN(0.62, 1.0, vHeightT).mul(0.055).mul(float(1.0).sub(vTerrainT.mul(0.82)));
    const base = mix(vColor, strawTip, tipDry);
    let terrainStubble = mix(rgbNode(GRASS_ALBEDO_ROOT), rgbNode(GRASS_ALBEDO_NEAR), smoothstepN(0.12, 1.0, vHeightT));
    terrainStubble = mix(terrainStubble, rgbNode(GRASS_ALBEDO_SHADOW), 0.18);
    let albedo = mix(base, terrainStubble, vTerrainT.mul(0.58));
    const neutralMeadow = vec3(0.58, 0.66, 0.48);
    albedo = mix(albedo, neutralMeadow, vTerrainT.mul(0.55).add(0.20));
    // Aerial stand-in (dies at 10b, the one aerial-perspective owner).
    albedo = albedo.mul(GRASS_BAKED_LIGHT_EXTRACTION);
    albedo = mix(albedo, rgbNode(e.hazeColor), vFog);
    material.colorNode = vec4(linearAlbedo(clamp(albedo, vec3(0.0), vec3(1.0))), vAlpha);
    return material;
  }

  /** Swap in a freshly scattered build (same cache-key policy as production). */
  apply(build: BattleTerrainGrassBuild): void {
    const old = this.mesh.geometry;
    const geo = new THREE.InstancedBufferGeometry();
    const vertices = build.mesh.opaque.vertices; // stride 10: pos3 normal3 rgba4
    const count = vertices.length / 10;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const o = i * 10;
      positions.set(vertices.subarray(o, o + 3), i * 3);
      normals.set(vertices.subarray(o + 3, o + 6), i * 3);
      colors.set(vertices.subarray(o + 6, o + 10), i * 4);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('gNormal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('gColor', new THREE.BufferAttribute(colors, 4));
    geo.setIndex(new THREE.BufferAttribute(build.mesh.opaque.indices, 1));

    const stride = GRASS_INSTANCE_STRIDE_FLOATS;
    const tufts = build.tuftCount;
    const pose = new Float32Array(tufts * 4);
    const bladeI = new Float32Array(tufts * 4);
    const orient = new Float32Array(tufts * 4);
    const normalI = new Float32Array(tufts * 4);
    for (let i = 0; i < tufts; i++) {
      const o = i * stride;
      pose.set(build.instances.subarray(o, o + 4), i * 4);
      bladeI.set(build.instances.subarray(o + 4, o + 8), i * 4);
      orient.set(build.instances.subarray(o + 8, o + 12), i * 4);
      normalI.set(build.instances.subarray(o + 12, o + 16), i * 4);
    }
    geo.setAttribute('instPose', new THREE.InstancedBufferAttribute(pose, 4));
    geo.setAttribute('instBlade', new THREE.InstancedBufferAttribute(bladeI, 4));
    geo.setAttribute('instOrient', new THREE.InstancedBufferAttribute(orient, 4));
    geo.setAttribute('instNormal', new THREE.InstancedBufferAttribute(normalI, 4));
    geo.instanceCount = tufts;

    this.mesh.geometry = geo;
    old.dispose();
    this.mesh.visible = tufts > 0;
    this.tuftCount = tufts;
    this.bladesPerTuft = build.bladesPerTuft;
    this.meshTriangles = build.mesh.opaque.indices.length / 3;
    this.uniforms.windStrength.value = build.windStrength;
    this.uniforms.baseHeight.value = build.baseHeight;
    this.uniforms.baseWidth.value = build.baseWidth;
  }

  setWindPhase(phase: number): void {
    this.uniforms.windPhase.value = phase;
  }

  stats() {
    return {
      tuftInstances: this.tuftCount,
      bladeInstances: this.tuftCount * this.bladesPerTuft,
      submittedTriangles: this.meshTriangles * this.tuftCount,
      // The identity assert: the grass material is dressed from the ONE
      // environment-preset owner, same as the terrain.
      environment: battleEnvironmentStats(this.env),
    };
  }
}

type SceneryKind = 'conifer' | 'broadleaf' | 'rock';
const SCENERY_KINDS: SceneryKind[] = ['conifer', 'broadleaf', 'rock'];

interface SceneryBucket {
  opaque: THREE.Mesh;
  shadow: THREE.Mesh;
  count: number;
}

/** The battle scenery (trees/rocks from featuresToBattleScenery), instanced on
 *  the shared prop meshes with the sceneryPass shading ported to TSL. */
export class PhotorealScenery {
  private buckets = new Map<SceneryKind, SceneryBucket>();
  private total = 0;

  constructor(scene: THREE.Scene) {
    for (const kind of SCENERY_KINDS) {
      const model = SCENERY_PROP_MODELS[kind].build();
      const opaque = new THREE.Mesh(sceneryGeometry(model.opaque.vertices, model.opaque.indices), sceneryMaterial('opaque'));
      opaque.name = `battle-scenery-${kind}`;
      opaque.renderOrder = RENDER_ORDER.worldOpaque;
      const shadow = new THREE.Mesh(sceneryGeometry(model.shadow.vertices, model.shadow.indices), sceneryMaterial('shadow'));
      shadow.name = `battle-scenery-${kind}-shadow`;
      shadow.renderOrder = RENDER_ORDER.sceneryShadows;
      for (const mesh of [opaque, shadow]) {
        mesh.frustumCulled = false;
        mesh.visible = false;
        scene.add(mesh);
      }
      this.buckets.set(kind, { opaque, shadow, count: 0 });
    }
  }

  upload(instances: CampaignSceneryInstance[]): void {
    this.total = 0;
    for (const kind of SCENERY_KINDS) {
      const list = instances.filter((inst) => (inst.kind === 'tree' ? 'conifer' : inst.kind) === kind);
      const bucket = this.buckets.get(kind)!;
      bucket.count = list.length;
      this.total += list.length;
      const pose = new Float32Array(list.length * 4);
      const style = new Float32Array(list.length * 4);
      for (let i = 0; i < list.length; i++) {
        const inst = list[i];
        pose[i * 4] = inst.x;
        pose[i * 4 + 1] = inst.y;
        pose[i * 4 + 2] = inst.size;
        pose[i * 4 + 3] = inst.z ?? 0;
        style[i * 4] = inst.shade ?? 0.5;
        style[i * 4 + 1] = inst.height ?? inst.size;
        style[i * 4 + 2] = inst.yaw ?? 0;
      }
      for (const mesh of [bucket.opaque, bucket.shadow]) {
        const geo = mesh.geometry as THREE.InstancedBufferGeometry;
        geo.setAttribute('instPose', new THREE.InstancedBufferAttribute(pose, 4));
        geo.setAttribute('instStyle', new THREE.InstancedBufferAttribute(style, 4));
        geo.instanceCount = list.length;
        mesh.visible = list.length > 0;
      }
    }
  }

  stats() {
    return { scenery: this.total };
  }
}

function sceneryGeometry(vertices: Float32Array, indices: Uint16Array): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  const count = vertices.length / 10;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * 10;
    positions.set(vertices.subarray(o, o + 3), i * 3);
    normals.set(vertices.subarray(o + 3, o + 6), i * 3);
    colors.set(vertices.subarray(o + 6, o + 10), i * 4);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('sNormal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('sColor', new THREE.BufferAttribute(colors, 4));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.instanceCount = 0;
  return geo;
}

// sceneryPass SCENERY_WGSL pose port; since slice 09 the opaque props are a
// standard-material response — the pass-private fixed sun and warm-key/
// cool-fill grade are DELETED (no parallel lighting constants), the scene sun
// + IBL light the rotated normals. Per-instance shade variation stays as
// albedo character. The shadow bucket stays an unlit decal (dies at 11, CSM).
function sceneryMaterial(kind: 'opaque' | 'shadow'): THREE.MeshBasicNodeMaterial | THREE.MeshStandardNodeMaterial {
  const material = kind === 'shadow'
    ? new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
    : new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  if (kind === 'shadow') {
    material.transparent = true;
    material.depthWrite = false;
    material.fog = false;
  }
  const local = attribute<'vec3'>('position', 'vec3');
  const normal = attribute<'vec3'>('sNormal', 'vec3');
  const colorAndAlpha = attribute<'vec4'>('sColor', 'vec4');
  const instPose = attribute<'vec4'>('instPose', 'vec4');
  const instStyle = attribute<'vec4'>('instStyle', 'vec4');
  const scale = instPose.z;
  const baseZ = instPose.w;
  const heightScale = instStyle.y;
  const yaw = instStyle.z;
  const { rx, ry, cy, sy } = rotateYawN(local.x, local.y, yaw);
  material.positionNode = vec3(instPose.x.add(rx.mul(scale)), instPose.y.add(ry.mul(scale)), baseZ.add(local.z.mul(heightScale)));
  const rnormal = vec3(normal.x.mul(cy).sub(normal.y.mul(sy)), normal.x.mul(sy).add(normal.y.mul(cy)), normal.z);
  if (kind === 'opaque') material.normalNode = viewNormalNode(normalize(rnormal));
  const vColor = varying(colorAndAlpha.rgb);
  const vAlpha = varying(colorAndAlpha.a);
  const shade = varying(clamp(instStyle.x, 0.0, 1.0));

  const variation = shade.mul(0.18).add(0.88);
  const albedo = clamp(vColor.mul(variation), vec3(0.0), vec3(1.0));
  // The shadow decal stays display-referred (unlit stand-in, dies at 11).
  material.colorNode = vec4(kind === 'opaque' ? linearAlbedo(albedo) : albedo, vAlpha);
  return material;
}
