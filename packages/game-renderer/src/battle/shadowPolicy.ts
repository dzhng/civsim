/** Shadow quality and fit policy shared by source and comparison runtimes.
 * The whole-map fit below is the COMPARISON baseline and the no-camera
 * fallback; `viewShadowFit` further down is the camera-relevant fit the battle
 * rig runs per frame. Both live here so one owner answers "where does the sun
 * map point, and how wide is a texel". */
import { eyePosition, type Camera3DParams, type Vec3 } from "../../../renderer-core/src/camera3d";

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

/** How far PAST the orbit target one map is asked to reach, as a multiple of
 *  the orbit distance. The battle rig ties distance to zoom, so this is the zoom
 *  law: tactical framings buy density, the strategic framing buys back the field. */
const SHADOW_COVERAGE_DISTANCE_FACTOR = 1.6;
/** Floor: the near formations plus the ground between them at max zoom-in. */
export const SHADOW_COVERAGE_MIN = 160;
/** Ceiling: past this the receiver rect below is the binding bound anyway, so
 *  the fit degrades back to whole-map density rather than past it. */
const SHADOW_COVERAGE_MAX = 2400;
/** Receiver domain outside the playable rect: the sealed-edge cliff band that
 *  throws onto the field (nearest horizon row sits ~86 units beyond the edge). */
export const SHADOW_RECEIVER_MARGIN = 120;

/** Tallest battle RECEIVER above the ground datum — a max-scale tree (species
 *  height 1.6 x instance scale 6.4 ~ 10.3) with headroom. Drives the light-plane
 *  box, so every unit of it costs texel density on the up-sun side. */
export const SHADOW_RECEIVER_CEILING = 16;
/** Tallest battle CASTER above the ground datum — the horizon blocker peaks
 *  (row height 226 x 1.29 jitter ~ 292) that are meant to throw long shadows
 *  onto the field at low sun. Depth-only: it costs depth range, not texels. */
export const SHADOW_CASTER_CEILING = 360;
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
/** Slack on the sampled view box, covering the gap between samples. */
const SHADOW_FIT_PAD = 6;
/** Frustum samples per axis when measuring the visible ground. The lateral
 *  extremes of a pinhole frustum sit on the rim at zero offset in the other
 *  axis, so an odd grid lands on them exactly. */
const VIEW_SAMPLES = 7;

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
  const wanted = (Number.isFinite(cameraDistance) ? cameraDistance : 0) * SHADOW_COVERAGE_DISTANCE_FACTOR;
  return Math.min(SHADOW_COVERAGE_MAX, Math.max(SHADOW_COVERAGE_MIN, wanted));
}

/** Smallest ladder rung whose usable interior (extent less the border texels)
 *  still covers `required`. */
