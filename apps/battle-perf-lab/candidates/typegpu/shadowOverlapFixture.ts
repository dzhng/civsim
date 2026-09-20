/** The receiver-side cascade gate's fixture and its INDEPENDENT oracle.
 *
 * What this exists to prove: that the High receiver, bound through the actual
 * `sunSamplingLayout` depth ARRAY, reads cascade 0 from layer 0 and cascade 1
 * from layer 1, and blends them with the fade the shared sampler documents.
 * The single-map source comparison already prices the PCF/bias contract; it
 * cannot see a layer index, an overlap weight or the terminal fade, because it
 * binds one map and one record.
 *
 * Method. The fit, the camera, the environment and the packed receiver block
 * are all GENUINE — the same `NativeShadowFrame('csm')` the world runs. Only
 * the depth CONTENT is synthetic: each array layer is cleared to its own known
 * constant, so a cascade's own comparison collapses to a known 0 or 1 and the
 * fragment's output is the blend weight alone. Expected values are hand-derived
 * closed forms (see README) evaluated at probe depths chosen so the fade
 * formula collapses: the first cascade's unfaded near half, both internal
 * overlap edges, the overlap quarter points and midpoint, the second cascade's
 * interior, the terminal fade, and depths outside every interval.
 *
 * This file NEVER calls the production blend (`cascadeBlendWeight`) or the
 * shared WGSL. It reads the packed block's own numbers and applies its own
 * arithmetic, so a defect in either owner shows up as a disagreement.
 */
import {
  CIVSIM_ENVIRONMENTS,
  type CivsimEnvironment,
} from "../../../../packages/game-renderer/src/environment/environment";
import {
  eyePosition,
  viewMatrix,
  type Camera3DParams,
  type Vec3,
} from "../../../../packages/renderer-core/src/camera3d";
import { NativeShadowFrame } from "../../../../packages/battle-renderer/src/shadowData";
import {
  SUN_CASCADE_RECORD_FLOATS,
  SUN_SHADOW_BLOCK_FLOATS,
  SUN_SHADOW_CONTROL_OFFSET,
} from "../../../../packages/battle-renderer/src/shaders/shadow";
import { CSM_CASCADES } from "../../../../packages/game-renderer/src/battle/shadowPolicy";
import type { FrameCameraSnapshot } from "../../../../packages/battle-renderer/src/frameCamera";

/** The camera uniform's viewport. The probe target is one texel per probe and
 *  is a readback surface, not a viewport — the projection this fit and this
 *  receiver were derived from is a real battle framebuffer's. */
export const CHECK_VIEWPORT = { width: 1280, height: 800 } as const;
export const CHECK_ENVIRONMENT: CivsimEnvironment = CIVSIM_ENVIRONMENTS.golden;
/** The same posed camera the TypeGPU shadow resource tests fit against, at this
 *  check's viewport aspect. Genuine `Camera3DParams`, not a contrived box. */
export const CHECK_CAMERA: Camera3DParams = {
  target: [0, 0, 0],
  distance: 220,
  pitch: 0.6,
  yaw: 0.4,
  fovY: 0.85,
  aspect: CHECK_VIEWPORT.width / CHECK_VIEWPORT.height,
  near: 1,
};
/** The receiver's shading normal. The sampler offsets the receiver by
 *  `normal * normalBias` before projecting, so this is a sampling input. */
export const CHECK_NORMAL: Vec3 = [0, 0, 1];

/** The cleared depths the two array layers hold, in reverse-Z depth: a receiver
 *  is LIT where its own biased depth compares greater-equal to what its layer
 *  holds. `beyondEveryProbe` sits past every probe's depth, so that layer
 *  occludes; `beforeEveryProbe` sits in front of them all, so that layer does
 *  not. `betweenTheCascades` is the one that makes a wrong-layer read visible
 *  EVERYWHERE: this fit puts the two cascades' biased receiver depths in
 *  disjoint bands, and that value lies between them, so it occludes cascade 1's
 *  receivers while leaving cascade 0's lit. Without it a layer swap would
 *  cancel exactly at the break, where the two weights are equal. */
export const CLEARED_DEPTHS = {
  beyondEveryProbe: 0.9,
  beyondEveryProbeAlternate: 0.95,
  betweenTheCascades: 0.62,
  beforeEveryProbe: 0.1,
  beforeEveryProbeAlternate: 0.05,
} as const;
/** Every weighted probe's biased depth must stand at least this far from EVERY
 *  cleared value in play, in either layer assignment, so no comparison in this
 *  fixture — baseline or mutated — is ever decided by float noise. */
export const MIN_COMPARE_SEPARATION = 0.05;

