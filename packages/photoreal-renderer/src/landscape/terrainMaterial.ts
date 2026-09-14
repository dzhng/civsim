import { RENDER_ORDER } from "../renderOrder";
import * as THREE from "three/webgpu";
import {
  abs,
  attribute,
  clamp,
  float,
  floor,
  fract,
  max,
  mix,
  normalize,
  transformNormalToView,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { LandscapeMesh } from "../../../game-renderer/src/terrain/surface";
import {
  CAMPAIGN_TERRAIN_PROFILE,
  TERRAIN_MATERIAL,
  type TerrainProfile,
} from "../../../game-renderer/src/terrain/materialProfile";
import { fieldWaterSurfaceNodes } from "../battle/seaLayer";
import {
  fbmN,
  hashN,
  linearAlbedo,
  rgbNode,
  saturateN,
  smoothstepN,
  type LandscapeFrameUniforms,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
} from "./shaderNodes";

export function createTerrainGeometry(mesh: LandscapeMesh) {
  const geo = new THREE.BufferGeometry();
  const buffer = new THREE.InterleavedBuffer(mesh.vertices, 10);
  geo.setAttribute("position", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute("gNormal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  // 'normal' alias (same interleaved view): shadow.normalBias reads
  // normalWorld by attribute name — absent, the offset is silently zero.
  geo.setAttribute("normal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  geo.setAttribute("gWater", new THREE.InterleavedBufferAttribute(buffer, 1, 9));
  geo.setAttribute("gTint", new THREE.BufferAttribute(mesh.tint, 1));
  geo.setAttribute("gSurfaceColor", new THREE.BufferAttribute(mesh.surfaceColor, 3));
  geo.setIndex(new THREE.BufferAttribute(frontSideIndexBuffer(mesh.indices), 1));
  return geo;
}

export function terrainSignals(detailScale?: number) {
  const position = attribute<"vec3">("position", "vec3");
  const gNormal = attribute<"vec3">("gNormal", "vec3");
  // Interpolate before normalization so a fine tile can reproduce its coarse
  // parent's edge normals without a lighting seam at intermediate vertices.
  const worldNormal = normalize(varying(gNormal)).toVar();
  const surfaceColor = varying(attribute<"vec3">("gSurfaceColor", "vec3")).toVar();
  const water = varying(attribute<"float">("gWater", "float")).toVar();
  const surfaceWorld = varying(position.xy).toVar();
  const world = detailScale ? surfaceWorld.mul(detailScale).toVar() : surfaceWorld;
  const rawWaterBlend = saturateN(water).toVar();
  const waterBlend = smoothstepN(0.08, 0.55, rawWaterBlend).toVar();

  return { position, worldNormal, surfaceColor, surfaceWorld, world, rawWaterBlend, waterBlend };
}

/** Common macro modulation; blade turf and its distance canopy stay battle-owned. */
export function groundDetailNode(
  world: Vec2Node,
  color: Vec3Node,
  options: { coverage?: FloatNode } = {},
) {
  const c = TERRAIN_MATERIAL.ground;
  const drift = fbmN(world.mul(c.driftScale)).sub(0.5).mul(c.driftStrength);
  const mottle = fbmN(world.mul(c.mottleScale)).sub(0.5).mul(c.mottleStrength);
  const detail = clamp(drift.add(mottle).add(float(1)), c.minimum, c.maximum);
  return mix(color, color.mul(detail), options.coverage ?? float(1));
}

/** Material slopes consume geometric normals; they never change physical slope. */
export function terrainSlopeMasks(
  normalZ: FloatNode,
  waterBlend: FloatNode,
  rockCover: FloatNode,
  screeCover: FloatNode,
  bands: TerrainProfile["slopeBands"],
) {
  const normalZForSlope = (slope: number) => 1 / Math.sqrt(1 + slope * slope);
  const slowNz = normalZForSlope(bands.slowMin),
    rollingNz = normalZForSlope(bands.rollingMax),
    cliffNz = normalZForSlope(bands.cliffMin);
  const slopeRock = float(1)
    .sub(smoothstepN(cliffNz, slowNz, normalZ))
    .toVar();
  const slowSlope = float(1)
    .sub(smoothstepN(slowNz, rollingNz, normalZ))
    .toVar();
  const dryOnly = float(1).sub(waterBlend);
  const rockMask = clamp(rockCover.add(slopeRock), 0, 1).mul(dryOnly).toVar();
  const screeMask = clamp(
    screeCover.mul(0.95).add(slowSlope.mul(float(1).sub(rockCover)).mul(0.42)),
    0,
    1,
  )
    .mul(dryOnly)
    .toVar();
  return { slowNz, rollingNz, slopeRock, rockMask, screeMask, sourceScree: screeCover };
}

export function terrainRockResponse(
  surface: ReturnType<typeof terrainSignals>,
  inputAlbedo: Vec3Node,
  masks: ReturnType<typeof terrainSlopeMasks>,
  detailScale = 1,
) {
  const { world, position, worldNormal } = surface;
  const normalZ = clamp(worldNormal.z, 0, 1);
  const { slowNz, rollingNz, slopeRock, rockMask, screeMask, sourceScree } = masks;
  let albedo = inputAlbedo;
  let dryRoughness: FloatNode = float(0.95);
  const warp = fbmN(world.mul(0.035))
    .mul(2.2)
    .add(fbmN(world.mul(0.12).add(vec2(4.0, 9.0))).mul(0.7))
    .toVar();
  // Vertical fracture streaks dominate rock faces; strata stay faint so the
  // material does not read as evenly spaced elevation bands.
  const fracture = smoothstepN(
    0.55,
    0.95,
    fbmN(world.mul(vec2(0.32, 0.32)).add(warp.mul(0.35))),
  ).toVar();
  const strataPhase = fract(position.z.mul(0.16 * detailScale).add(warp.mul(1.7))).toVar();
  const strata = smoothstepN(0.7, 0.98, abs(strataPhase.mul(2.0).sub(1.0)))
    .mul(smoothstepN(0.35, 0.75, fbmN(world.mul(0.021).add(vec2(11.0, 3.0)))))
    .toVar();
  const faceNoise = fbmN(world.mul(0.075).add(vec2(2.0, 6.0))).toVar();
  let rock = mix(
    rgbNode(TERRAIN_MATERIAL.rock.faceLow),
    rgbNode(TERRAIN_MATERIAL.rock.faceHigh),
    faceNoise,
  );
  rock = mix(rock, rgbNode(TERRAIN_MATERIAL.rock.fracture), fracture.mul(slopeRock).mul(0.62));
  rock = mix(rock, rgbNode(TERRAIN_MATERIAL.rock.strata), strata.mul(slopeRock).mul(0.34));

  const pebble = smoothstepN(0.78, 0.97, hashN(floor(world.mul(0.85)))).toVar();
  let scree = mix(
    rgbNode(TERRAIN_MATERIAL.rock.screeLow),
    rgbNode(TERRAIN_MATERIAL.rock.screeHigh),
    fbmN(world.mul(0.22).add(vec2(8.0, 3.0))),
  );
  scree = mix(scree, rgbNode(TERRAIN_MATERIAL.rock.screePebble), pebble.mul(0.28));

  const benchCreep = clamp(rockMask.add(sourceScree.mul(0.45)), 0.0, 1.0)
    .mul(smoothstepN(slowNz, rollingNz, normalZ))
    .mul(smoothstepN(0.42, 0.84, fbmN(world.mul(0.18).add(vec2(6.0, 1.0)))))
    .mul(0.44)
    .toVar();

  albedo = mix(albedo, scree, screeMask.mul(0.78));
  albedo = mix(albedo, rock, rockMask);
  albedo = mix(albedo, rgbNode(TERRAIN_MATERIAL.rock.bench), benchCreep);
  dryRoughness = mix(
    dryRoughness,
    float(0.985),
    clamp(rockMask.add(screeMask).mul(0.62), 0.0, 1.0),
  );
  return { albedo, dryRoughness };
}

/** Dry albedo is display-authored. Water comes from its producer already linear. */
export function applyTerrainSurface(
  material: THREE.MeshStandardNodeMaterial,
  frame: LandscapeFrameUniforms,
  surface: ReturnType<typeof terrainSignals>,
  albedo: Vec3Node,
  dryRoughness: FloatNode,
  dryRoughnessFloor: FloatNode = float(0),
) {
  const { surfaceWorld, rawWaterBlend, waterBlend, worldNormal } = surface;
  material.normalNode = transformNormalToView(worldNormal);
  // Field water: the shared water surface blended by the box-filtered weight
  // (albedo + roughness — wet ground gets a real sun sheen).
  const fieldWater = fieldWaterSurfaceNodes(frame, surfaceWorld, rawWaterBlend);
  // Water is already linear; convert only the display-authored dry surface.
  material.colorNode = vec4(
    mix(linearAlbedo(clamp(albedo, vec3(0.0), vec3(1.0))), fieldWater.albedo, waterBlend),
    1.0,
  );
  material.roughnessNode = mix(
    max(dryRoughness, dryRoughnessFloor),
    fieldWater.roughness,
    waterBlend,
  );
}

/** Campaign consumes neutral source coverage, never battle physical tint IDs. */
export function createLandscapeGroundMesh(
  frame: LandscapeFrameUniforms,
  mesh: LandscapeMesh,
  profile: TerrainProfile = CAMPAIGN_TERRAIN_PROFILE,
) {
  const surface = terrainSignals(profile.detailScale);
  const masks = terrainSlopeMasks(
    clamp(surface.worldNormal.z, 0, 1),
    surface.waterBlend,
    float(0),
    float(0),
    profile.slopeBands,
  );
  const base = groundDetailNode(surface.world, surface.surfaceColor, {
    coverage: float(1).sub(max(masks.rockMask, masks.screeMask)),
  });
  const response = terrainRockResponse(surface, base, masks, profile.detailScale);
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  applyTerrainSurface(material, frame, surface, response.albedo, response.dryRoughness);
  const ground = new THREE.Mesh(createTerrainGeometry(mesh), material);
  ground.name = "landscape-ground";
  ground.frustumCulled = false;
  ground.renderOrder = RENDER_ORDER.worldOpaque;
  ground.receiveShadow = true;
  return ground;
}

function frontSideIndexBuffer(indices: Uint32Array): Uint32Array {
  const out = new Uint32Array(indices.length);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    out[i] = indices[i];
    out[i + 1] = indices[i + 2];
    out[i + 2] = indices[i + 1];
  }
  return out;
}
