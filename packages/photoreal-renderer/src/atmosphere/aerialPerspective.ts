// aerialPerspective — THE one aerial-perspective owner (slice 10b). One TSL
// scatter/extinction function, applied through the shared material hook
// (scene.fogNode → NodeMaterial.setupFog) to every world surface whose
// material keeps fog enabled (terrain, sea, foliage, crowd, scenery). No
// material adds its own haze, ever — the per-material "Aerial stand-in"
// albedo mixes and the THREE.Fog parity stand-in died here.
//
// The model shares the SkyModel parameterization (sun elevation + turbidity)
// and reads optional preset-owned aerial curve knobs: per-channel
// Beer–Lambert extinction from the same Rayleigh/Mie coefficients, a
// spectrally neutral ground-fog term that turbidity switches on (David's
// locked overcast mood: HEAVY fog swallowing layered ranges), plus
// preset-specific range dissolve, sunward Mie tint, and low/far valley mist.
// The in-scattered base light is the SKY ITSELF — the sky-view LUT sampled at
// the horizon along the fragment's view azimuth — so far surfaces dissolve
// into the sky behind them (aesthetics rule 1, every preset), warm toward the
// sun, cool away, flat white under overcast.
import {
  Fn,
  clamp,
  cameraPosition,
  dot,
  equirectUV,
  float,
  length,
  mix,
  normalize,
  output,
  positionWorld,
  smoothstep,
  texture,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { CivsimEnvironment } from "../../../game-renderer/src/environment/environment";
import { BETA_MIE_EXTINCTION, BETA_RAYLEIGH, mieScale, SkyModel } from "./skyModel";

type Rgb = readonly [number, number, number];
type Vec4Node = Node<"vec4">;

export const AERIAL_OWNER = "aerialPerspective" as const;

/** Miniature-world amplification: battle maps are ~1–3 km across but read as
 *  many-kilometre vistas, so aerial optical depth runs this many times faster
 *  per world metre than the sky dome's true-scale physics. One constant,
 *  calibrated on the vista shots: the eye parks ~1 km out at the vista rig
 *  stop, so the whole world lives in the 0.5–4 km band — golden must keep the
 *  near field clear (subtle far haze), overcast must swallow the ranges. */
export const AERIAL_DISTANCE_SCALE = 4.5;
/** Neutral ground-fog extinction (km⁻¹) per (turbidity − onset)². Calibrated
 *  so overcast-highland (T 9.8) swallows the ranges before the far-ring
 *  edge while keeping the 1.5–2 km playable field readable. */
const FOG_COEFF_KM = 0.026;
const FOG_TURBIDITY_ONSET = 4.0;
/** Legibility floor (aesthetics rule 2 — battles stay legible): optical depth
 *  starts past the immediate fighting zone around the observer, so heavy
 *  weather never washes the units the player is commanding. */
const CLEAR_RADIUS_KM = 0.14;
const HORIZON_SKY_Z = 0.004;
const HORIZON_FADE_START_Z = -0.18;
const HORIZON_FADE_END_Z = 0.06;
const HORIZON_CLEAR_VISIBILITY_KM = 8;
const HORIZON_WIDE_VISIBILITY_KM = 32;
const HORIZON_CLEAR_EXTRA_START_Z = 0.2;
const HORIZON_CLEAR_EXTRA_END_Z = 0.08;
const DEFAULT_RANGE_FOG_NEAR_M = CLEAR_RADIUS_KM * 1000;
const DEFAULT_RANGE_FOG_FAR_M = 1700;
const DEFAULT_RANGE_FOG_POWER = 1.28;
const DEFAULT_RANGE_FOG_STRENGTH = 0;
const DEFAULT_SUN_MIE_TINT: Rgb = [1.0, 0.86, 0.62];
const DEFAULT_SUN_MIE_STRENGTH = 0;
const DEFAULT_SUN_MIE_POWER = 3.4;
const DEFAULT_VALLEY_MIST_COLOR: Rgb = [0.84, 0.82, 0.72];
const DEFAULT_VALLEY_MIST_HEIGHT_BOTTOM_M = 8;
const DEFAULT_VALLEY_MIST_HEIGHT_TOP_M = 46;
const DEFAULT_VALLEY_MIST_DISTANCE_START_M = 520;
const DEFAULT_VALLEY_MIST_DISTANCE_FULL_M = 1600;
const DEFAULT_VALLEY_MIST_COLOR_STRENGTH = 0;
const DEFAULT_VALLEY_MIST_OPACITY_BOOST = 0;

export interface AerialParams {
  /** Per-channel extinction σ (km⁻¹, world kilometres). */
  extinction: Rgb;
  /** Koschmieder meteorological visibility (km) — evidence/test telemetry. */
  visibilityKm: number;
  distanceScale: number;
  clearRadiusKm: number;
  rangeFogNearM: number;
  rangeFogFarM: number;
  rangeFogPower: number;
  rangeFogStrength: number;
  sunMieTint: Rgb;
  sunMieStrength: number;
  sunMiePower: number;
  valleyMistColor: Rgb;
  valleyMistHeightBottomM: number;
  valleyMistHeightTopM: number;
  valleyMistDistanceStartM: number;
  valleyMistDistanceFullM: number;
  valleyMistColorStrength: number;
  valleyMistOpacityBoost: number;
}

/** The pure preset → aerial mapping (no GPU). Turbidity drives the physical
 *  extinction; optional physical.aerial fields tune the single scene.fogNode
 *  curve per preset — pinned by web/tests/photorealEnvironment.test.ts. */
export function aerialParams(env: CivsimEnvironment): AerialParams {
  const turbidity = env.physical.turbidity;
  const aerial = env.physical.aerial;
  const distanceScale = aerial?.distanceScale ?? AERIAL_DISTANCE_SCALE;
  const mie = mieScale(turbidity) * BETA_MIE_EXTINCTION;
  const fog = FOG_COEFF_KM * Math.max(0, turbidity - FOG_TURBIDITY_ONSET) ** 2;
  const extinction = BETA_RAYLEIGH.map((betaR) => (betaR + mie) * distanceScale + fog) as [
    number,
    number,
    number,
  ];
  const mean = (extinction[0] + extinction[1] + extinction[2]) / 3;
  return {
    extinction,
    visibilityKm: 3.912 / mean,
    distanceScale,
    clearRadiusKm: (aerial?.clearRadiusM ?? CLEAR_RADIUS_KM * 1000) / 1000,
    rangeFogNearM: aerial?.rangeFogNearM ?? DEFAULT_RANGE_FOG_NEAR_M,
    rangeFogFarM: aerial?.rangeFogFarM ?? DEFAULT_RANGE_FOG_FAR_M,
    rangeFogPower: aerial?.rangeFogPower ?? DEFAULT_RANGE_FOG_POWER,
    rangeFogStrength: aerial?.rangeFogStrength ?? DEFAULT_RANGE_FOG_STRENGTH,
    sunMieTint: aerial?.sunMieTint ?? DEFAULT_SUN_MIE_TINT,
    sunMieStrength: aerial?.sunMieStrength ?? DEFAULT_SUN_MIE_STRENGTH,
    sunMiePower: aerial?.sunMiePower ?? DEFAULT_SUN_MIE_POWER,
    valleyMistColor: aerial?.valleyMistColor ?? DEFAULT_VALLEY_MIST_COLOR,
    valleyMistHeightBottomM:
      aerial?.valleyMistHeightBottomM ?? DEFAULT_VALLEY_MIST_HEIGHT_BOTTOM_M,
    valleyMistHeightTopM: aerial?.valleyMistHeightTopM ?? DEFAULT_VALLEY_MIST_HEIGHT_TOP_M,
    valleyMistDistanceStartM:
      aerial?.valleyMistDistanceStartM ?? DEFAULT_VALLEY_MIST_DISTANCE_START_M,
    valleyMistDistanceFullM:
      aerial?.valleyMistDistanceFullM ?? DEFAULT_VALLEY_MIST_DISTANCE_FULL_M,
    valleyMistColorStrength:
      aerial?.valleyMistColorStrength ?? DEFAULT_VALLEY_MIST_COLOR_STRENGTH,
    valleyMistOpacityBoost:
      aerial?.valleyMistOpacityBoost ?? DEFAULT_VALLEY_MIST_OPACITY_BOOST,
  };
}

/** The stats identity block — scenes assert the ONE aerial owner hazed. */
export function aerialIdentity(env: CivsimEnvironment) {
  const params = aerialParams(env);
  return {
    owner: AERIAL_OWNER,
    extinctionKm: params.extinction.map((c) => Number(c.toFixed(4))),
    visibilityKm: Number(params.visibilityKm.toFixed(2)),
    distanceScale: params.distanceScale,
    clearRadiusM: Number((params.clearRadiusKm * 1000).toFixed(1)),
    rangeFog: {
      nearM: params.rangeFogNearM,
      farM: params.rangeFogFarM,
      power: params.rangeFogPower,
      strength: params.rangeFogStrength,
    },
    sunMie: {
      tint: params.sunMieTint,
      strength: params.sunMieStrength,
      power: params.sunMiePower,
    },
    valleyMist: {
      color: params.valleyMistColor,
      heightBottomM: params.valleyMistHeightBottomM,
      heightTopM: params.valleyMistHeightTopM,
      distanceStartM: params.valleyMistDistanceStartM,
      distanceFullM: params.valleyMistDistanceFullM,
      colorStrength: params.valleyMistColorStrength,
      opacityBoost: params.valleyMistOpacityBoost,
    },
  };
}

/** The shared material hook: assign to `scene.fogNode`. Applied per fragment
 *  after lighting, before tonemapping (linear radiance — the same space the
 *  sky renders in): L = L_surface·T + L_sky(horizon, azimuth)·(1 − T).
 *
 *  `observer` is the point optical depth is measured FROM. The battle world
 *  passes the camera GROUND FOCUS (the player's stand-in on the field), not
 *  the rig eye: the tactical camera parks 1–3 km out at gameplay zooms, and
 *  eye-keyed depth would double-count the miniature-world amplification and
 *  white the armies out (the bespoke haze keyed on focus distance for the
 *  same reason). Worlds without a focus (lab routes) default to the eye. */
export function aerialPerspectiveNode(
  sky: SkyModel,
  env: CivsimEnvironment,
  observer?: Node<"vec3">,
): Vec4Node {
  const params = aerialParams(env);
  const thinHaze = Math.max(
    0,
    Math.min(
      1,
      (params.visibilityKm - HORIZON_CLEAR_VISIBILITY_KM) /
        (HORIZON_WIDE_VISIBILITY_KM - HORIZON_CLEAR_VISIBILITY_KM),
    ),
  );
  const horizonFadeStart = HORIZON_FADE_START_Z - HORIZON_CLEAR_EXTRA_START_Z * thinHaze;
  const horizonFadeEnd = HORIZON_FADE_END_Z + HORIZON_CLEAR_EXTRA_END_Z * thinHaze;
  const build = Fn(() => {
    const reach = positionWorld.sub(observer ?? cameraPosition).toVar();
    const distM = length(reach).toVar();
    const distKm = distM.div(1000.0).sub(params.clearRadiusKm).max(0.0).toVar();
    const rangeDepth = distM
      .sub(params.rangeFogNearM)
      .max(0.0)
      .div(params.rangeFogFarM)
      .pow(params.rangeFogPower)
      .mul(params.rangeFogStrength)
      .toVar();
    const heightMist = float(1.0).sub(
      smoothstep(
        float(params.valleyMistHeightBottomM),
        float(params.valleyMistHeightTopM),
        positionWorld.z,
      ),
    );
    const farMist = smoothstep(
      float(params.valleyMistDistanceStartM),
      float(params.valleyMistDistanceFullM),
      distM,
    );
    const mistWeight = heightMist.mul(farMist).toVar();
    const transmit = vec3(...params.extinction)
      .mul(distKm)
      .add(rangeDepth)
      .add(mistWeight.mul(params.valleyMistOpacityBoost))
      .negate()
      .exp()
      .toVar();
    // The in-scatter colour: the sky-view LUT along the TRUE view direction
    // (eye→fragment). Near-horizontal rays pick up the horizon sky (the
    // ranges/sea dissolve into it); downward rays land in the LUT's
    // below-horizon ground-bounce region, and upward rays keep their true sky
    // gradient so golden-hour cannot collapse into a flat horizon strip.
    const view = normalize(positionWorld.sub(cameraPosition));
    const viewSky = texture(sky.lut.texture, equirectUV(view)).rgb.toVar();
    const horizonView = normalize(vec3(view.x, view.y, HORIZON_SKY_Z)).toVar();
    const horizonSky = texture(sky.lut.texture, equirectUV(horizonView)).rgb;
    const belowHorizon = smoothstep(float(horizonFadeStart), float(0.0), view.z);
    const aboveHorizon = float(1.0).sub(smoothstep(float(0.0), float(horizonFadeEnd), view.z));
    const horizonWeight = belowHorizon.mul(aboveHorizon);
    const sunDir = vec3(
      Math.cos(env.sunElevation) * Math.cos(env.sunAzimuth),
      Math.cos(env.sunElevation) * Math.sin(env.sunAzimuth),
      Math.sin(env.sunElevation),
    );
    const sunMie = clamp(dot(view, sunDir), 0.0, 1.0)
      .pow(params.sunMiePower)
      .mul(params.sunMieStrength);
    const skyLight = mix(
      mix(viewSky, horizonSky, horizonWeight),
      vec3(...params.sunMieTint),
      sunMie,
    );
    const mistSkyLight = mix(
      skyLight,
      vec3(...params.valleyMistColor),
      mistWeight.mul(params.valleyMistColorStrength),
    );
    const hazed = output.rgb.mul(transmit).add(mistSkyLight.mul(vec3(1.0).sub(transmit)));
    return vec4(hazed, output.a);
  });
  // The cast re-types the untyped Fn return (@types/three drops the node type).
  return build() as unknown as Vec4Node;
}