export interface LayerConfiguration {
  name: string;
  /** Cleared depth per array layer, layer 0 first. */
  clears: readonly [number, number];
  /** What each cascade's own `shadowVisibility` therefore returns inside its
   *  map: 0 occluded, 1 lit. Determined by the clears above, not measured. */
  visibility: readonly [0 | 1, 0 | 1];
}

/** The four layer contents this gate runs. The first two isolate one cascade's
 *  contribution each and are the swap-sensitive pair; the last two are
 *  swap-insensitive on purpose and isolate the weight sum and the lit floor.
 *  Between them every probe that any cascade weights changes answer under a
 *  layer swap — the fixture proves that rather than assuming it. */
export const LAYER_CONFIGURATIONS: readonly LayerConfiguration[] = [
  {
    name: "cascade-0-occluded",
    clears: [CLEARED_DEPTHS.beyondEveryProbe, CLEARED_DEPTHS.beforeEveryProbe],
    visibility: [0, 1],
  },
  {
    name: "cascade-1-occluded",
    clears: [CLEARED_DEPTHS.betweenTheCascades, CLEARED_DEPTHS.beyondEveryProbe],
    visibility: [1, 0],
  },
  {
    name: "both-occluded",
    clears: [CLEARED_DEPTHS.beyondEveryProbe, CLEARED_DEPTHS.beyondEveryProbeAlternate],
    visibility: [0, 0],
  },
  {
    name: "neither-occluded",
    clears: [CLEARED_DEPTHS.beforeEveryProbe, CLEARED_DEPTHS.beforeEveryProbeAlternate],
    visibility: [1, 1],
  },
];
/** Every cleared depth any configuration can put under any layer. */
const CLEARS_IN_PLAY = [...new Set(LAYER_CONFIGURATIONS.flatMap((c) => c.clears))];

export type ShadowCheckMutation = "none" | "layer-swap" | "receiver-swap";
export const SHADOW_CHECK_MUTATIONS: readonly ShadowCheckMutation[] = [
  "none",
  "layer-swap",
  "receiver-swap",
];
export function isShadowCheckMutation(value: unknown): value is ShadowCheckMutation {
  return SHADOW_CHECK_MUTATIONS.includes(value as ShadowCheckMutation);
}

/** f32 unit roundoff. The tolerance below is derived from this and the fit, and
 *  is fixed before any hardware runs — never widened to admit a measurement. */
const F32_ULP = 2 ** -24;
/** Stated bound on the receiver's linear depth error. The fragment forms it as
 *  a four-term dot against the view row (terms of order 1e3, so ~1e-4 absolute
 *  at f32), then subtracts the near plane and divides by the ~1.5e3 span,
 *  leaving ~2e-7; the remaining normalised operations add a few ulp. 1e-6 is
 *  the rounded-up bound, roughly three times the worst term. */
export const LINEAR_DEPTH_ERROR = 1e-6;

export interface ProbeCascadeSample {
  /** Shadow-map coordinate and biased compare reference, computed here. */
  uv: readonly [number, number];
  z: number;
  /** Whether the sampler's own bound admits this coordinate. A cascade the
   *  blend gives weight to MUST be admitted; the fixture rejects itself
   *  otherwise rather than passing on an unreachable sample. */
  inside: boolean;
}

export interface OverlapProbe {
  name: string;
  /** Why this depth is in the set. */
  role: string;
  /** Receiver linear depth `( -viewZ - znear ) / ( cappedFar - znear )`. */
  linearDepth: number;
  /** HAND-DERIVED cascade blend weights at this depth — the oracle. */
  weights: readonly [number, number];
  world: readonly [number, number, number];
  cascades: readonly ProbeCascadeSample[];
}

export interface ShadowOverlapFixture {
  environment: CivsimEnvironment;
  camera: Camera3DParams;
  snapshot: FrameCameraSnapshot;
  observer: Vec3;
  /** The genuine packed receiver block the world would upload. */
  receiver: Float32Array<ArrayBuffer>;
  /** World-to-view as the uniform will hold it (f32), row-major by column. */
  worldToView: Float32Array<ArrayBuffer>;
  znear: number;
  cappedFar: number;
  /** The internal break between the two cascades. */
  split: number;
  /** Both cascades' margin at that break — the overlap band's full width. */
  overlapMargin: number;
  /** The last cascade's margin at the capped far — the terminal fade's width. */
  terminalMargin: number;
  probes: readonly OverlapProbe[];
  configurations: readonly LayerConfiguration[];
  /** Fixed before hardware: the blend divides a linear-depth error by the
   *  narrowest margin in play, and two cascades accumulate. */
  tolerance: number;
  /** Expected shade per configuration per probe, from the hand-derived weights. */
  expected(configuration: LayerConfiguration, mutation: ShadowCheckMutation): number[];
  /** The block with its two cascade records exchanged — the receiver-corruption
   *  mutation. Same bytes, wrong owner per layer. */
  corruptedReceiver(): Float32Array<ArrayBuffer>;
}

