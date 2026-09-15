import { TERRAIN_WATER_BLEND } from "../../../game-renderer/src/water/waterShoreRamp";
import { RENDER_ORDER } from "../renderOrder";
import * as THREE from "three/webgpu";
import {
  abs,
  attribute,
  clamp,
  cross,
  dFdx,
  dFdy,
  dot,
  float,
  fwidth,
  length,
  max,
  mix,
  normalize,
  positionView,
  positionWorld,
  sign,
  texture,
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
import { campaignWaterSurfaceNodes, fieldWaterSurfaceNodes } from "./waterMaterial";
import {
  fbmN,
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
  if (mesh.shoreDistance)
    geo.setAttribute("gShore", new THREE.BufferAttribute(mesh.shoreDistance, 1));
  if (mesh.tint) geo.setAttribute("gTint", new THREE.BufferAttribute(mesh.tint, 1));
  geo.setAttribute(
    "gSurfaceColor",
    mesh.surfaceColor
      ? new THREE.BufferAttribute(mesh.surfaceColor, 3)
      : new THREE.InterleavedBufferAttribute(buffer, 3, 6),
  );
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
  const waterBlend = smoothstepN(
    TERRAIN_WATER_BLEND[0],
    TERRAIN_WATER_BLEND[1],
    rawWaterBlend,
  ).toVar();

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
  // The pinned Three triplanar helper normalizes absolute axis weights. Apply
  // that same basis to procedural fields so vertical faces retain their scale.
  const p = varying(position).mul(detailScale).toVar();
  const faceNoise = mix(
    float(0.5),
    triplanarNoise(p, worldNormal, [0.16, 0.16]),
    detailVisibility(p, 0.16),
  ).toVar();
  const fractureField = triplanarNoise(p, worldNormal, [0.09, 0.12]);
  const fracture = smoothstepN(0.44, 0.72, fractureField).mul(detailVisibility(p, 0.12)).toVar();
  let rock = mix(
    rgbNode(TERRAIN_MATERIAL.rock.faceLow),
    rgbNode(TERRAIN_MATERIAL.rock.faceHigh),
    faceNoise,
  );
  rock = mix(rock, rgbNode(TERRAIN_MATERIAL.rock.fracture), fracture.mul(slopeRock).mul(0.32));
  // Derivatives perturb shading only, in the library's view-space basis. No
  // height displacement or world-height contour function enters this response.
  const normal = normalize(
    mix(
      transformNormalToView(worldNormal),
      terrainNormal(faceNoise, worldNormal),
      rockMask.mul(0.5),
    ),
  );

  const pebble = smoothstepN(0.6, 0.78, fbmN(world.mul(0.5)))
    .mul(detailVisibility(vec3(world, 0), 0.5))
    .toVar();
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
  albedo = mix(albedo, mix(rgbNode(TERRAIN_MATERIAL.rock.bench), inputAlbedo, 0.65), benchCreep);
  dryRoughness = mix(
    dryRoughness,
    float(0.985),
    clamp(rockMask.add(screeMask).mul(0.62), 0.0, 1.0),
  );
  dryRoughness = mix(dryRoughness, faceNoise.mul(0.03).add(0.955), rockMask);
  return { albedo, dryRoughness, normal };
}

/** Dry albedo is display-authored. Water comes from its producer already linear. */
export function applyTerrainSurface(
  material: THREE.MeshStandardNodeMaterial,
  frame: LandscapeFrameUniforms,
  surface: ReturnType<typeof terrainSignals>,
  albedo: Vec3Node,
  dryRoughness: FloatNode,
  dryRoughnessFloor: FloatNode = float(0),
  normal?: Vec3Node,
  campaignShore?: FloatNode,
) {
  const { surfaceWorld, rawWaterBlend, waterBlend, worldNormal } = surface;
  const dryNormal = normal ?? transformNormalToView(worldNormal);
  material.normalNode = dryNormal;
  // Campaign shore data and battle filtered water weights are distinct inputs.
  const waterSurface = campaignShore
    ? campaignWaterSurfaceNodes(frame, surfaceWorld, campaignShore)
    : fieldWaterSurfaceNodes(frame, surfaceWorld, rawWaterBlend);
  if (waterSurface.normal) material.normalNode = mix(dryNormal, waterSurface.normal, waterBlend);
  // Water is already linear; convert only the display-authored dry surface.
  material.colorNode = vec4(
    mix(linearAlbedo(clamp(albedo, vec3(0.0), vec3(1.0))), waterSurface.albedo, waterBlend),
    1.0,
  );
  material.roughnessNode = mix(
    max(dryRoughness, dryRoughnessFloor),
    waterSurface.roughness,
    waterBlend,
  );
}

/** Shared world lookup avoids coverage seams between coarse and fine terrain.
 * The source grades a mountain altitude band; only its high interior adds
 * slope-independent rock, leaving lower shelves to the slope response. */
export function createSourceCoverSampler(raster: {
  data: Uint8Array;
  width: number;
  height: number;
  rect: { min: [number, number]; max: [number, number] };
}) {
  const map = new THREE.DataTexture(raster.data, raster.width, raster.height, THREE.RedFormat);
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const { min, max } = raster.rect;
  const uv = positionWorld.xy.sub(vec2(min[0], min[1])).div(vec2(max[0] - min[0], max[1] - min[1]));
  // Source rows start north. Filter the band before classifying exposure.
  const band = texture(map).sample(vec2(uv.x, float(1).sub(uv.y))).r;
  return { map, cover: smoothstepN(0.74, 1, band).toVar() };
}

/** Campaign consumes neutral source coverage, never battle physical tint IDs. */
export function createLandscapeGroundMaterial(
  frame: LandscapeFrameUniforms,
  profile: TerrainProfile = CAMPAIGN_TERRAIN_PROFILE,
  options: { sourceShore?: boolean; rockCover?: FloatNode } = {},
) {
  const surface = terrainSignals(profile.detailScale);
  const masks = terrainSlopeMasks(
    clamp(surface.worldNormal.z, 0, 1),
    surface.waterBlend,
    // Absent source cover leaves the slope-only response unchanged. Loose stone
    // has no source channel; scree still comes from slope inside these masks.
    options.rockCover ?? float(0),
    float(0),
    profile.slopeBands,
  );
  const base = groundDetailNode(surface.world, surface.surfaceColor, {
    coverage: float(1).sub(max(masks.rockMask, masks.screeMask)),
  });
  const response = terrainRockResponse(surface, base, masks, profile.detailScale);
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  applyTerrainSurface(
    material,
    frame,
    surface,
    response.albedo,
    response.dryRoughness,
    float(0),
    response.normal,
    options.sourceShore ? varying(attribute<"float">("gShore", "float")) : undefined,
  );
  return material;
}

export function createLandscapeGroundMesh(mesh: LandscapeMesh, material: THREE.Material) {
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

function triplanarNoise(
  position: Vec3Node,
  normal: Vec3Node,
  frequency: readonly [number, number],
) {
  const weights = abs(normal).div(abs(normal).x.add(abs(normal).y).add(abs(normal).z));
  const scale = vec2(...frequency);
  // Both steep projections keep their second coordinate vertical; fractures
  // therefore follow faces without switching direction at an axis blend.
  return fbmN(position.yz.mul(scale))
    .mul(weights.x)
    .add(fbmN(position.xz.mul(scale)).mul(weights.y))
    .add(fbmN(position.xy.mul(scale)).mul(weights.z));
}

function detailVisibility(position: Vec3Node, frequency: number) {
  // Subpixel modulation converges to its mean instead of aliasing into dots.
  return float(1).sub(smoothstepN(0.3, 1.0, length(fwidth(position)).mul(frequency)));
}

// Mikkelsen surface-gradient basis, as used by Three's BumpMapNode. Procedural
// height needs explicit screen derivatives; that node offsets texture UVs only.
function terrainNormal(height: FloatNode, worldNormal: Vec3Node) {
  const n = transformNormalToView(worldNormal);
  const dx = dFdx(positionView),
    dy = dFdy(positionView);
  const r1 = cross(dy, n),
    r2 = cross(n, dx);
  const det = dot(dx, r1);
  const gradient = r1
    .mul(dFdx(height))
    .add(r2.mul(dFdy(height)))
    .mul(sign(det));
  return normalize(n.mul(abs(det)).sub(gradient.mul(0.5)));
}
