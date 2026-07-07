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
  dot,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  normalize,
  positionWorld,
  smoothstep as smoothstepNode,
  transformNormalToView,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { BattleGroundMesh } from "../../../game-renderer/src/battle/groundPass";
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
  speckleStrength: number;
  dryMixBase: number;
  trampleMix: number;
  stubbleColor: Rgb;
  stubbleStrength: number;
  darkFleckColor: Rgb;
  darkFleckStrength: number;
  stoneFleckStrength: number;
  dustStrength: number;
}

const DEFAULT_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: [0.43, 0.56, 0.22],
  oliveHigh: [0.66, 0.69, 0.33],
  dry: [0.76, 0.67, 0.39],
  lightFleckLow: 0.884,
  lightFleckHigh: 0.99,
  darkFleckLow: 0.82,
  darkFleckHigh: 0.982,
  stoneFleckLow: 0.924,
  stoneFleckHigh: 0.996,
  speckleStrength: 0.315,
  dryMixBase: 0.22,
  trampleMix: 0.15,
  stubbleColor: [0.53, 0.48, 0.25],
  stubbleStrength: 0.055,
  darkFleckColor: [0.47, 0.43, 0.32],
  darkFleckStrength: 0.38,
  stoneFleckStrength: 0.3,
  dustStrength: 0.14,
};

const WIDE_DETAIL_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: [0.44, 0.58, 0.22],
  oliveHigh: [0.68, 0.71, 0.33],
  dry: [0.75, 0.67, 0.39],
  lightFleckLow: 0.876,
  lightFleckHigh: 0.988,
  darkFleckLow: 0.8,
  darkFleckHigh: 0.976,
  stoneFleckLow: 0.916,
  stoneFleckHigh: 0.995,
  speckleStrength: 0.325,
  dryMixBase: 0.2,
  trampleMix: 0.14,
  stubbleColor: [0.52, 0.47, 0.25],
  stubbleStrength: 0.063,
  darkFleckColor: [0.45, 0.42, 0.31],
  darkFleckStrength: 0.42,
  stoneFleckStrength: 0.32,
  dustStrength: 0.12,
};

export interface TerrainMaterialOptions {
  slopeBands?: BattleSlopeBands | null;
  vistaBand?: BattleVistaBand["name"] | null;
  farGrass?: BladeFieldTransitionUniforms | null;
}

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
  const olive = mix(
    rgbNode(style.oliveLow),
    rgbNode(style.oliveHigh),
    mid.mul(0.66).add(fine.mul(0.16)).add(relief.mul(0.18)),
  );
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
  const speckle = lightFleck.mul(style.speckleStrength);
  let grass = mix(olive, rgbNode(style.dry), trample.mul(style.trampleMix).add(style.dryMixBase));
  grass = mix(grass, vec3(0.31, 0.39, 0.18), scrubPatch.mul(0.34));
  grass = mix(grass, vec3(0.88, 0.75, 0.47), rakedDust);
  grass = grass.add(vec3(0.13, 0.12, 0.055).mul(speckle));
  grass = mix(grass, rgbNode(style.stubbleColor), stubble.mul(style.stubbleStrength));
  grass = mix(
    grass,
    grass.mul(rgbNode(style.darkFleckColor)),
    darkFleck.mul(style.darkFleckStrength),
  );
  grass = mix(grass, vec3(0.46, 0.43, 0.32), stoneFleck.mul(style.stoneFleckStrength));
  const dust = smoothstepN(18.0, 96.0, dist).mul(style.dustStrength);
  const sunBleached = mix(grass, vec3(0.86, 0.72, 0.46), dust);
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
  let grass = mix(vec3(0.16, 0.25, 0.12), vec3(0.3, 0.42, 0.2), broad);
  grass = mix(grass, vec3(0.11, 0.18, 0.1), smoothstepN(0.62, 0.94, mid).mul(0.38));
  grass = grass.add(vec3(0.1, 0.12, 0.04).mul(speck));
  material.colorNode = vec4(linearAlbedo(grass), 1.0);
  return material;
}

