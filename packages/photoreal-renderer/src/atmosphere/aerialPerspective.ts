// aerialPerspective — THE one aerial-perspective owner. One TSL
// scatter/extinction function, applied through the shared material hook
// (scene.fogNode → NodeMaterial.setupFog) to every world surface whose
// material keeps fog enabled (terrain, sea, foliage, crowd, scenery). No
// material adds its own haze, ever.
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
import { SkyModel } from "./skyModel";
import {
  aerialParams,
  aerialHorizonFade,
  HORIZON_SKY_Z,
} from "../../../game-renderer/src/environment/aerialParameters";

type Vec4Node = Node<"vec4">;
const AERIAL_OWNER = "aerialPerspective" as const;

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
 *  passes the camera GROUND FOCUS (the player's field anchor), not
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
  const { horizonFadeStart, horizonFadeEnd } = aerialHorizonFade(params.visibilityKm);
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
