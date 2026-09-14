import { RENDER_ORDER } from "../renderOrder";
import {
  createTerrainGeometry,
  terrainSignals,
  terrainSlopeMasks,
  terrainRockResponse,
  applyTerrainSurface,
  groundDetailNode,
} from "../landscape/terrainMaterial";
// terrainLayer — the battle ground on the photoreal substrate. Background
// quads, the height-displaced ground mesh, and sealed-edge horizon blockers use
// standard-material responses with NEUTRAL albedos; the sun + IBL environment
// light them. The CPU geometry comes
// from the same builders the bespoke passes upload (buildBattleGroundMesh /
// buildBattleHorizonLayout). Distance haze comes ONLY from the shared
// aerial-perspective hook (scene.fogNode) — no material here adds
// its own haze, ever.
import * as THREE from "three/webgpu";
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  float,
  floor,
  length,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  step,
  texture,
  transformNormalToView,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { LandscapeMesh } from "../../../game-renderer/src/terrain/surface";
import type { PhotorealEarthDistanceField } from "../../../game-renderer/src/battle/photorealEarthDistance";
import { GROUND_COVER_COLOR, MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import type { BattleHorizonLayout } from "../../../game-renderer/src/battle/horizonPass";
import { northSouthSink, type BattleVistaBand } from "./vistaSurface";
import { joinTerrainMeshEdges } from "./terrainSeam";
import {
  fbmN,
  hashN,
  linearAlbedo,
  ridgeN,
  rgbNode,
  smoothstepN,
  viewNormalNode,
  vnoiseN,
  type LandscapeFrameUniforms,
  type FloatNode,
  type Rgb,
  type Vec2Node,
} from "../landscape/shaderNodes";
import {
  coverEdgeNode,
  coverEdgeNoiseNode,
  mudInteriorCoverageNode,
  roadInteriorCoverageNode,
  turfEdgeCoverageNode,
  turfCanopyFromSignalsNode,
  turfCanopyNode,
  TURF_CONTRAST,
} from "./groundDetail";
import type {
  BattleGroundCover,
  BattleSlopeBands,
} from "../../../game-renderer/src/battle/terrainFeatures";
import type { BladeFieldTransitionUniforms } from "./bladeFieldLayer";

// frameShell TerrainShaderStyle — numeric mirror of the WGSL literals.
interface TerrainQuadStyle {
  oliveLow: Rgb;
  oliveHigh: Rgb;
  dry: Rgb;
  lightFleckLow: number;
  lightFleckHigh: number;
  darkFleckLow: number;
  darkFleckHigh: number;
  stoneFleckLow: number;
  stoneFleckHigh: number;
  stubbleColor: Rgb;
  darkFleckColor: Rgb;
}

const DEFAULT_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: MEADOW.quad.default.oliveLow,
  oliveHigh: MEADOW.quad.default.oliveHigh,
  dry: MEADOW.quad.default.dry,
  lightFleckLow: 0.884,
  lightFleckHigh: 0.99,
  darkFleckLow: 0.82,
  darkFleckHigh: 0.982,
  stoneFleckLow: 0.924,
  stoneFleckHigh: 0.996,
  stubbleColor: MEADOW.quad.default.stubble,
  darkFleckColor: MEADOW.quad.default.darkFleck,
};

const WIDE_DETAIL_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: MEADOW.quad.wideDetail.oliveLow,
  oliveHigh: MEADOW.quad.wideDetail.oliveHigh,
  dry: MEADOW.quad.wideDetail.dry,
  lightFleckLow: 0.876,
  lightFleckHigh: 0.988,
  darkFleckLow: 0.8,
  darkFleckHigh: 0.976,
  stoneFleckLow: 0.916,
  stoneFleckHigh: 0.995,
  stubbleColor: MEADOW.quad.wideDetail.stubble,
  darkFleckColor: MEADOW.quad.wideDetail.darkFleck,
};

interface TerrainMaterialOptions {
  /** Material-detail frequency in native world units; geometry and masks stay unscaled. */
  detailScale?: number;
  slopeBands?: BattleSlopeBands | null;
  vistaBand?: BattleVistaBand["name"] | null;
  farGrass?: BladeFieldTransitionUniforms | null;
  earthDistance?: PhotorealEarthDistanceField;
}

function quadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 1, 3, 2]);
  return geo;
}

function setQuadRect(
  geo: THREE.BufferGeometry,
  [x, y, w, h]: [number, number, number, number],
): void {
  const attr = geo.getAttribute("position") as THREE.BufferAttribute;
  const a = attr.array as Float32Array;
  a.set([x, y, 0, x + w, y, 0, x, y + h, 0, x + w, y + h, 0]);
  attr.needsUpdate = true;
}

// frameShell terrainWgsl groundHeight(p) — relief for the builtin quad shading.
function quadGroundHeight(p: Vec2Node): FloatNode {
  const broad = vnoiseN(p.mul(0.018).add(vec2(8.1, 2.4))).mul(0.58);
  const folds = ridgeN(
    vec2(p.x.mul(0.052).add(p.y.mul(0.018)), p.y.mul(0.038).sub(p.x.mul(0.012))),
  ).mul(0.26);
  const scratch = ridgeN(vec2(p.x.mul(0.42).add(p.y.mul(0.09)), p.y.mul(0.26))).mul(0.16);
  return broad.add(folds).add(scratch);
}

function terrainQuadMaterial(
  style: TerrainQuadStyle,
  contrast: typeof TURF_CONTRAST.quad.default | typeof TURF_CONTRAST.quad.wideDetail,
  frame: LandscapeFrameUniforms,
): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.FrontSide,
    roughness: 0.96,
    metalness: 0,
  });
  material.depthTest = false;
  material.depthWrite = false;
  const world = varying(attribute<"vec3">("position", "vec3").xy).toVar();
  const dist = varying(length(attribute<"vec3">("position", "vec3").xy.sub(vec2(frame.focus))));
  const fine = vnoiseN(world.mul(2.2)).toVar();
  const mid = vnoiseN(world.mul(0.47).add(vec2(5.2, 1.8))).toVar();
  const broad = vnoiseN(world.mul(0.085).add(vec2(0.7, 9.3))).toVar();
  const relief = quadGroundHeight(world).toVar();
  const hx = quadGroundHeight(world.add(vec2(1.8, 0.0))).sub(relief);
  const hy = quadGroundHeight(world.add(vec2(0.0, 1.8))).sub(relief);
  // The quad is 4 vertices: the relief normal must be per-fragment (a vertex
  // varying would interpolate flat) — the sun shades it directly.
  material.normalNode = transformNormalToView(normalize(vec3(hx.mul(-1.45), hy.mul(-1.45), 1.0)));
  const grazing = smoothstepN(
    0.16,
    0.86,
    ridgeN(vec2(world.x.mul(0.12).add(world.y.mul(0.03)), world.y.mul(0.09))),
  ).toVar();
  const oliveNoise = mix(
    rgbNode(style.oliveLow),
    rgbNode(style.oliveHigh),
    mid.mul(0.66).add(fine.mul(0.16)).add(relief.mul(0.18)),
  );
  const oliveAnchor = mix(rgbNode(style.oliveLow), rgbNode(style.oliveHigh), 0.5);
  const olive = mix(oliveAnchor, oliveNoise, contrast.oliveSpread);
  const scrubPatch = smoothstepN(0.5, 0.86, broad).mul(
    float(1.0).sub(smoothstepN(0.86, 0.98, fine)),
  );
  const trample = smoothstepN(0.72, 0.98, vnoiseN(world.add(vec2(13.0, -7.0)).mul(0.18)));
  const rakedDust = smoothstepN(0.58, 0.92, grazing).mul(relief.mul(0.08).add(0.08));
  const seed = world.mul(6.8).floor().toVar();
  const fleck = hashN(seed);
  const blade = hashN(seed.add(vec2(19.0, 41.0)));
  const pebble = hashN(seed.add(vec2(73.0, 11.0)));
  const stubble = smoothstepN(
    0.66,
    0.95,
    ridgeN(vec2(world.x.mul(1.26).add(world.y.mul(0.18)), world.y.mul(0.84))),
  );
  const lightFleck = smoothstepN(style.lightFleckLow, style.lightFleckHigh, fleck).mul(
    fine.mul(0.54).add(0.46),
  );
  const darkFleck = smoothstepN(style.darkFleckLow, style.darkFleckHigh, blade).mul(
    float(1.0).sub(smoothstepN(0.76, 0.98, broad)),
  );
  const stoneFleck = smoothstepN(style.stoneFleckLow, style.stoneFleckHigh, pebble).mul(
    relief.mul(0.46).add(0.36),
  );
  const speckle = lightFleck.mul(contrast.speckleStrength);
  let grass = mix(
    olive,
    rgbNode(style.dry),
    trample.mul(contrast.trampleMix).add(contrast.dryMixBase),
  );
  grass = mix(grass, rgbNode(MEADOW.quad.scrub), scrubPatch.mul(TURF_CONTRAST.quad.scrubStrength));
  grass = mix(grass, rgbNode(MEADOW.quad.rakedDust), rakedDust);
  grass = grass.add(rgbNode(MEADOW.quad.lightFleck).mul(speckle));
  grass = mix(grass, rgbNode(style.stubbleColor), stubble.mul(contrast.stubbleStrength));
  grass = mix(
    grass,
    grass.mul(rgbNode(style.darkFleckColor)),
    darkFleck.mul(contrast.darkFleckStrength),
  );
  grass = mix(grass, rgbNode(MEADOW.quad.stoneFleck), stoneFleck.mul(contrast.stoneFleckStrength));
  grass = mix(grass, turfCanopyFromSignalsNode(broad, mid, fine), TURF_CONTRAST.canopy.mixStrength);
  const dust = smoothstepN(18.0, 96.0, dist).mul(contrast.dustStrength);
  const sunBleached = mix(grass, rgbNode(MEADOW.quad.sunBleached), dust);
  material.colorNode = vec4(linearAlbedo(sunBleached), 1.0);
  return material;
}

function backdropMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.FrontSide,
    roughness: 0.98,
    metalness: 0,
  });
  material.depthTest = false;
  material.depthWrite = false;
  material.normalNode = viewNormalNode(vec3(0.0, 0.0, 1.0));
  const world = varying(attribute<"vec3">("position", "vec3").xy).toVar();
  const broad = vnoiseN(world.mul(0.055).add(vec2(4.7, 8.1)));
  const mid = vnoiseN(world.mul(0.42).add(vec2(11.3, 1.9)));
  const speck = smoothstepN(0.78, 0.98, vnoiseN(world.mul(2.8)));
  let grass = mix(rgbNode(MEADOW.quad.backdrop.low), rgbNode(MEADOW.quad.backdrop.high), broad);
  grass = mix(grass, rgbNode(MEADOW.quad.backdrop.shadow), smoothstepN(0.62, 0.94, mid).mul(0.38));
  grass = grass.add(rgbNode(MEADOW.quad.backdrop.fleck).mul(speck));
  material.colorNode = vec4(linearAlbedo(grass), 1.0);
  return material;
}

/** The background band: backdrop quad + terrain quad (two detail styles,
 *  toggled by the battle world's zoom policy). Deliberately
 *  OUTSIDE the shadow set (neither casts nor receives): they are
 *  depthTest-off underlays beyond the heightfield, always shaded fullscreen
 *  under the real ground — receiving would pay per-pixel cascade sampling
 *  twice for pixels the aerial haze owns anyway. */
export class BattleBackgroundQuads {
  readonly backdrop: THREE.Mesh;
  readonly terrainDefault: THREE.Mesh;
  readonly terrainWide: THREE.Mesh;

