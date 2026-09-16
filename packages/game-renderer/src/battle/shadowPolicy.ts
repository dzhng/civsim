/** Shadow quality and fit policy shared by source and comparison runtimes.
 * The whole-map fit below is the COMPARISON baseline and the no-camera
 * fallback; `viewShadowFit` further down is the camera-relevant fit the battle
 * rig runs per frame. Both live here so one owner answers "where does the sun
 * map point, and how wide is a texel". */
import { eyePosition, type Camera3DParams, type Vec3 } from "../../../renderer-core/src/camera3d";
import { BATTLE_HORIZON_BOUNDS } from "./horizonPass";

export type SunShadowMode = "csm" | "single" | "off";
export const CSM_CASCADES = 2;
export const CSM_MAP_SIZE = 2048;
export const SINGLE_MAP_SIZE = 1024;
// The limited cascade range keeps distant haze from spending close shadow texels.
export const SHADOW_MAX_FAR = 1500;
export const CSM_LIGHT_MARGIN = 300;
// Depth bias is normalized; normal bias is in world units.
export const SHADOW_BIAS = -0.00003;
export const SHADOW_NORMAL_BIAS = 0.6;
export const SHADOW_CAM_NEAR = 1;
export const SHADOW_CAM_FAR = 2500;

/** Aerosol turbidity broadens the sampling radius without a second light preset. */
export function shadowRadiusForTurbidity(turbidity: number): number {
  return Math.min(3, Math.max(1, 1 + (turbidity - 2) * 0.28));
}

/** All adapters currently use one soft map; explicit lab overrides select CSM/off. */
export function resolveSunShadowMode(
  _adapterLabel: string,
  override?: string | null,
): SunShadowMode {
  if (override === "off" || override === "single" || override === "csm") return override;
  return "single";
}

/** Existing whole-map fit, shared by control and native shadow orchestration. */
export function singleShadowFit(
  rect: readonly [number, number, number, number],
  unitSunDirection: readonly [number, number, number],
) {
  const [x, y, w, h] = rect,
    cx = x + w / 2,
    cy = y + h / 2;
  const half = Math.hypot(w, h) / 2 + 40,
    reach = half + 200;
  return {
    target: [cx, cy, 0] as [number, number, number],
    position: [
      cx + unitSunDirection[0] * reach,
      cy + unitSunDirection[1] * reach,
      unitSunDirection[2] * reach,
    ] as [number, number, number],
    left: -half,
    right: half,
    top: half,
    bottom: -half,
    near: 1,
    far: reach * 2,
  };
}

// ---------------------------------------------------------------------------
// View-relevant fit
//
// The whole-map fit above spends one map on the entire terrain: a 2400x1600
// field resolves 2964.441 light-space units, or 2.895 world units per texel at
// 1024. A soldier is ~0.5 units across, so his contact shadow is a fifth of a
// texel and the 0.6-unit normal offset pushes what is left off his feet. The
// fit below spends the same map on the ground the camera can actually see, so
// the texel lands at a fraction of a soldier instead of six of them.
//
// Two invariants make that safe to do every frame:
//   - Light-space XY of a caster EQUALS the light-space XY of the shadow it
//     casts. So a box fitted to the visible receivers already contains every
//     offscreen caster that can reach them; only the DEPTH range has to be
//     extended toward the sun (SHADOW_CASTER_CEILING) to admit them.
//   - The light basis is a function of the sun alone, so light-plane
//     coordinates are world-anchored. Snapping the fitted centre to that grid
//     is what stops the shadow pattern swimming under camera motion.
//
// "The receivers this camera can see" is resolved as a CONVEX INTERSECTION, not
// by sampling rays through the frustum. A sampled fit is not merely imprecise,
// it is unsound: the widest visible ground sits where a ray stops being clipped
// by the depth reach and starts being clipped by the ground slab, and that
// crossing lies between samples at an arbitrary screen position, not on the
// frustum rim where a grid would look for it.

/** How far PAST the orbit target one map is asked to reach, as a multiple of
 *  the orbit distance. The battle rig ties distance to zoom, so this is the zoom
 *  law: tactical framings buy density, the strategic framing buys back the field. */