/** The background band: backdrop quad + builtin terrain quad (two styles,
 *  toggled by zoom exactly like drawFrame's terrainStyle). Deliberately
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
      terrainQuadMaterial(DEFAULT_TERRAIN_STYLE, frame),
    );
    this.terrainDefault.name = "battle-terrain-quad";
    this.terrainDefault.renderOrder = RENDER_ORDER.terrain;
    this.terrainWide = new THREE.Mesh(
      quadGeometry(),
      terrainQuadMaterial(WIDE_DETAIL_TERRAIN_STYLE, frame),
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

/** The rolling battle ground mesh (groundPass port, meadow disabled). */
export function createGroundMesh(
  frame: BattleFrameUniforms,
  mesh: BattleGroundMesh,
  options: TerrainMaterialOptions = {},
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const buffer = new THREE.InterleavedBuffer(mesh.vertices, 10);
  geo.setAttribute("position", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute("gNormal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  // 'normal' alias (same interleaved view): shadow.normalBias reads
  // normalWorld by attribute name — absent, the offset is silently zero (11).
  geo.setAttribute("normal", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  geo.setAttribute("gColor", new THREE.InterleavedBufferAttribute(buffer, 3, 6));
  geo.setAttribute("gWater", new THREE.InterleavedBufferAttribute(buffer, 1, 9));
  geo.setAttribute("gTint", new THREE.BufferAttribute(mesh.tint, 1));
  geo.setIndex(new THREE.BufferAttribute(frontSideIndexBuffer(mesh.indices), 1));

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  const position = attribute<"vec3">("position", "vec3");
  const gNormal = attribute<"vec3">("gNormal", "vec3");
  const worldNormal = normalize(gNormal).toVar();
  material.normalNode = viewNormalNode(worldNormal);
  const color = varying(attribute<"vec3">("gColor", "vec3")).toVar();
  const water = varying(attribute<"float">("gWater", "float")).toVar();
  const tint = varying(attribute<"float">("gTint", "float")).toVar();
  const world = varying(position.xy).toVar();
  const rawWaterBlend = saturateN(water).toVar();
  const waterBlend = smoothstepN(0.08, 0.55, rawWaterBlend).toVar();

  // Grass/ground micro-detail across scales (GROUND_WGSL fs, meadow off) —
  // NEUTRAL albedo variation; the sun + IBL environment light it.
  const drift = fbmN(world.mul(0.08)).sub(0.5).mul(0.1);
  const mottle = fbmN(world.mul(1.1)).sub(0.5).mul(0.13);
  const blade = fbmN(world.mul(4.7))
    .sub(0.5)
    .mul(0.1)
    .add(fbmN(world.mul(12.0)).sub(0.5).mul(0.06));
  const detail = clamp(drift.add(mottle).add(blade).add(1.0), 0.68, 1.32);
  let albedo = color.mul(detail);
  if (options.farGrass) {
    const farGrass = options.farGrass;
    const cameraGround = cameraPosition.xy;
    const viewDist = length(world.sub(cameraGround)).toVar();
    const detailStart = max(float(5.0), farGrass.nearTierEndM.mul(0.45)).toVar();
    const detailFull = max(detailStart.add(4.0), farGrass.denseBladeEndM).toVar();
    const detailIn = smoothstepNode(detailStart, detailFull, viewDist).toVar();
    const bladeSparse = smoothstepNode(farGrass.denseBladeEndM, farGrass.farGrassStartM, viewDist)
      .toVar();
    // Sustain far past the blade edge - the term hands off to distance fog,
    // not to bare green ground (the "bare strip before the treeline").
    const farOut = float(1.0).sub(
      smoothstepNode(farGrass.farGrassEndM.add(300), farGrass.farGrassEndM.add(900), viewDist),
    );
    const farMask = detailIn.mul(farOut).mul(float(1.0).sub(waterBlend)).toVar();
    const wind = frame.time.mul(0.035);
    const view = normalize(positionWorld.sub(cameraPosition)).toVar();
    const incidence = clamp(abs(dot(view, worldNormal)), 0.08, 1.0).toVar();
    const grazingT = float(1.0)
      .sub(smoothstepN(0.2, 0.62, incidence))
      .toVar();
    const viewDelta = world.sub(cameraGround).toVar();
    const viewDir2 = viewDelta.div(max(0.001, length(viewDelta))).toVar();
    const viewCross = vec2(viewDir2.y.mul(-1.0), viewDir2.x).toVar();
    const alongView = dot(world, viewDir2).toVar();
    const acrossView = dot(world, viewCross).toVar();
    const viewStretch = mix(float(1.0), float(3.6), grazingT).toVar();
    const brush = ridgeN(
      vec2(
        world.x.mul(0.78).add(world.y.mul(0.16)).add(wind),
        world.y.mul(0.32).sub(world.x.mul(0.035)).sub(wind.mul(0.6)),
      ),
    ).toVar();
    const raked = ridgeN(
      vec2(
        world.x.mul(1.18).add(world.y.mul(0.22)).sub(wind.mul(0.4)),
        world.y.mul(0.48).sub(world.x.mul(0.055)).add(wind.mul(0.25)),
      ),
    ).toVar();
    const viewBrush = ridgeN(
      vec2(
        alongView.mul(0.22).div(viewStretch).add(wind.mul(0.5)),
        acrossView.mul(0.28).sub(wind.mul(0.35)),
      ),
    ).toVar();
    const viewRake = ridgeN(
      vec2(
        alongView.mul(0.36).div(viewStretch).sub(wind.mul(0.25)),
        acrossView.mul(0.46).add(wind.mul(0.18)),
      ),
    ).toVar();
    const grazingFiber = mix(brush, viewBrush.mul(0.64).add(viewRake.mul(0.36)), grazingT).toVar();
    const nearDetailStrength = float(1.0)
      .sub(smoothstepNode(farGrass.farGrassStartM, farGrass.farGrassEndM, viewDist))
      .toVar();
    const pastBladeEdge = smoothstepNode(farGrass.farGrassStartM, farGrass.farGrassEndM, viewDist)
      .toVar();
    const broadClump = fbmN(world.mul(0.045).add(vec2(2.5, 7.0))).toVar();
    // Tone family leans toward the blade canopy's desaturated khaki - a
    // green far field against a khaki canopy flags the blade edge by hue
    // alone (unprimed critique).
    const farTone = mix(
      vec3(0.44, 0.49, 0.28),
      vec3(0.6, 0.62, 0.38),
      clamp(broadClump.mul(0.52).add(grazingFiber.mul(0.36)).add(raked.mul(0.12)), 0.0, 1.0),
    );
    const grazingShadow = grazingFiber.mul(0.22).add(viewRake.mul(grazingT).mul(0.16));
    const brushedTone = mix(farTone, vec3(0.34, 0.39, 0.21), grazingShadow.add(raked.mul(0.12)));
    const grazingLift = mix(brushedTone, vec3(0.66, 0.67, 0.43), viewBrush.mul(grazingT).mul(0.18));
    const bladeZoneDetail = bladeSparse.mul(nearDetailStrength).toVar();
    const postEdgeDetail = max(bladeZoneDetail, pastBladeEdge).toVar();
    const detailAmount = mix(float(0.26), float(0.92), postEdgeDetail).add(grazingT.mul(0.08));
    albedo = mix(
      albedo,
      grazingLift,
      farMask.mul(farGrass.terrainDetailStrength).mul(clamp(detailAmount, 0.0, 0.98)),
    );
  }
  // Churn: trodden mud reads as broken ground (brown AND dark keys the earth).
  const brown = smoothstepN(0.0, 0.05, color.r.sub(color.g));
  const dark = float(1.0).sub(smoothstepN(0.3, 0.46, color.r.add(color.g).add(color.b).div(3.0)));
  const earth = brown.mul(dark);
  const clods = fbmN(world.mul(0.07))
    .mul(0.6)
    .add(fbmN(world.mul(0.16).add(vec2(5.0, 2.0))).mul(0.4));
  const ruts = ridgeN(world.mul(vec2(0.11, 0.045)).add(vec2(2.0, 0.0)));
  const churn = clamp(clods.mul(0.72).add(ruts.mul(0.28)).add(0.58), 0.42, 1.3);
  albedo = mix(albedo, albedo.mul(churn), earth);
  let dryRoughness: FloatNode = float(0.95);

  if (options.slopeBands) {
    // Rust passability uses central differences over true meters:
    // slope = sqrt(dzdx^2 + dzdy^2). The mesh normal encodes that same slope
    // as normal.z = 1 / sqrt(1 + slope^2), because generated maps arrive here
    // with reliefScale=1.0 after the short-lived hand-map exaggeration seam.
    const slowNz = normalZForSlope(options.slopeBands.slowMin);
    const rollingNz = normalZForSlope(options.slopeBands.rollingMax);
    const cliffNz = normalZForSlope(options.slopeBands.cliffMin);
    const normalZ = clamp(worldNormal.z, 0.0, 1.0).toVar();
    const slopeRock = float(1.0)
      .sub(smoothstepN(cliffNz, slowNz, normalZ))
      .toVar();
    const slowSlope = float(1.0)
      .sub(smoothstepN(slowNz, rollingNz, normalZ))
      .toVar();
    const tintDither = hashN(floor(world.mul(1.7)))
      .sub(0.5)
      .mul(0.5)
      .add(fbmN(world.mul(0.12)).sub(0.5).mul(0.24))
      .toVar();
    const rockTint = float(1.0)
      .sub(smoothstepN(0.18, 0.95, abs(tint.sub(2.0).add(tintDither))))
      .toVar();
    const screeTint = float(1.0)
      .sub(smoothstepN(0.18, 0.95, abs(tint.sub(6.0).add(tintDither))))
      .toVar();
    const dryOnly = float(1.0).sub(waterBlend);

    const warp = fbmN(world.mul(0.035))
      .mul(2.2)
      .add(fbmN(world.mul(0.12).add(vec2(4.0, 9.0))).mul(0.7))
      .toVar();
    // Fracture-first rock: evenly spaced elevation bands read as a topo map
    // (unprimed critique) - the dominant structure is VERTICAL fracture
    // streaks (fine in plan, coherent down the face), with faint noise-varied
    // strata underneath.
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

    const rockMask = clamp(rockTint.add(slopeRock), 0.0, 1.0).mul(dryOnly).toVar();
    const screeMask = clamp(
      screeTint.mul(0.95).add(slowSlope.mul(float(1.0).sub(rockTint)).mul(0.42)),
      0.0,
      1.0,
    )
      .mul(dryOnly)
      .toVar();
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
  const vista = createGroundMesh(frame, mesh, { ...options, vistaBand: band.name });
  vista.name = `battle-vista-${band.name}`;
  vista.castShadow = false;
  vista.receiveShadow = false;
  vista.userData.pickable = false;
  return vista;
}

function buildVistaGroundMesh(band: BattleVistaBand, cover: BattleGroundCover): BattleGroundMesh {
  const base =
    cover === "sand"
      ? [0.74, 0.66, 0.46]
      : cover === "yellow-grass"
        ? [0.6, 0.57, 0.31]
        : cover === "scrub-grass"
          ? [0.52, 0.53, 0.34]
          : [0.4, 0.49, 0.26];
  const verts = new Float32Array(band.w * band.h * 10);
  const tint = new Float32Array(band.w * band.h);
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
