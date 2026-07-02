// aerialPerspective — THE one aerial-perspective owner (slice 10b). One TSL
// scatter/extinction function, applied through the shared material hook
// (scene.fogNode → NodeMaterial.setupFog) to every world surface whose
// material keeps fog enabled (terrain, sea, foliage, crowd, scenery). No
// material adds its own haze, ever — the per-material "Aerial stand-in"
// albedo mixes and the THREE.Fog parity stand-in died here.
//
// The model shares the SkyModel parameterization (sun elevation + turbidity
// drive everything): per-channel Beer–Lambert extinction from the same
// Rayleigh/Mie coefficients, plus a spectrally neutral ground-fog term that
// turbidity switches on (David's locked overcast mood: HEAVY fog swallowing
// layered ranges). The in-scattered light is the SKY ITSELF — the sky-view
// LUT sampled at the horizon along the fragment's view azimuth — so far
// surfaces dissolve into exactly the sky behind them (aesthetics rule 1,
// every preset), warm toward the sun, cool away, flat white under overcast.
import {
  Fn, cameraPosition, equirectUV, length, normalize, output, positionWorld, texture, vec3, vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { CivsimEnvironment } from '../../../game-renderer/src/environment/environment';
import { BETA_MIE_EXTINCTION, BETA_RAYLEIGH, mieScale, SkyModel } from './skyModel';

type Rgb = readonly [number, number, number];
type Vec4Node = Node<'vec4'>;

export const AERIAL_OWNER = 'aerialPerspective' as const;

/** Miniature-world amplification: battle maps are ~1–3 km across but read as
 *  many-kilometre vistas, so aerial optical depth runs this many times faster
 *  per world metre than the sky dome's true-scale physics. One constant,
 *  calibrated on the vista shots: the eye parks ~1 km out at the vista rig
 *  stop, so the whole world lives in the 0.5–4 km band — golden must keep the
 *  near field clear (subtle far haze), overcast must swallow the ranges. */
export const AERIAL_DISTANCE_SCALE = 4.5;
/** Neutral ground-fog extinction (km⁻¹) per (turbidity − onset)². Calibrated
 *  so overcast (T 9) swallows the ranges 1.1–1.5 km from the focus
 *  (transmittance ~0.2–0.3 there — David's locked mood). */
const FOG_COEFF_KM = 0.026;
const FOG_TURBIDITY_ONSET = 4.0;
/** Legibility floor (aesthetics rule 2 — battles stay legible): optical depth
 *  starts past the immediate fighting zone around the observer, so heavy
 *  weather never washes the units the player is commanding. */
const CLEAR_RADIUS_KM = 0.14;

export interface AerialParams {
  /** Per-channel extinction σ (km⁻¹, world kilometres). */
  extinction: Rgb;
  /** Koschmieder meteorological visibility (km) — evidence/test telemetry. */
  visibilityKm: number;
}

/** The pure preset → aerial mapping (no GPU). Turbidity drives everything:
 *  Mie extinction scales with it and the neutral fog term switches on above
 *  the onset — pinned by web/tests/photorealEnvironment.test.ts. */
export function aerialParams(env: CivsimEnvironment): AerialParams {
  const turbidity = env.physical.turbidity;
  const mie = mieScale(turbidity) * BETA_MIE_EXTINCTION;
  const fog = FOG_COEFF_KM * Math.max(0, turbidity - FOG_TURBIDITY_ONSET) ** 2;
  const extinction = BETA_RAYLEIGH.map((betaR) => (betaR + mie) * AERIAL_DISTANCE_SCALE + fog) as [
    number,
    number,
    number,
  ];
  const mean = (extinction[0] + extinction[1] + extinction[2]) / 3;
  return { extinction, visibilityKm: 3.912 / mean };
}

/** The stats identity block — scenes assert the ONE aerial owner hazed. */
export function aerialIdentity(env: CivsimEnvironment) {
  const params = aerialParams(env);
  return {
    owner: AERIAL_OWNER,
    extinctionKm: params.extinction.map((c) => Number(c.toFixed(4))),
    visibilityKm: Number(params.visibilityKm.toFixed(2)),
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
  observer?: Node<'vec3'>,
): Vec4Node {
  const params = aerialParams(env);
  const build = Fn(() => {
    const reach = positionWorld.sub(observer ?? cameraPosition).toVar();
    const distKm = length(reach).div(1000.0).sub(CLEAR_RADIUS_KM).max(0.0).toVar();
    const transmit = vec3(...params.extinction).mul(distKm).negate().exp().toVar();
    // The in-scatter colour: the sky just above the horizon in the
    // fragment's VIEW azimuth (eye→fragment — the direction being looked
    // along). Near top-down views degenerate toward the zenith sample, where
    // distances (and 1−T) are tiny anyway.
    const view = positionWorld.sub(cameraPosition).toVar();
    const groundDist = length(view.xy).toVar();
    const horizonDir = normalize(vec3(view.x, view.y, groundDist.mul(0.035).add(1e-4)));
    const skyLight = texture(sky.lut.texture, equirectUV(horizonDir)).rgb;
    const hazed = output.rgb.mul(transmit).add(skyLight.mul(vec3(1.0).sub(transmit)));
    return vec4(hazed, output.a);
  });
  // The cast re-types the untyped Fn return (@types/three drops the node type).
  return build() as unknown as Vec4Node;
}