const SHADOW_COVERAGE_DISTANCE_FACTOR = 1.6;
/** Floor: the near formations plus the ground between them at max zoom-in. */
export const SHADOW_COVERAGE_MIN = 160;
/** Ceiling: past this the receiver rect below is the binding bound anyway, so
 *  the fit degrades back to whole-map density rather than past it. */
const SHADOW_COVERAGE_MAX = 2400;
/** Ground slack past the playable rect: the field mesh's own skirt, and the
 *  open (north/south) edges, which carry no blocker. The sealed west/east band
 *  is a receiver region in its own right — BATTLE_HORIZON_BOUNDS. */
export const SHADOW_RECEIVER_MARGIN = 120;

/** Tallest ON-FIELD receiver above the ground datum — a max-scale tree (species
 *  height 1.6 x instance scale 6.4 ~ 10.3) with headroom. Drives the light-plane
 *  box, so every unit of it costs texel density on the up-sun side. The sealed
 *  edges stand far higher and are carried as their own region instead, so this
 *  stays a tree's ceiling rather than a mountain's. */
export const SHADOW_RECEIVER_CEILING = 16;
/** Tallest battle CASTER above the ground datum: a sealed-edge peak, plus
 *  headroom for anything standing on one. Depth-only — it costs depth range,
 *  not texels — so it is spent across the whole fit, not just the edge band. */
export const SHADOW_CASTER_CEILING = BATTLE_HORIZON_BOUNDS.ceiling + 60;
/** Tallest CROWD caster — a mounted soldier. The crowd is the only audience
 *  culled per body, and a man does not throw a cliff's shadow, so its view
 *  stops here instead of at the cliff ceiling. */
export const SHADOW_CROWD_CASTER_CEILING = 6;
/** Ground datum slack below the field minimum: sealed-edge skirts and the
 *  vista band outside the playable rect sit lower than any sampled cell. */
const SHADOW_GROUND_MARGIN = 24;

/** Fitted extents live on a geometric ladder so the texel size is piecewise
 *  constant — a continuously resized map re-quantises the shadow every frame. */
const SHADOW_FIT_EXTENT_BASE = 32;
const SHADOW_FIT_EXTENT_RATIO = 1.25;
/** Texels of unused border kept inside the fit: absorbs the half-texel the
 *  centre snap moves and the PCF kernel's reach at the box edge. */
export const SHADOW_FIT_BORDER_TEXELS = 4;
/** Rungs the requirement must fall before the extent shrinks, so a camera
 *  hovering on a ladder boundary cannot pump the texel size. */
const SHADOW_FIT_SHRINK_RUNGS = 2;
/** Light-depth quantum: near/far move in steps so depth precision holds still. */
const SHADOW_DEPTH_QUANTUM = 4;
const SHADOW_FIT_NEAR = 1;

/** Normal offset expressed in TEXELS, because that is what the offset is for:
 *  clearing the depth quantisation of one texel. Held as a world constant it
 *  survives a density change as a soldier-wide push that detaches the shadow
 *  from his feet. At the canonical 2.894962 units/texel this reproduces 0.608,
 *  the 0.6 the whole-map default already ships. */
const SHADOW_NORMAL_BIAS_TEXELS = 0.21;
/** Floor so a very dense fit keeps some acne protection. */
const SHADOW_NORMAL_BIAS_MIN = 0.02;

export function shadowNormalBiasFor(worldUnitsPerTexel: number): number {
  return Math.max(SHADOW_NORMAL_BIAS_MIN, SHADOW_NORMAL_BIAS_TEXELS * worldUnitsPerTexel);
}

export function shadowCoverageRadius(cameraDistance: number): number {
  const wanted =
    (Number.isFinite(cameraDistance) ? cameraDistance : 0) * SHADOW_COVERAGE_DISTANCE_FACTOR;
  return Math.min(SHADOW_COVERAGE_MAX, Math.max(SHADOW_COVERAGE_MIN, wanted));
}

/** Smallest ladder rung whose usable interior (extent less the border texels)
 *  still covers `required`. */