  constructor(scene: THREE.Scene, frame: LandscapeFrameUniforms) {
    this.backdrop = new THREE.Mesh(quadGeometry(), backdropMaterial());
    this.backdrop.name = "battle-backdrop";
    this.backdrop.renderOrder = RENDER_ORDER.backdrop;
    this.terrainDefault = new THREE.Mesh(
      quadGeometry(),
      terrainQuadMaterial(DEFAULT_TERRAIN_STYLE, TURF_CONTRAST.quad.default, frame),
    );
    this.terrainDefault.name = "battle-terrain-quad";
    this.terrainDefault.renderOrder = RENDER_ORDER.terrain;
    this.terrainWide = new THREE.Mesh(
      quadGeometry(),
      terrainQuadMaterial(WIDE_DETAIL_TERRAIN_STYLE, TURF_CONTRAST.quad.wideDetail, frame),
    );
    this.terrainWide.name = "battle-terrain-quad-wide";
    this.terrainWide.renderOrder = RENDER_ORDER.terrain;
    this.terrainWide.visible = false;
    for (const mesh of [this.backdrop, this.terrainDefault, this.terrainWide]) {
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  setRects(
    terrainRect: [number, number, number, number],
    backdropRect: [number, number, number, number],
  ): void {
    setQuadRect(this.backdrop.geometry, backdropRect);
    setQuadRect(this.terrainDefault.geometry, terrainRect);
    setQuadRect(this.terrainWide.geometry, terrainRect);
  }

  setStyle(style: "default" | "wide-detail"): void {
    this.terrainDefault.visible = style === "default";
    this.terrainWide.visible = style === "wide-detail";
  }

  dispose(): void {
    for (const mesh of [this.backdrop, this.terrainDefault, this.terrainWide]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

/** The rolling battle ground mesh shared by playable and vista terrain. */
export function createGroundMesh(
  frame: LandscapeFrameUniforms,
  mesh: LandscapeMesh,
  options: TerrainMaterialOptions = {},
): THREE.Mesh {
  const geo = createTerrainGeometry(mesh);
  const earthDistance = options.earthDistance;
  const earthEdgesEnabled = earthDistance !== undefined;
  let earthDistanceTexture: THREE.DataTexture | null = null;

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  const surface = terrainSignals(options.detailScale);
  const { worldNormal, surfaceColor, surfaceWorld, world, waterBlend } = surface;
  const tint = varying(attribute<"float">("gTint", "float")).toVar();
  // Turf exclusions are computed before the far canopy so that the same masks
  // also protect mud, rock, and scree from the distance replacement.
  let unionDistance: FloatNode = float(-(earthDistance?.rangeMeters ?? 1));
  let roadDistance: FloatNode = float(-(earthDistance?.rangeMeters ?? 1));
  if (earthDistance) {
    const sdf = earthDistance;
    earthDistanceTexture = new THREE.DataTexture(
      sdf.data,
      sdf.width,
      sdf.height,
      THREE.RGFormat,
      THREE.UnsignedByteType,
    );
    earthDistanceTexture.magFilter = THREE.LinearFilter;
    earthDistanceTexture.minFilter = THREE.LinearFilter;
    earthDistanceTexture.wrapS = THREE.ClampToEdgeWrapping;
    earthDistanceTexture.wrapT = THREE.ClampToEdgeWrapping;
    earthDistanceTexture.generateMipmaps = false;
    earthDistanceTexture.unpackAlignment = 1;
    earthDistanceTexture.colorSpace = THREE.NoColorSpace;
    earthDistanceTexture.flipY = false;
    earthDistanceTexture.needsUpdate = true;
    const uv = vec2(
      surfaceWorld.x.sub(sdf.ox).div(sdf.cell * sdf.width),
      surfaceWorld.y.sub(sdf.oy).div(sdf.cell * sdf.height),
    ).toVar();
    const encoded = texture(earthDistanceTexture, clamp(uv, vec2(0), vec2(1))).toVar();
    const inBounds = step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1));
    unionDistance = mix(
      -sdf.rangeMeters,
      encoded.r.sub(0.5).mul(2 * sdf.rangeMeters),
      inBounds,
    ).toVar();
    roadDistance = mix(
      -sdf.rangeMeters,
      encoded.g.sub(0.5).mul(2 * sdf.rangeMeters),
      inBounds,
    ).toVar();
  }
  const edgeNoise = earthEdgesEnabled ? coverEdgeNoiseNode(world).toVar() : float(0);
  const earth = earthEdgesEnabled ? coverEdgeNode(unionDistance, edgeNoise).toVar() : float(0);
  const noisyRoad = earthEdgesEnabled ? coverEdgeNode(roadDistance, edgeNoise).toVar() : float(0);
  const roadEdge = min(noisyRoad, earth).toVar();
  const mudEdge = earth.sub(roadEdge).toVar();
  const turfAtEdge = turfEdgeCoverageNode(earth).toVar();
  const roadInterior = roadInteriorCoverageNode(roadDistance).toVar();
  const mudInterior = mudInteriorCoverageNode(unionDistance)
    .mul(float(1).sub(roadInterior))
    .toVar();
  const normalZ = clamp(worldNormal.z, 0.0, 1.0).toVar();
  let rockTint: FloatNode = float(0);
  let screeTint: FloatNode = float(0);
  let rockMask: FloatNode = float(0);
  let screeMask: FloatNode = float(0);
  let slopeMasks: ReturnType<typeof terrainSlopeMasks> | null = null;
  const tintDither = hashN(floor(world.mul(1.7)))
    .sub(0.5)
    .mul(0.5)
    .add(fbmN(world.mul(0.12)).sub(0.5).mul(0.24))
    .toVar();
  const forestTint = float(1)
    .sub(smoothstepN(0.18, 0.95, abs(tint.sub(4).add(tintDither))))
    .toVar();
  screeTint = float(1)
    .sub(smoothstepN(0.18, 0.95, abs(tint.sub(6).add(tintDither))))
    .mul(float(1).sub(roadEdge))
    .toVar();
  screeMask = screeTint.mul(0.95).mul(float(1).sub(waterBlend)).toVar();
  if (options.slopeBands) {
    rockTint = float(1)
      .sub(smoothstepN(0.18, 0.95, abs(tint.sub(2).add(tintDither))))
      .toVar();
    slopeMasks = terrainSlopeMasks(normalZ, waterBlend, rockTint, screeTint, options.slopeBands);
    rockMask = slopeMasks.rockMask;
    screeMask = slopeMasks.screeMask;
  }
  const nonEarthExclusion = max(forestTint, max(rockMask, screeMask)).toVar();

  // Broad neutral albedo variation; real blade geometry owns fine turf.
  const baseAlbedo = surfaceColor
    .mul(float(1).sub(earth))
    .add(rgbNode(MEADOW.earth.mud).mul(mudEdge))
    .add(rgbNode(MEADOW.earth.roadDust).mul(roadEdge));
  let albedo = groundDetailNode(world, baseAlbedo, {
    coverage: float(1).sub(nonEarthExclusion).mul(turfAtEdge),
  });
  if (options.farGrass) {
    const farGrass = options.farGrass;
    // Sustain past the blade edge across the whole vista. A finite outer fade
    // created a camera-centred olive island at top-down zoom; distance fog is
    // the sole far handoff, not a return to bare green ground.
    const farMask = float(1)
      .sub(waterBlend)
      .mul(float(1).sub(nonEarthExclusion))
      .mul(turfAtEdge)
      .toVar();
    const wind = frame.time.mul(0.035);
    // Keep the distance canopy isotropic and world-space. Camera-aligned
    // stretching would turn grazing views into camera-dependent streaks and
    // break the phase-return contract.
    const brush = ridgeN(
      vec2(
        world.x.mul(0.62).add(world.y.mul(0.12)).add(wind),
        world.y.mul(0.6).sub(world.x.mul(0.09)).sub(wind.mul(0.6)),
      ),
    ).toVar();
    const raked = ridgeN(
      vec2(
        world.x.mul(1.16).sub(world.y.mul(0.2)).sub(wind.mul(0.4)),
        world.y.mul(1.1).add(world.x.mul(0.16)).add(wind.mul(0.25)),
      ),
    ).toVar();
    const fineBreak = fbmN(world.mul(2.4).add(vec2(9.0, 4.0))).toVar();
    const grazingFine = brush.mul(0.6).add(raked.mul(0.28)).add(fineBreak.mul(0.12)).toVar();
    // Grazing views compress tens of metres into a narrow screen band, so the
    // canopy uses metre-scale clumps. One khaki anchor keeps hue stable while
    // low-amplitude value variation survives minification.
    const grazingLift = turfCanopyNode(world, grazingFine);
    albedo = mix(
      albedo,
      grazingLift,
      farMask.mul(farGrass.terrainDetailStrength).mul(TURF_CONTRAST.canopy.mixStrength),
    );
  }
  // Churn uses the unwarped mud interior so the noisy visual feather cannot
  // paint a dark ring around earth boundaries.
  const clods = fbmN(world.mul(0.07))
    .mul(0.6)
    .add(fbmN(world.mul(0.16).add(vec2(5.0, 2.0))).mul(0.4));
  const ruts = ridgeN(world.mul(vec2(0.11, 0.045)).add(vec2(2.0, 0.0)));
  const churn = clamp(clods.mul(0.72).add(ruts.mul(0.28)).add(0.58), 0.42, 1.3);
  albedo = mix(albedo, albedo.mul(churn), mudInterior);
  let dryRoughness: FloatNode = float(0.95);
  let dryNormal: ReturnType<typeof terrainRockResponse>["normal"] | undefined;

  if (slopeMasks) {
    const response = terrainRockResponse(surface, albedo, slopeMasks, options.detailScale);
    albedo = response.albedo;
    dryRoughness = response.dryRoughness;
    dryNormal = response.normal;
  }
  const dryRoughnessFloor = options.vistaBand
    ? options.vistaBand === "farFog"
      ? float(0.995)
      : float(0.985)
    : float(0);
  applyTerrainSurface(material, frame, surface, albedo, dryRoughness, dryRoughnessFloor, dryNormal);
  if (options.vistaBand === "farFog") {
    // The 64 m far-fog ring is real terrain below the horizon, but from a low
    // eye its coarse vertices can project into the sky as giant grazing tiles.
    // Let saturated aerial perspective own those near/above-horizon rays.
    const view = normalize(positionWorld.sub(cameraPosition));
    material.transparent = true;
    material.depthWrite = false;
    material.opacityNode = float(1.0).sub(smoothstepN(-0.012, 0.05, view.z));
  }

  const ground = new THREE.Mesh(geo, material);
  ground.name = "battle-ground";
  ground.frustumCulled = false;
  ground.renderOrder = RENDER_ORDER.worldOpaque;
  // The ground is the primary shadow RECEIVER (soldier/tree/cliff
  // shadows land here) but does NOT cast. A gently undulating heightfield at
  // a grazing golden-hour sun needs cot(elevation)·texel ≈ 2–3 world units of
  // depth bias in the far cascades to stop self-shadow ripple — a bias that
  // erases every soldier-sized shadow (verified on hardware shots). Terrain
  // self-occlusion is owned by 13 (relief look) / 14c (contact AO) instead.
  ground.receiveShadow = true;
  if (earthDistanceTexture && earthDistance) {
    ground.userData.earthDistanceTexture = earthDistanceTexture;
    ground.userData.earthDistance = {
      owner: "playable-ground",
      format: "rg8-unorm",
      width: earthDistance.width,
      height: earthDistance.height,
      rangeMeters: earthDistance.rangeMeters,
      channels: ["earth-union", "road"],
      filters: ["linear", "linear"],
      textureResources: 1,
      vistaSamples: 0,
    } as const;
  }
  return ground;
}

export function createVistaMesh(
  frame: LandscapeFrameUniforms,
  band: BattleVistaBand,
  cover: BattleGroundCover,
  options: TerrainMaterialOptions = {},
  innerMesh?: THREE.Mesh,
): THREE.Mesh | null {
  const mesh = buildVistaGroundMesh(band, cover);
  if (mesh.indices.length === 0) return null;
  const vista = createGroundMesh(frame, mesh, {
    ...options,
    vistaBand: band.name,
    earthDistance: undefined,
  });
  if (innerMesh) {
    const hole: [number, number, number, number] = [
      band.ox + Math.floor((-band.innerHalfW - band.ox) / band.cell) * band.cell,
      band.oy + Math.floor((-band.innerHalfH - band.oy) / band.cell) * band.cell,
      band.ox + Math.ceil((band.innerHalfW - band.ox) / band.cell) * band.cell,
      band.oy + Math.ceil((band.innerHalfH - band.oy) / band.cell) * band.cell,
    ];
    joinTerrainMeshEdges(vista.geometry, innerMesh.geometry, hole);
  }
  vista.name = `battle-vista-${band.name}`;
  vista.castShadow = false;
  vista.receiveShadow = false;
  vista.userData.pickable = false;
  return vista;
}

function buildVistaGroundMesh(band: BattleVistaBand, cover: BattleGroundCover): LandscapeMesh {
  const base = GROUND_COVER_COLOR[cover];
  const verts = new Float32Array(band.w * band.h * 10);
  const tint = new Float32Array(band.w * band.h);
  const surfaceColor = new Float32Array(band.w * band.h * 3);
  const zAt = (i: number, j: number): number => {
    const y = band.oy + j * band.cell;
    const baseZ = band.height[j * band.w + i] ?? 0;
    return baseZ + northSouthSink(y);
  };
  let v = 0;
  let tv = 0;
  for (let j = 0; j < band.h; j++) {
    for (let i = 0; i < band.w; i++) {
      const x = band.ox + i * band.cell;
      const y = band.oy + j * band.cell;
      const z = zAt(i, j);
      const wide = band.cell >= 64 ? 2 : 1;
      const il2 = Math.max(0, i - wide);
      const ir2 = Math.min(band.w - 1, i + wide);
      const jb2 = Math.max(0, j - wide);
      const jt2 = Math.min(band.h - 1, j + wide);
      const dx2 = Math.max(0.001, (ir2 - il2) * band.cell);
      const dy2 = Math.max(0.001, (jt2 - jb2) * band.cell);
      const hx = zAt(ir2, j) - zAt(il2, j);
      const hy = zAt(i, jt2) - zAt(i, jb2);
      let nx = -hx / dx2;
      let ny = -hy / dy2;
      const slope = Math.hypot(nx, ny);
      const slopeCeiling = band.cell >= 64 ? 0.52 : 0.82;
      if (slope > slopeCeiling) {
        const scale = slopeCeiling / slope;
        nx *= scale;
        ny *= scale;
      }
      const nz = 1;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      verts[v++] = x;
      verts[v++] = y;
      verts[v++] = z;
      verts[v++] = nx / nlen;
      verts[v++] = ny / nlen;
      verts[v++] = nz / nlen;
      verts[v++] = base[0];
      verts[v++] = base[1];
      verts[v++] = base[2];
      verts[v++] = band.water[j * band.w + i];
      surfaceColor[tv * 3] = base[0];
      surfaceColor[tv * 3 + 1] = base[1];
      surfaceColor[tv * 3 + 2] = base[2];
      tint[tv++] = 0;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < band.h - 1; j++) {
    for (let i = 0; i < band.w - 1; i++) {
      const cx = band.ox + (i + 0.5) * band.cell;
      const cy = band.oy + (j + 0.5) * band.cell;
      // Keep the ring wholly outside the preceding tile. The seam strip
      // bridges the sub-cell gap where the two resolutions do not align.
      if (
        Math.abs(cx) < band.innerHalfW + band.cell / 2 &&
        Math.abs(cy) < band.innerHalfH + band.cell / 2
      )
        continue;
      const a = j * band.w + i;
      const b = a + 1;
      const c = a + band.w;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    vertices: verts,
    tint,
    surfaceColor,
    indices: new Uint32Array(indices),
    triangles: indices.length / 3,
  };
}

/** The sealed-edge blocker mesh (horizonPass port — cliffs/walls/aprons). */
export function createHorizonBlockerMesh(layout: BattleHorizonLayout): THREE.Mesh | null {
  if (layout.mesh.indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  const buffer = new THREE.InterleavedBuffer(layout.mesh.vertices, 10);
  geo.setAttribute("position", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute("hNormal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  // 'normal' alias for shadow.normalBias (see the ground-mesh note above).
  geo.setAttribute("normal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  geo.setAttribute("hColor", new THREE.InterleavedBufferAttribute(buffer, 3, 6));
  geo.setIndex(new THREE.BufferAttribute(layout.mesh.indices, 1));

  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.FrontSide,
    roughness: 0.92,
    metalness: 0,
  });
  material.normalNode = viewNormalNode(normalize(attribute<"vec3">("hNormal", "vec3")));
  const color = varying(attribute<"vec3">("hColor", "vec3"));
  const col = clamp(color, vec3(0.0), vec3(1.0));
  material.colorNode = vec4(linearAlbedo(col), 1.0);

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "battle-horizon-blockers";
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.worldOpaque;
  // Headland cliffs/walls throw long shadows onto the field at low
  // sun and self-shade; they receive like every world surface.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