export function shadowExtentRung(required: number, mapSize: number): number {
  const usable = 1 - (2 * SHADOW_FIT_BORDER_TEXELS) / Math.max(16, mapSize);
  const need = Math.max(1e-6, required) / usable;
  const rung = Math.ceil(Math.log(need / SHADOW_FIT_EXTENT_BASE) / Math.log(SHADOW_FIT_EXTENT_RATIO));
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

export function shadowLightBasis(unitSunDirection: readonly [number, number, number]): ShadowLightBasis {
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
  /** The receiver region this fit promises to cover without cropping. */
  box: ShadowReceiverBox;
}

/** Ground the camera can see, bounded by the view reach, the receiver slab and
 *  the receiver domain. Sampled across the frustum: rays that never enter the
 *  slab (everything above the horizon) contribute nothing, and rays that skim it
 *  stop at `reach` — which is what keeps a horizon framing bounded. */
function visibleReceiverBox(
  camera: Camera3DParams,
  rect: readonly [number, number, number, number],
  zLo: number,
  zHi: number,
  coverage: number,
): ShadowReceiverBox {
  const eye = eyePosition(camera);
  const forward = unit3(sub3(camera.target, eye), [1, 0, 0]);
  const right = unit3(cross3(forward, [0, 0, 1]), [1, 0, 0]);
  const up = cross3(right, forward);
  const tanY = Math.tan(Math.min(Math.max(camera.fovY, 1e-3), Math.PI - 1e-3) / 2);
  const tanX = tanY * Math.max(1e-3, camera.aspect);
  const near = Math.max(1e-3, camera.near);
  const reach = Math.max(near, camera.distance) + coverage;

  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    seen = false;
  // Scalar throughout: this runs every frame, and a per-ray vector would be the
  // only allocation the fit makes.
  for (let i = 0; i < VIEW_SAMPLES; i++) {
    const sx = -1 + (2 * i) / (VIEW_SAMPLES - 1);
    for (let j = 0; j < VIEW_SAMPLES; j++) {
      const sy = -1 + (2 * j) / (VIEW_SAMPLES - 1);
      const dx = forward[0] + sx * tanX * right[0] + sy * tanY * up[0];
      const dy = forward[1] + sx * tanX * right[1] + sy * tanY * up[1];
      const dz = forward[2] + sx * tanX * right[2] + sy * tanY * up[2];
      const length = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / length,
        uy = dy / length,
        uz = dz / length;
      // March to the orbit target and `coverage` past it. Bounding the RAY is
      // what keeps a horizon framing finite: a ray that skims the slab runs out
      // of reach instead of fitting a box out to the vanishing point.
      let enter = near,
        exit = reach;
      if (Math.abs(uz) < 1e-9) {
        if (eye[2] < zLo || eye[2] > zHi) continue;
      } else {
        const ta = (zLo - eye[2]) / uz;
        const tb = (zHi - eye[2]) / uz;
        enter = Math.max(enter, Math.min(ta, tb));
        exit = Math.min(exit, Math.max(ta, tb));
      }
      if (exit < enter) continue;
      seen = true;
      for (let end = 0; end < 2; end++) {
        const t = end === 0 ? enter : exit;
        const px = eye[0] + ux * t;
        const py = eye[1] + uy * t;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
    }
  }
  if (!seen) {
    // Nothing in the slab is in frame (a sky-only pose). Keep a legal, stable
    // box on the orbit target rather than an empty or infinite one.
    const half = SHADOW_COVERAGE_MIN / 2;
    x0 = camera.target[0] - half;
    x1 = camera.target[0] + half;
    y0 = camera.target[1] - half;
    y1 = camera.target[1] + half;
  }
  x0 -= SHADOW_FIT_PAD;
  y0 -= SHADOW_FIT_PAD;
  x1 += SHADOW_FIT_PAD;
  y1 += SHADOW_FIT_PAD;
  // The rays already stopped at `reach`; the receiver domain is the only other
  // bound, and ground outside it carries no shadow today either.
  const x = tightenSpan(
    [x0, x1],
    [rect[0] - SHADOW_RECEIVER_MARGIN, rect[0] + rect[2] + SHADOW_RECEIVER_MARGIN],
  );
  const y = tightenSpan(
    [y0, y1],
    [rect[1] - SHADOW_RECEIVER_MARGIN, rect[1] + rect[3] + SHADOW_RECEIVER_MARGIN],
  );
  return { x0: x[0], y0: y[0], x1: x[1], y1: y[1], z0: zLo, z1: zHi };
}

/** One orthographic map fitted to the ground the camera can see, holding every
 *  offscreen caster that reaches it, snapped to its own texel grid. */
export function viewShadowFit(input: ShadowViewFitInput): ShadowViewFit {
  const mapSize = Math.max(16, Math.floor(input.mapSize));
  const basis = shadowLightBasis(input.unitSunDirection);
  const coverage = shadowCoverageRadius(input.camera.distance);
  const groundLo = Math.min(input.elevation[0], input.elevation[1]) - SHADOW_GROUND_MARGIN;
  const groundHi = Math.max(input.elevation[0], input.elevation[1]);
  const box = visibleReceiverBox(
    input.camera,
    input.rect,
    groundLo,
    groundHi + SHADOW_RECEIVER_CEILING,
    coverage,
  );

  // The receiver box gives all three light-space bounds. Casters are then
  // admitted by pushing the near side UP THE SUN RAY: a caster `h` above the
  // receiver it shades sits h/sin(sun elevation) nearer the light and, by the
  // invariant above, at the same light-plane XY — so no texel is spent on it.
  let lxMin = Infinity,
    lxMax = -Infinity,
    lyMin = Infinity,
    lyMax = -Infinity,
    ldMin = Infinity,
    ldMax = -Infinity;
  for (const x of [box.x0, box.x1]) {
    for (const y of [box.y0, box.y1]) {
      for (const z of [box.z0, box.z1]) {
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
    box,
  };
}

/** The sampled span, trimmed to a bound. A camera parked off the receiver domain
 *  intersects to nothing; the sampled span is still the honest answer there, so
 *  an empty intersection keeps it rather than collapsing the map to a point. */
function tightenSpan(
  span: readonly [number, number],
  bound: readonly [number, number],
): [number, number] {
  const lo = Math.max(span[0], bound[0]);
  const hi = Math.min(span[1], bound[1]);
  return hi > lo ? [lo, hi] : [span[0], span[1]];
}

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: readonly number[], b: readonly number[]): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function unit3(v: readonly number[], fallback: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-9 ? [v[0] / length, v[1] / length, v[2] / length] : [...fallback];
}