export function shadowExtentRung(required: number, mapSize: number): number {
  const usable = 1 - (2 * SHADOW_FIT_BORDER_TEXELS) / Math.max(16, mapSize);
  const need = Math.max(1e-6, required) / usable;
  const rung = Math.ceil(
    Math.log(need / SHADOW_FIT_EXTENT_BASE) / Math.log(SHADOW_FIT_EXTENT_RATIO),
  );
  return Math.max(0, rung);
}

export function shadowExtentForRung(rung: number): number {
  return SHADOW_FIT_EXTENT_BASE * Math.pow(SHADOW_FIT_EXTENT_RATIO, Math.max(0, rung));
}

/** Holds the fitted extent across frames. Growth is immediate (a rung too small
 *  crops); shrinking waits out a deadband so a camera hovering on a boundary
 *  does not pump the texel size. */
export class ShadowFitStabilizer {
  private rung = 0;
  private settled = false;

  resolve(required: number, mapSize: number): number {
    const wanted = shadowExtentRung(required, mapSize);
    if (!this.settled || wanted > this.rung || wanted <= this.rung - SHADOW_FIT_SHRINK_RUNGS) {
      this.rung = wanted;
      this.settled = true;
    }
    return shadowExtentForRung(this.rung);
  }

  reset(): void {
    this.settled = false;
    this.rung = 0;
  }
}

/** The orthonormal frame three builds for the shadow camera, reproduced here so
 *  a fit computed on the CPU lands on the same texels three rasterises.
 *  `depth` points FROM the scene TOWARD the sun (three's lookAt +Z). */
export interface ShadowLightBasis {
  right: Vec3;
  upAxis: Vec3;
  depth: Vec3;
  /** The `up` three's lookAt must use to rebuild this basis. */
  up: Vec3;
}