/** Column-major 4x4 transform WITH the perspective divide, written here rather
 *  than imported so the oracle shares no arithmetic with the renderer. */
function project(m: ArrayLike<number>, v: readonly number[]): [number, number, number] {
  const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
  const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
  const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
  const w = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
  if (!(w !== 0 && Number.isFinite(w))) throw Error("Shadow probe projection is degenerate");
  return [x / w, y / w, z / w];
}

/** Everything the GPU reads as f32 is quantised here too, so the only
 *  difference left between the two sides is the order of arithmetic. */
function f32(values: ArrayLike<number>): Float32Array<ArrayBuffer> {
  return Float32Array.from(values);
}

export function shadowOverlapFixture(
  environment: CivsimEnvironment = CHECK_ENVIRONMENT,
  camera: Camera3DParams = CHECK_CAMERA,
): ShadowOverlapFixture {
  let packed: Float32Array<ArrayBuffer> | undefined;
  const frame = new NativeShadowFrame(environment, "csm", (data) => {
    packed = data.receiver.slice();
  });
  frame.update(camera);
  const receiver = packed;
  if (!receiver || receiver.length !== SUN_SHADOW_BLOCK_FLOATS)
    throw Error("High receiver block was not published");
  if (receiver[SUN_SHADOW_CONTROL_OFFSET + 1] !== CSM_CASCADES)
    throw Error("High fit did not publish both cascades");

  const cappedFar = receiver[SUN_SHADOW_CONTROL_OFFSET];
  const znear = Math.fround(camera.near);
  const record = (index: number) => {
    const at = index * SUN_CASCADE_RECORD_FLOATS;
    return {
      matrix: receiver.subarray(at, at + 16),
      depthBias: receiver[at + 16],
      normalBias: receiver[at + 17],
      interval: [receiver[at + 20], receiver[at + 21]] as const,
    };
  };
  const cascades = Array.from({ length: CSM_CASCADES }, (_, index) => record(index));
  const split = cascades[0].interval[1];
  if (split !== cascades[1].interval[0]) throw Error("Cascade intervals do not meet at one break");
  if (cascades[1].interval[1] !== 1) throw Error("Last cascade does not end at the capped far");
  // Both cascades take their margin from the edge NEAREST the sample, and in
  // the overlap band that edge is the shared break for both — which is why
  // their weights can sum to one there at all.
  const overlapMargin = 0.25 * split * split;
  const terminalMargin = 0.25 * cascades[1].interval[1] * cascades[1].interval[1];
  if (!(overlapMargin > 0 && overlapMargin < split))
    throw Error("Cascade split leaves no usable overlap band");

  const worldToView = f32(viewMatrix(camera));
  const eye = eyePosition(camera);
  // The view row's third axis, negated: the direction receiver depth grows in.
  const forward = [-worldToView[2], -worldToView[6], -worldToView[10]] as const;

  const overlapEdge = split + overlapMargin / 2;
  const terminalStart = 1 - terminalMargin;
  const definitions: {
    name: string;
    role: string;
    linearDepth: number;
    weights: [number, number];
  }[] = [
    {
      name: "before-near-plane",
      role: "outside every interval, in front of the receiver range",
      linearDepth: -overlapMargin,
      weights: [0, 0],
    },
    {
      name: "first-cascade-near-half",
      role: "the first cascade's unfaded near half — the zero-width-margin guard",
      linearDepth: split * 0.25,
      weights: [1, 0],
    },
    {
      name: "first-cascade-far-half",
      role: "past the first cascade's centre, still clear of the overlap band",
      linearDepth: split * 0.75,
      weights: [1, 0],
    },
    {
      name: "overlap-low-edge",
      role: "the overlap band's near boundary",
      linearDepth: split - overlapMargin / 2,
      weights: [1, 0],
    },
    {
      name: "overlap-quarter",
      role: "a quarter across the overlap band",
      linearDepth: split - overlapMargin / 4,
      weights: [0.75, 0.25],
    },
    {
      name: "overlap-midpoint",
      role: "the break itself — both cascades at half weight",
      linearDepth: split,
      weights: [0.5, 0.5],
    },
    {
      name: "overlap-three-quarter",
      role: "three quarters across the overlap band",
      linearDepth: split + overlapMargin / 4,
      weights: [0.25, 0.75],
    },
    {
      name: "overlap-high-edge",
      role: "the overlap band's far boundary",
      linearDepth: overlapEdge,
      weights: [0, 1],
    },
    {
      name: "second-cascade-interior",
      role: "between the overlap band and the terminal fade",
      linearDepth: (overlapEdge + terminalStart) / 2,
      weights: [0, 1],
    },
    {
      name: "terminal-fade-start",
      role: "where the last cascade begins fading to unshadowed",
      linearDepth: terminalStart,
      weights: [0, 1],
    },
    {
      name: "terminal-fade-half",
      role: "halfway through the terminal fade",
      linearDepth: 1 - terminalMargin / 2,
      weights: [0, 0.5],
    },
    {
      name: "terminal-fade-tail",
      role: "the terminal fade's tail",
      linearDepth: 1 - terminalMargin * 0.08,
      weights: [0, 0.08],
    },
    {
      name: "capped-far",
      role: "the capped far itself — fully faded out",
      linearDepth: 1,
      weights: [0, 0],
    },
    {
      name: "beyond-capped-far",
      role: "outside every interval, past the capped far",
      linearDepth: 1 + terminalMargin * 0.4,
      weights: [0, 0],
    },
  ];

  const probes: OverlapProbe[] = definitions.map((definition) => {
    const distance = znear + definition.linearDepth * (cappedFar - znear);
    const world = f32([
      eye[0] + forward[0] * distance,
      eye[1] + forward[1] * distance,
      eye[2] + forward[2] * distance,
    ]);
    const samples = cascades.map((cascade, index) => {
      const biased = [
        world[0] + CHECK_NORMAL[0] * cascade.normalBias,
        world[1] + CHECK_NORMAL[1] * cascade.normalBias,
        world[2] + CHECK_NORMAL[2] * cascade.normalBias,
      ];
      const coord = project(cascade.matrix, biased);
      const uv = [coord[0] * 0.5 + 0.5, 0.5 - coord[1] * 0.5] as const;
      const z = coord[2] - cascade.depthBias;
      const inside = uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1 && z >= 0 && z <= 1;
      if (definition.weights[index] > 0) {
        if (!inside)
          throw Error(`Probe ${definition.name} weights cascade ${index} outside its own map`);
        for (const clear of CLEARS_IN_PLAY)
          if (Math.abs(z - clear) < MIN_COMPARE_SEPARATION)
            throw Error(
              `Probe ${definition.name} depth ${z} sits within float noise of clear ${clear}`,
            );
        // The configurations declare what each cascade's comparison returns;
        // a table that no longer matches its own clears would quietly move the
        // oracle, so the clears decide and the declaration is checked.
        for (const configuration of LAYER_CONFIGURATIONS)
          if ((z >= configuration.clears[index] ? 1 : 0) !== configuration.visibility[index])
            throw Error(
              `Configuration ${configuration.name} misdeclares cascade ${index} at ${definition.name}`,
            );
      }
      return { uv, z, inside };
    });
    return { ...definition, world: [world[0], world[1], world[2]] as const, cascades: samples };
  });

  const tolerance = Math.max((2 * LINEAR_DEPTH_ERROR) / overlapMargin, 16 * F32_ULP);

  return {
    environment,
    camera,
    snapshot: {
      camera3d: camera,
      x: camera.target[0],
      y: camera.target[1],
      zoom: 1,
      width: CHECK_VIEWPORT.width,
      height: CHECK_VIEWPORT.height,
      sunAzimuth: environment.sunAzimuth,
      sunElevation: environment.sunElevation,
    },
    observer: eye,
    receiver,
    worldToView,
    znear,
    cappedFar,
    split,
    overlapMargin,
    terminalMargin,
    probes,
    configurations: LAYER_CONFIGURATIONS,
    tolerance,
    expected(configuration, mutation) {
      if (mutation === "receiver-swap")
        throw Error("A corrupted receiver block has no hand-derived expectation");
      return probes.map((probe) => {
        let shade = 1;
        for (let index = 0; index < CSM_CASCADES; index++) {
          const weight = probe.weights[index];
          if (weight === 0) continue;
          // A weighted cascade is admitted (asserted above), so its own
          // visibility is decided entirely by the layer it reads.
          const layer = mutation === "layer-swap" ? CSM_CASCADES - 1 - index : index;
          const visibility = probe.cascades[index].z >= configuration.clears[layer] ? 1 : 0;
          shade -= (1 - visibility) * weight;
        }
        return shade;
      });
    },
    corruptedReceiver() {
      const corrupted = receiver.slice();
      const span = SUN_CASCADE_RECORD_FLOATS;
      corrupted.set(receiver.subarray(span, span * 2), 0);
      corrupted.set(receiver.subarray(0, span), span);
      return corrupted;
    },
  };
}
