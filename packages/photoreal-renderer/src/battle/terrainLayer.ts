// terrainLayer — the battle ground on the photoreal substrate. Born as literal
// TSL ports of the production background quads (frameShell terrainWgsl/
// terrainBackdropWgsl), the height-displaced ground mesh (groundPass
// GROUND_WGSL, meadow branch unported), and the sealed-edge horizon blockers
// (horizonPass HORIZON_WGSL); since slice 09 they are standard-material
// responses with NEUTRAL albedos — the baked lambert/key-fill/exposure terms
// are extracted, the sun + IBL environment light them. The CPU geometry comes
// from the same builders the bespoke passes upload (buildBattleGroundMesh /
// buildBattleHorizonLayout). Distance haze comes ONLY from the shared
// aerial-perspective hook (scene.fogNode, slice 10b) — no material here adds
// its own haze, ever.
import * as THREE from "three/webgpu";
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  float,
  floor,
  fract,
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
import type { PhotorealBattleGroundMesh } from "../../../game-renderer/src/battle/groundPass";
import type { PhotorealEarthDistanceField } from "../../../game-renderer/src/battle/photorealEarthDistance";
import { GROUND_COVER_COLOR, MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import type { BattleHorizonLayout } from "../../../game-renderer/src/battle/horizonPass";
import {
  fbmN,
  hashN,
  linearAlbedo,
  ridgeN,
  rgbNode,
  saturateN,
  smoothstepN,
  viewNormalNode,
  vnoiseN,
  type BattleFrameUniforms,
  type FloatNode,
  type Rgb,
  type Vec2Node,
} from "./battleTsl";
import {
  groundDetailNode,
  coverEdgeNode,
  coverEdgeNoiseNode,
  mudInteriorCoverageNode,
  roadInteriorCoverageNode,
  turfEdgeCoverageNode,
  turfCanopyFromSignalsNode,
  turfCanopyNode,
  TURF_CONTRAST,
} from "./groundDetail";
import { fieldWaterSurfaceNodes } from "./seaLayer";
import type {
  BattleGroundCover,
  BattleSlopeBands,
} from "../../../game-renderer/src/battle/terrainFeatures";
import type { BladeFieldTransitionUniforms } from "./bladeFieldLayer";

export const RENDER_ORDER = {
  backdrop: -10,
  terrain: -9,
  markers: -8,
  worldOpaque: 0,
  // (1 and 2 were the 08a blob-shadow decal bands — deleted at 11, real CSM.)
  groundCues: 3,
  effectLines: 10,
  debugBlocks: 11,
  debugTriangles: 12,
  // UI band: drawn after every world/backdrop transparent (the reversed-sort
  // painter contract means a lower-order transparent backdrop would wash
  // over anything below it in the list).
  readout: 20,
} as const;

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

export interface TerrainMaterialOptions {
  slopeBands?: BattleSlopeBands | null;
  vistaBand?: BattleVistaBand["name"] | null;
  farGrass?: BladeFieldTransitionUniforms | null;
  earthDistance?: PhotorealEarthDistanceField;
}

type PhotorealGroundMesh = Omit<PhotorealBattleGroundMesh, "earthDistance">;

export interface BattleVistaBand {
  name: "vista" | "farFog" | string;
  w: number;
  h: number;
  cell: number;
  /** First vertex-sample world coordinate, not a cell-corner origin. */
  ox: number;
  oy: number;
  /** Renderer cuts this inner rect out of the full band to avoid z-fighting. */
  innerHalfW: number;
  innerHalfH: number;
  outerHalfW: number;
  outerHalfH: number;
  height: Float32Array;
}

export interface BattleVistaGrid {
  shape: string;
  bands: BattleVistaBand[];
}

export function vistaSurfaceHeightAt(vista: BattleVistaGrid, x: number, y: number): number | null {
  const band = vista.bands.find(
    (b) => Math.abs(x) <= b.outerHalfW + b.cell && Math.abs(y) <= b.outerHalfH + b.cell,
  );
  if (!band) return null;
  if (Math.abs(x) < band.innerHalfW && Math.abs(y) < band.innerHalfH) return null;
  const gx = clampNumber((x - band.ox) / band.cell, 0, band.w - 1);
  const gy = clampNumber((y - band.oy) / band.cell, 0, band.h - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, band.w - 1);
  const y1 = Math.min(y0 + 1, band.h - 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const top = lerpNumber(band.height[y0 * band.w + x0], band.height[y0 * band.w + x1], tx);
  const bot = lerpNumber(band.height[y1 * band.w + x0], band.height[y1 * band.w + x1], tx);
  return lerpNumber(top, bot, ty) + northSouthSink(band, x, y);
}

function normalZForSlope(slope: number): number {
  return 1 / Math.sqrt(1 + slope * slope);
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
  frame: BattleFrameUniforms,
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
  // varying would interpolate flat) — the sun now shades it, not a baked lambert.
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
 *  OUTSIDE the slice-11 shadow set (neither casts nor receives): they are
 *  depthTest-off underlays beyond the heightfield, always shaded fullscreen
 *  under the real ground — receiving would pay per-pixel cascade sampling
 *  twice for pixels the aerial haze owns anyway. */
export class BattleBackgroundQuads {
  readonly backdrop: THREE.Mesh;
  readonly terrainDefault: THREE.Mesh;
  readonly terrainWide: THREE.Mesh;

  constructor(scene: THREE.Scene, frame: BattleFrameUniforms) {
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
}

/** The rolling battle ground mesh shared by playable and vista terrain. */
export function createGroundMesh(
  frame: BattleFrameUniforms,
  mesh: PhotorealGroundMesh,
  options: TerrainMaterialOptions = {},
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const buffer = new THREE.InterleavedBuffer(mesh.vertices, 10);
  geo.setAttribute("position", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute("gNormal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  // 'normal' alias (same interleaved view): shadow.normalBias reads
  // normalWorld by attribute name — absent, the offset is silently zero (11).
  geo.setAttribute("normal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  geo.setAttribute("gWater", new THREE.InterleavedBufferAttribute(buffer, 1, 9));
  geo.setAttribute("gTint", new THREE.BufferAttribute(mesh.tint, 1));
  geo.setAttribute("gSurfaceColor", new THREE.BufferAttribute(mesh.surfaceColor, 3));
  const earthDistance = options.earthDistance;
  const earthEdgesEnabled = earthDistance !== undefined;
  let earthDistanceTexture: THREE.DataTexture | null = null;
  geo.setIndex(new THREE.BufferAttribute(frontSideIndexBuffer(mesh.indices), 1));

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  const position = attribute<"vec3">("position", "vec3");
  const gNormal = attribute<"vec3">("gNormal", "vec3");
  const worldNormal = normalize(gNormal).toVar();
  material.normalNode = viewNormalNode(worldNormal);
  const surfaceColor = varying(attribute<"vec3">("gSurfaceColor", "vec3")).toVar();
  const water = varying(attribute<"float">("gWater", "float")).toVar();
  const tint = varying(attribute<"float">("gTint", "float")).toVar();
  const world = varying(position.xy).toVar();
  const rawWaterBlend = saturateN(water).toVar();
  const waterBlend = smoothstepN(0.08, 0.55, rawWaterBlend).toVar();

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
      world.x.sub(sdf.ox).div(sdf.cell * sdf.width),
      world.y.sub(sdf.oy).div(sdf.cell * sdf.height),
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
  let slowNz = 1;
  let rollingNz = 1;
  let cliffNz = 1;
  let slopeRock: FloatNode = float(0);
  let slowSlope: FloatNode = float(0);
  let rockTint: FloatNode = float(0);
  let screeTint: FloatNode = float(0);
  let rockMask: FloatNode = float(0);
  let screeMask: FloatNode = float(0);
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
    slowNz = normalZForSlope(options.slopeBands.slowMin);
    rollingNz = normalZForSlope(options.slopeBands.rollingMax);
    cliffNz = normalZForSlope(options.slopeBands.cliffMin);
    slopeRock = float(1)
      .sub(smoothstepN(cliffNz, slowNz, normalZ))
      .toVar();
    slowSlope = float(1)
      .sub(smoothstepN(slowNz, rollingNz, normalZ))
      .toVar();
    rockTint = float(1)
      .sub(smoothstepN(0.18, 0.95, abs(tint.sub(2).add(tintDither))))
      .toVar();
    const dryOnly = float(1).sub(waterBlend);
    rockMask = clamp(rockTint.add(slopeRock), 0, 1).mul(dryOnly).toVar();
    screeMask = clamp(
      screeTint.mul(0.95).add(slowSlope.mul(float(1).sub(rockTint)).mul(0.42)),
      0,
      1,
    )
      .mul(dryOnly)
      .toVar();
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

  if (options.slopeBands) {
    // Rust passability measures slope over true metres. The mesh normal carries
    // the same quantity as normal.z = 1 / sqrt(1 + slope^2).
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
    const strataPhase = fract(position.z.mul(0.16).add(warp.mul(1.7))).toVar();
    const strata = smoothstepN(0.7, 0.98, abs(strataPhase.mul(2.0).sub(1.0)))
      .mul(smoothstepN(0.35, 0.75, fbmN(world.mul(0.021).add(vec2(11.0, 3.0)))))
      .toVar();
    const faceNoise = fbmN(world.mul(0.075).add(vec2(2.0, 6.0))).toVar();
    let rock = mix(vec3(0.32, 0.32, 0.29), vec3(0.45, 0.43, 0.36), faceNoise);
    rock = mix(rock, vec3(0.21, 0.22, 0.21), fracture.mul(slopeRock).mul(0.62));
    rock = mix(rock, vec3(0.19, 0.2, 0.19), strata.mul(slopeRock).mul(0.34));

    const pebble = smoothstepN(0.78, 0.97, hashN(floor(world.mul(0.85)))).toVar();
    let scree = mix(
      vec3(0.43, 0.42, 0.36),
      vec3(0.57, 0.54, 0.45),
      fbmN(world.mul(0.22).add(vec2(8.0, 3.0))),
    );
    scree = mix(scree, vec3(0.3, 0.3, 0.27), pebble.mul(0.28));

    const benchCreep = clamp(rockMask.add(screeTint.mul(0.45)), 0.0, 1.0)
      .mul(smoothstepN(slowNz, rollingNz, normalZ))
      .mul(smoothstepN(0.42, 0.84, fbmN(world.mul(0.18).add(vec2(6.0, 1.0)))))
      .mul(0.44)
      .toVar();

    albedo = mix(albedo, scree, screeMask.mul(0.78));
    albedo = mix(albedo, rock, rockMask);
    albedo = mix(albedo, vec3(0.34, 0.43, 0.21), benchCreep);
    dryRoughness = mix(
      dryRoughness,
      float(0.985),
      clamp(rockMask.add(screeMask).mul(0.62), 0.0, 1.0),
    );
  }

  // Field water: the shared water surface blended by the box-filtered weight
  // (albedo + roughness — wet ground gets a real sun sheen).
  const fieldWater = fieldWaterSurfaceNodes(frame, world, rawWaterBlend);
  albedo = mix(albedo, fieldWater.albedo, waterBlend);
  material.colorNode = vec4(linearAlbedo(clamp(albedo, vec3(0.0), vec3(1.0))), 1.0);
  const dryRoughnessFloor = options.vistaBand
    ? options.vistaBand === "farFog"
      ? float(0.995)
      : float(0.985)
    : float(0.0);
  material.roughnessNode = mix(
    max(dryRoughness, dryRoughnessFloor),
    fieldWater.roughness,
    waterBlend,
  );
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
  // Slice 11: the ground is the primary shadow RECEIVER (soldier/tree/cliff
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
  frame: BattleFrameUniforms,
  band: BattleVistaBand,
  cover: BattleGroundCover,
  options: TerrainMaterialOptions = {},
): THREE.Mesh | null {
  const mesh = buildVistaGroundMesh(band, cover);
  if (mesh.indices.length === 0) return null;
  const vista = createGroundMesh(frame, mesh, {
    ...options,
    vistaBand: band.name,
    earthDistance: undefined,
  });
  vista.name = `battle-vista-${band.name}`;
  vista.castShadow = false;
  vista.receiveShadow = false;
  vista.userData.pickable = false;
  return vista;
}

function buildVistaGroundMesh(
  band: BattleVistaBand,
  cover: BattleGroundCover,
): PhotorealGroundMesh {
  const base = GROUND_COVER_COLOR[cover];
  const verts = new Float32Array(band.w * band.h * 10);
  const tint = new Float32Array(band.w * band.h);
  const surfaceColor = new Float32Array(band.w * band.h * 3);
  const zAt = (i: number, j: number): number => {
    const x = band.ox + i * band.cell;
    const y = band.oy + j * band.cell;
    const baseZ = band.height[j * band.w + i] ?? 0;
    return baseZ + northSouthSink(band, x, y);
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
      verts[v++] = 0;
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
      if (Math.abs(cx) < band.innerHalfW && Math.abs(cy) < band.innerHalfH) continue;
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

function northSouthSink(band: BattleVistaBand, _x: number, y: number): number {
  // ONE world-space ramp shared by every band: per-band ramps restarted at
  // zero at each band boundary, so the farFog floor stepped 7.5 m above the
  // sunken vista edge - a lit stepped wall that rendered as the white
  // horizon band (compose rounds 1-2). Anchor on the band's inner edge only
  // for the RAMP START of the innermost band; the domain end is the world
  // sink horizon shared by all bands.
  const SINK_START_Y = 820;
  const SINK_END_Y = 2800;
  const t = Math.max(0, Math.abs(y) - SINK_START_Y) / Math.max(1, SINK_END_Y - SINK_START_Y);
  const s = smoothstep(0.15, 1.0, t);
  return -7.5 * s;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clampNumber(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
  // Slice 11: headland cliffs/walls throw long shadows onto the field at low
  // sun and self-shade; they receive like every world surface.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