export function shadowLightBasis(
  unitSunDirection: readonly [number, number, number],
): ShadowLightBasis {
  const depth = unit3(unitSunDirection, [0, 0, 1]);
  // Three's shadow camera keeps its default +Y up; only a sun lying along it
  // would degenerate the cross product.
  const up: Vec3 = Math.abs(depth[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
  const right = unit3(cross3(up, depth), [1, 0, 0]);
  return { right, upAxis: cross3(depth, right), depth, up };
}

/** World AABB of the receivers one camera can see — the coverage region. */
export interface ShadowReceiverBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface ShadowViewFitInput {
  /** The one projection owner's parameters, as posed for this frame. */
  camera: Camera3DParams;
  /** Terrain rect (x, y, w, h). The fit clamps to it widened by
   *  SHADOW_RECEIVER_MARGIN, so the sealed-edge band still belongs to the map. */
  rect: readonly [number, number, number, number];
  /** Lowest and highest rendered ground Z across the field. */
  elevation: readonly [number, number];
  unitSunDirection: readonly [number, number, number];
  mapSize: number;
  /** Omit for a stateless fit; supply to carry extent hysteresis across frames. */
  stabilizer?: ShadowFitStabilizer;
}

export interface ShadowViewFit {
  target: Vec3;
  position: Vec3;
  /** `up` the shadow camera must carry for this fit's basis. */
  up: Vec3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  /** Square light-plane extent actually fitted, world units across. */
  extent: number;
  worldUnitsPerTexel: number;
  /** Normal offset this density wants — the rig's, not a free knob. */
  normalBias: number;
  /** Near distance for the CROWD's share of this map. The map itself reaches
   *  back to the cliff ceiling; bodies do not cast that far, and the crowd is
   *  the one audience that pays per body for the difference. */
  crowdNear: number;
  /** What this camera asked one map to reach past its orbit target. Evidence. */
  coverage: number;
  /** The receiver regions this fit promises to cover without cropping: the
   *  visible share of the field, and the visible share of each sealed edge. */
  regions: readonly ShadowReceiverBox[];
}

// ---------------------------------------------------------------------------
// The visible receiver set, as a convex intersection
//
// Three convex bodies decide what one map owes this camera:
//   VOLUME   the view frustum, truncated at the coverage reach
//   DOMAIN   the receiver regions (field slab; sealed-edge bands) below
//   BALL     the reach itself, |p - eye| <= reach
// The answer is AABB(VOLUME n DOMAIN n BALL), per region. Both bounds below are
// supersets of BALL, so intersecting them is conservative in the only direction
// that matters — the fit can promise more ground than it has to, never less:
//   - a far plane at view DEPTH `reach`, since depth <= |p - eye| always;
//   - BALL's own AABB, [eye - reach, eye + reach] per axis, which the far plane
//     cannot supply and which is what actually tightens a grazing framing.

/** Six inward half-spaces (n.p + d >= 0) and the six quad faces of the
 *  truncated frustum. Reused across fits; the fit itself is the only caller. */
interface ViewVolume {
  planes: Float64Array;
  faces: Float64Array;
}

const VIEW_VOLUME: ViewVolume = { planes: new Float64Array(24), faces: new Float64Array(72) };
const VOLUME_CORNERS = new Float64Array(24);
/** Near quad 0-3, far quad 4-7, then the four sides. */
const VOLUME_QUADS = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];
/** A quad meeting twelve half-spaces gains at most one vertex per plane. */
const CLIP_A = new Float64Array(72);
const CLIP_B = new Float64Array(72);
const REGION_PLANES = new Float64Array(24);
const REGION_FACES = new Float64Array(72);

function viewVolume(camera: Camera3DParams, eye: Vec3, reach: number): ViewVolume {
  const forward = unit3(sub3(camera.target, eye), [1, 0, 0]);
  const right = unit3(cross3(forward, [0, 0, 1]), [1, 0, 0]);
  const up = cross3(right, forward);
  const tanY = Math.tan(Math.min(Math.max(camera.fovY, 1e-3), Math.PI - 1e-3) / 2);
  const tanX = tanY * Math.max(1e-3, camera.aspect);
  const near = Math.max(1e-3, camera.near);
  const far = Math.max(near + 1e-3, reach);
  const eyeDepth = forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2];

  const planes = VIEW_VOLUME.planes;
  planes.set([forward[0], forward[1], forward[2], -eyeDepth - near], 0);
  planes.set([-forward[0], -forward[1], -forward[2], eyeDepth + far], 4);
  // A side plane is |p.axis| <= tan * depth written as one linear form, so the
  // frustum needs no normalisation to be clipped against.
  let slot = 8;
  for (const [axis, tan] of [
    [right, tanX],
    [up, tanY],
  ] as const) {
    for (const sign of [1, -1]) {
      const nx = tan * forward[0] - sign * axis[0];
      const ny = tan * forward[1] - sign * axis[1];
      const nz = tan * forward[2] - sign * axis[2];
      planes.set([nx, ny, nz, -(nx * eye[0] + ny * eye[1] + nz * eye[2])], slot);
      slot += 4;
    }
  }

  let corner = 0;
  for (const depth of [near, far]) {
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      for (let axis = 0; axis < 3; axis++) {
        VOLUME_CORNERS[corner++] =
          eye[axis] + depth * (forward[axis] + sx * tanX * right[axis] + sy * tanY * up[axis]);
      }
    }
  }
  const faces = VIEW_VOLUME.faces;
  for (let q = 0; q < 6; q++) {
    for (let v = 0; v < 4; v++) {
      const from = VOLUME_QUADS[q][v] * 3;
      const to = q * 12 + v * 3;
      faces[to] = VOLUME_CORNERS[from];
      faces[to + 1] = VOLUME_CORNERS[from + 1];
      faces[to + 2] = VOLUME_CORNERS[from + 2];
    }
  }
  return VIEW_VOLUME;
}

/** Sutherland-Hodgman against one half-space. Convex in, convex out. */
function clipPolygon(
  src: Float64Array,
  count: number,
  dst: Float64Array,
  nx: number,
  ny: number,
  nz: number,
  d: number,
): number {
  let out = 0;
  for (let i = 0; i < count; i++) {
    const a = i * 3;
    const b = ((i + 1) % count) * 3;
    const da = src[a] * nx + src[a + 1] * ny + src[a + 2] * nz + d;
    const db = src[b] * nx + src[b + 1] * ny + src[b + 2] * nz + d;
    if (da >= 0) {
      dst[out++] = src[a];
      dst[out++] = src[a + 1];
      dst[out++] = src[a + 2];
    }
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      dst[out++] = src[a] + (src[b] - src[a]) * t;
      dst[out++] = src[a + 1] + (src[b + 1] - src[a + 1]) * t;
      dst[out++] = src[a + 2] + (src[b + 2] - src[a + 2]) * t;
    }
  }
  return out / 3;
}

/** One quad (4 vertices at `faces[offset]`) run through `planeCount` planes,
 *  with the survivors folded into `span`. */
function foldClippedFace(
  faces: Float64Array,
  offset: number,
  planes: Float64Array,
  planeCount: number,
  span: number[],
): boolean {
  let source = CLIP_A;
  let target = CLIP_B;
  for (let i = 0; i < 12; i++) source[i] = faces[offset + i];
  let count = 4;
  for (let i = 0; i < planeCount && count > 0; i++) {
    count = clipPolygon(
      source,
      count,
      target,
      planes[i * 4],
      planes[i * 4 + 1],
      planes[i * 4 + 2],
      planes[i * 4 + 3],
    );
    const swap = source;
    source = target;
    target = swap;
  }
  for (let v = 0; v < count; v++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = source[v * 3 + axis];
      if (value < span[axis]) span[axis] = value;
      if (value > span[axis + 3]) span[axis + 3] = value;
    }
  }
  return count > 0;
}

/** Exact AABB of the view volume intersected with an axis-aligned region, or
 *  null when they miss. The boundary of a convex intersection is
 *  (dA n B) u (dB n A), so clipping BOTH bodies' faces against the other's
 *  half-spaces and taking the extremes of what survives is exact — nothing is
 *  sampled, so no direction can be stepped past. */
function clipRegion(volume: ViewVolume, region: ShadowReceiverBox): ShadowReceiverBox | null {
  REGION_PLANES.set([
    1,
    0,
    0,
    -region.x0,
    -1,
    0,
    0,
    region.x1,
    0,
    1,
    0,
    -region.y0,
    0,
    -1,
    0,
    region.y1,
    0,
    0,
    1,
    -region.z0,
    0,
    0,
    -1,
    region.z1,
  ]);
  const { x0, y0, z0, x1, y1, z1 } = region;
  REGION_FACES.set([
    x0,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y1,
    z0,
    x0,
    y1,
    z0,
    x0,
    y0,
    z1,
    x1,
    y0,
    z1,
    x1,
    y1,
    z1,
    x0,
    y1,
    z1,
    x0,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y0,
    z1,
    x0,
    y0,
    z1,
    x0,
    y1,
    z0,
    x1,
    y1,
    z0,
    x1,
    y1,
    z1,
    x0,
    y1,
    z1,
    x0,
    y0,
    z0,
    x0,
    y1,
    z0,
    x0,
    y1,
    z1,
    x0,
    y0,
    z1,
    x1,
    y0,
    z0,
    x1,
    y1,
    z0,
    x1,
    y1,
    z1,
    x1,
    y0,
    z1,
  ]);
  const span = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let met = false;
  for (let face = 0; face < 6; face++) {
    if (foldClippedFace(volume.faces, face * 12, REGION_PLANES, 6, span)) met = true;
    if (foldClippedFace(REGION_FACES, face * 12, volume.planes, 6, span)) met = true;
  }
  return met
    ? { x0: span[0], y0: span[1], z0: span[2], x1: span[3], y1: span[4], z1: span[5] }
    : null;
}

/** The receiver domain, as the regions it is actually made of: the field slab,
 *  and the two sealed edges, whose blockers stand ten times higher than any
 *  tree. Keeping them apart is what lets a mountain be covered without every
 *  framing paying a mountain's worth of light-plane span across the whole field. */
function receiverDomain(
  rect: readonly [number, number, number, number],
  groundLo: number,
  groundHi: number,
): ShadowReceiverBox[] {
  const west = rect[0];
  const east = rect[0] + rect[2];
  const band = BATTLE_HORIZON_BOUNDS;
  const bandSlab = { z0: groundLo - band.drop, z1: groundHi + band.ceiling };
  const bandY = { y0: rect[1] - band.overhang, y1: rect[1] + rect[3] + band.overhang };
  return [
    {
      x0: west - SHADOW_RECEIVER_MARGIN,
      x1: east + SHADOW_RECEIVER_MARGIN,
      y0: rect[1] - SHADOW_RECEIVER_MARGIN,
      y1: rect[1] + rect[3] + SHADOW_RECEIVER_MARGIN,
      z0: groundLo,
      z1: groundHi + SHADOW_RECEIVER_CEILING,
    },
    { x0: west - band.reach, x1: west + band.lap, ...bandY, ...bandSlab },
    { x0: east - band.lap, x1: east + band.reach, ...bandY, ...bandSlab },
  ];
}

/** Every receiver region this camera can see, clipped to what it can see of it.
 *  Empty when the framing holds no receiver at all (a sky-only pose, or a camera
 *  parked off the field). */
function visibleReceiverRegions(
  camera: Camera3DParams,
  eye: Vec3,
  rect: readonly [number, number, number, number],
  groundLo: number,
  groundHi: number,
  coverage: number,
): ShadowReceiverBox[] {
  const reach = Math.max(camera.near, camera.distance) + coverage;
  const volume = viewVolume(camera, eye, reach);
  const visible: ShadowReceiverBox[] = [];
  for (const region of receiverDomain(rect, groundLo, groundHi)) {
    // The reach ball's own AABB, applied before the volume clip. The far plane
    // bounds view depth; this bounds each world axis, and on a grazing framing
    // that is the tighter of the two by a wide margin.
    const capped: ShadowReceiverBox = {
      x0: Math.max(region.x0, eye[0] - reach),
      x1: Math.min(region.x1, eye[0] + reach),
      y0: Math.max(region.y0, eye[1] - reach),
      y1: Math.min(region.y1, eye[1] + reach),
      z0: Math.max(region.z0, eye[2] - reach),
      z1: Math.min(region.z1, eye[2] + reach),
    };
    if (capped.x1 <= capped.x0 || capped.y1 <= capped.y0 || capped.z1 <= capped.z0) continue;
    const clipped = clipRegion(volume, capped);
    if (clipped) visible.push(clipped);
  }
  return visible;
}

/** One orthographic map fitted to the ground the camera can see, holding every
 *  offscreen caster that reaches it, snapped to its own texel grid. */
export function viewShadowFit(input: ShadowViewFitInput): ShadowViewFit {
  const mapSize = Math.max(16, Math.floor(input.mapSize));
  const basis = shadowLightBasis(input.unitSunDirection);
  const coverage = shadowCoverageRadius(input.camera.distance);
  const groundLo = Math.min(input.elevation[0], input.elevation[1]) - SHADOW_GROUND_MARGIN;
  const groundHi = Math.max(input.elevation[0], input.elevation[1]);
  const eye = eyePosition(input.camera);
  const regions = visibleReceiverRegions(
    input.camera,
    eye,
    input.rect,
    groundLo,
    groundHi,
    coverage,
  );
  if (regions.length === 0) {
    // Nothing this camera can see is a receiver (a sky-only pose, or a camera
    // parked off the field). Keep a legal, stable map on the orbit target
    // rather than an empty or an infinite one.
    const half = SHADOW_COVERAGE_MIN / 2;
    regions.push({
      x0: input.camera.target[0] - half,
      x1: input.camera.target[0] + half,
      y0: input.camera.target[1] - half,
      y1: input.camera.target[1] + half,
      z0: groundLo,
      z1: groundHi + SHADOW_RECEIVER_CEILING,
    });
  }

  // The receiver regions give all three light-space bounds. Casters are then
  // admitted by pushing the near side UP THE SUN RAY: a caster `h` above the
  // receiver it shades sits h/sin(sun elevation) nearer the light and, by the
  // invariant above, at the same light-plane XY — so no texel is spent on it.
  // Folding the regions SEPARATELY is what keeps the edge band's height off the
  // middle of the field: a union box would pair a mountain's z with the field's x.
  let lxMin = Infinity,
    lxMax = -Infinity,
    lyMin = Infinity,
    lyMax = -Infinity,
    ldMin = Infinity,
    ldMax = -Infinity;
  for (const region of regions) {
    for (const x of [region.x0, region.x1]) {
      for (const y of [region.y0, region.y1]) {
        for (const z of [region.z0, region.z1]) {
          const lx = x * basis.right[0] + y * basis.right[1] + z * basis.right[2];
          const ly = x * basis.upAxis[0] + y * basis.upAxis[1] + z * basis.upAxis[2];
          const ld = x * basis.depth[0] + y * basis.depth[1] + z * basis.depth[2];
          if (lx < lxMin) lxMin = lx;
          if (lx > lxMax) lxMax = lx;
          if (ly < lyMin) lyMin = ly;
          if (ly > lyMax) lyMax = ly;
          if (ld < ldMin) ldMin = ld;
          if (ld > ldMax) ldMax = ld;
        }
      }
    }
  }
  // A sun on the horizon would send this to infinity; the presets sit at 14-70
  // degrees, and the clamp keeps a pathological one merely wasteful.
  const casterLift = (ceiling: number) => ceiling / Math.max(0.05, basis.depth[2]);
  const ldCasterMax = ldMax + casterLift(SHADOW_CASTER_CEILING);
  const ldCrowdMax = ldMax + casterLift(SHADOW_CROWD_CASTER_CEILING);

  const required = Math.max(lxMax - lxMin, lyMax - lyMin);
  const extent = input.stabilizer
    ? input.stabilizer.resolve(required, mapSize)
    : shadowExtentForRung(shadowExtentRung(required, mapSize));
  const worldUnitsPerTexel = extent / mapSize;
  // Snapping is meaningful only because the light basis is world-anchored: the
  // same world point keeps the same texel until the extent itself changes rung.
  const cx = Math.round((lxMin + lxMax) / 2 / worldUnitsPerTexel) * worldUnitsPerTexel;
  const cy = Math.round((lyMin + lyMax) / 2 / worldUnitsPerTexel) * worldUnitsPerTexel;
  const half = extent / 2;
  const nearPlane = Math.ceil(ldCasterMax / SHADOW_DEPTH_QUANTUM) * SHADOW_DEPTH_QUANTUM;
  const farPlane = Math.floor(ldMin / SHADOW_DEPTH_QUANTUM) * SHADOW_DEPTH_QUANTUM;
  const near = SHADOW_FIT_NEAR;
  const far = near + Math.max(SHADOW_DEPTH_QUANTUM, nearPlane - farPlane);
  const eyeDepth = nearPlane + near;
  const position: Vec3 = [
    basis.right[0] * cx + basis.upAxis[0] * cy + basis.depth[0] * eyeDepth,
    basis.right[1] * cx + basis.upAxis[1] * cy + basis.depth[1] * eyeDepth,
    basis.right[2] * cx + basis.upAxis[2] * cy + basis.depth[2] * eyeDepth,
  ];
  // Back down the SAME axis, so position - target still reproduces the sun
  // direction the environment owns, to the bit.
  const lookDistance = (near + far) / 2;
  const target: Vec3 = [
    position[0] - basis.depth[0] * lookDistance,
    position[1] - basis.depth[1] * lookDistance,
    position[2] - basis.depth[2] * lookDistance,
  ];
  return {
    target,
    position,
    up: basis.up,
    left: -half,
    right: half,
    top: half,
    bottom: -half,
    near,
    far,
    extent,
    worldUnitsPerTexel,
    normalBias: shadowNormalBiasFor(worldUnitsPerTexel),
    crowdNear: Math.min(far, Math.max(near, eyeDepth - ldCrowdMax)),
    coverage,
    regions,
  };
}

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit3(v: readonly number[], fallback: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-9 ? [v[0] / length, v[1] / length, v[2] / length] : [...fallback];
}
