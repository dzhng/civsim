// SkyModel — the ONE physical sky owner. The preset's physical
// parameterization (sun elevation/azimuth + turbidity, from the ONE preset
// owner CIVSIM_ENVIRONMENTS) drives everything the sky produces: the sky-view
// LUT (radiance texture), the background dome that displays it, the IBL
// (scene.environment IS the same LUT — ambient always agrees with the visible
// sky), and the sun DirectionalLight colour (transmittance toward the sun).
// Never two sky paths outside this seam.
//
// The sky uses a Hillaire-style SKY-VIEW LUT baked by a FRAGMENT pass, not
// compute. Single-scattering
// raymarch (transmittance integrated inline per sample) with an analytic
// multiple-scattering floor and a CIE-overcast blend keyed on turbidity. The
// LUT bakes ONCE per preset (no time input — deterministic, byte-stable), so
// per-frame sky cost is one texture sample; SwiftShader runs the SAME tier
// (no compute pipeline to gate). The stats identity publishes the tier.
import * as THREE from "three/webgpu";
import {
  Fn,
  dot,
  equirectDirection,
  equirectUV,
  float,
  max,
  mix,
  normalize,
  positionGeometry,
  positionWorldDirection,
  smoothstep,
  texture,
  uv,
  vec3,
  vec4,
  cameraProjectionMatrix,
  modelViewMatrix,
  Loop,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type {
  CivsimEnvironment,
  CivsimEnvironmentId,
} from "../../../game-renderer/src/environment/environment";
import { smoothstep as smoothstepScalar } from "../../../renderer-core/src/math";

type Rgb = readonly [number, number, number];
type Vec3Node = Node<"vec3">;

const SKY_TIER = "skyview-fragment-lut" as const;
type SkyTier = typeof SKY_TIER;

/** Sky-view LUT size (Hillaire uses 192×108; equirect wants 2:1). */
const SKY_LUT_WIDTH = 384;
const SKY_LUT_HEIGHT = 192;

// Earth atmosphere constants (Hillaire, EGSR 2020) — km units, z-up world.
const PLANET_RADIUS_KM = 6360;
const ATMOSPHERE_TOP_KM = 6460;
const RAYLEIGH_SCALE_KM = 8.0;
const MIE_SCALE_KM = 1.2;
/** Rayleigh scattering coefficient at sea level (km⁻¹, rgb). */
export const BETA_RAYLEIGH: Rgb = [5.802e-3, 13.558e-3, 33.1e-3];
/** Mie scattering/extinction at sea level for turbidity 2 (km⁻¹). */
const BETA_MIE_SCATTER = 3.996e-3;
export const BETA_MIE_EXTINCTION = 4.44e-3;
const MIE_G = 0.8;
const EYE_ALTITUDE_KM = 0.2;

// SUN_RADIANCE keeps preset zenith radiance within the exposure/IBL register.
const SUN_RADIANCE = 25.0;
/** Uniform multiple-scattering floor (Hillaire's ψms role, one constant),
 *  sky-blue tinted — clear-sky multiple scattering is sky-coloured, which
 *  keeps the low-altitude band from washing to cream. */
const MS_FLOOR = 0.32;
const MS_TINT: Rgb = [0.5, 0.7, 1.0];
/** Low-sun dust/aerosol aureole. AgX deliberately compresses chroma in the
 *  display frame, so the sky model must carry enough warm sunward radiance
 *  before tone mapping for golden-hour pixels to remain warm. */
// The aureole preserves a warm-neutral golden band without affecting
// noon/overcast, which the strength curve gates to approximately zero.
const LOW_SUN_AUREOLE_RADIANCE = 0.55;
const LOW_SUN_AUREOLE_COS_OUTER = -0.12;
const LOW_SUN_AUREOLE_COS_INNER = 0.76;
/** Below-horizon ground bounce tint (dry Aegean earth, applied to horizon
 *  radiance in the LUT's lower hemisphere — the IBL's up-welling light). */
const GROUND_BOUNCE_TINT: Rgb = [0.34, 0.3, 0.25];
/** Overcast dome: high-key near-white grey (David's locked overcast mood:
 *  cool, flat, HIGH-KEY — the sky IS the light source). The gradient runs
 *  BRIGHTER toward the horizon (mist register, matching the reference and
 *  the visual reference), not the darker CIE-standard horizon. */
const OVERCAST_ZENITH_RADIANCE: Rgb = [1.02, 1.05, 1.1];
/** Sun disc: ~1.2° visual radius (readable at game framing). The radiance is
 *  kept BELOW the ACES saturation knee so the transmittance tint survives —
 *  at 60 the dusk disc blew to pure white (10a critique); at 2.5 dusk reads
 *  a warm gold disc, noon a bright cream one (mood over strict photometry —
 *  a real 14° sun is blinding white, the register wants the evening tint). */
const SUN_DISC_COS_INNER = 0.99985;
const SUN_DISC_COS_OUTER = 0.99955;
const SUN_DISC_RADIANCE = 2.5;

/** How much Mie the preset's turbidity adds (T = 1 → pure Rayleigh air). */
export function mieScale(turbidity: number): number {
  return Math.max(0.05, turbidity - 1);
}

/** Overcastness derived from turbidity — the single physical axis David's
 *  overcast mood hangs on (highland T 9.8 → 1.0; the three clear presets → 0). */
export function overcastFromTurbidity(turbidity: number): number {
  // Saturates by the overcast preset's turbidity so warm physical sky cannot
  // bleed through the cool grey dome.
  // Extinction (the fog runway the compose gate accepted) is driven by
  // turbidity directly and does not move with this ramp.
  return smoothstepScalar(4.0, 7.0, turbidity);
}

export function lowSunAureoleStrength(sunDirectionZ: number, overcast: number): number {
  return (
    // Squared: a mostly-overcast sky
    // must keep only a trace of aureole, or the overcast band reads warm.
    (1 - overcast) ** 2 *
    (1 - smoothstepScalar(0.25, 0.85, sunDirectionZ)) *
    LOW_SUN_AUREOLE_RADIANCE
  );
}

interface SkyModelParams {
  id: CivsimEnvironmentId;
  /** Unit vector toward the sun (z-up). */
  sunDirection: Rgb;
  turbidity: number;
  mieScale: number;
  overcast: number;
  /** Linear rgb transmittance toward the sun (max-channel-normalized) — the
   *  physically derived sun tint (warm low sun, near-white high sun). */
  sunTransmittance: Rgb;
  /** The sun DirectionalLight colour: transmittance desaturated toward grey
   *  as overcast rises (cloud diffusion kills the direct tint). */
  sunLightColor: Rgb;
}

/** The pure preset → sky-model mapping (no GPU). Sun elevation + turbidity
 *  drive everything — pinned by web/tests/photorealEnvironment.test.ts. */
export function skyModelParams(env: CivsimEnvironment): SkyModelParams {
  const cosEl = Math.cos(env.sunElevation);
  const sunDirection: Rgb = [
    cosEl * Math.cos(env.sunAzimuth),
    cosEl * Math.sin(env.sunAzimuth),
    Math.sin(env.sunElevation),
  ];
  const turbidity = env.physical.turbidity;
  const overcast = overcastFromTurbidity(turbidity);
  const sunTransmittance = transmittanceToSun(sunDirection, turbidity);
  const lum =
    0.2126 * sunTransmittance[0] + 0.7152 * sunTransmittance[1] + 0.0722 * sunTransmittance[2];
  const sunLightColor: Rgb = [
    sunTransmittance[0] + (lum - sunTransmittance[0]) * overcast,
    sunTransmittance[1] + (lum - sunTransmittance[1]) * overcast,
    sunTransmittance[2] + (lum - sunTransmittance[2]) * overcast,
  ];
  return {
    id: env.id,
    sunDirection,
    turbidity,
    mieScale: mieScale(turbidity),
    overcast,
    sunTransmittance,
    sunLightColor,
  };
}

/** Beer–Lambert transmittance from the eye toward `direction` through the
 *  exponential atmosphere (numeric integral, spherical geometry), normalized
 *  to its max channel. Same coefficients as the LUT bake. */
export function transmittanceToSun(direction: Rgb, turbidity: number): Rgb {
  const mieExt = mieScale(turbidity) * BETA_MIE_EXTINCTION;
  const r0 = PLANET_RADIUS_KM + EYE_ALTITUDE_KM;
  const mu = Math.max(direction[2], 0.0);
  const tTop =
    -r0 * mu + Math.sqrt(r0 * r0 * (mu * mu - 1) + ATMOSPHERE_TOP_KM * ATMOSPHERE_TOP_KM);
  const steps = 64;
  const dt = tTop / steps;
  const od = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const h = Math.sqrt(r0 * r0 + t * t + 2 * r0 * t * mu) - PLANET_RADIUS_KM;
    const rho_r = Math.exp(-h / RAYLEIGH_SCALE_KM);
    const rho_m = Math.exp(-h / MIE_SCALE_KM);
    for (let c = 0; c < 3; c++) od[c] += (BETA_RAYLEIGH[c] * rho_r + mieExt * rho_m) * dt;
  }
  const t3 = od.map((x) => Math.exp(-x));
  const peak = Math.max(t3[0], t3[1], t3[2], 1e-6);
  return [t3[0] / peak, t3[1] / peak, t3[2] / peak];
}

/** The SkyModel scene objects: sky-view LUT (render target), the background
 *  dome that displays it (+ analytic sun disc), and the IBL feed. Everything
 *  is baked once from static per-preset constants — byte-deterministic. */
export class SkyModel {
  readonly tier: SkyTier = SKY_TIER;
  readonly params: SkyModelParams;
  /** The sky-view LUT — also the `scene.environment` texture (one source). */
  readonly lut: THREE.RenderTarget;
  /** The background dome (camera-locked unit sphere at renderOrder -100). */
  readonly mesh: THREE.Mesh;
  private readonly bakeMaterial: THREE.NodeMaterial;
  private baked = false;

  constructor(env: CivsimEnvironment) {
    this.params = skyModelParams(env);
    this.lut = new THREE.RenderTarget(SKY_LUT_WIDTH, SKY_LUT_HEIGHT, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.lut.texture.mapping = THREE.EquirectangularReflectionMapping;
    this.lut.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.lut.texture.name = "photoreal-sky-lut";

    this.bakeMaterial = new THREE.NodeMaterial();
    this.bakeMaterial.name = "photoreal-sky-bake";
    this.bakeMaterial.fog = false;
    this.bakeMaterial.lights = false;
    // The LUT texel direction vector IS the world direction (z-up):
    // equirectDirection/equirectUV invert each other, so IBL lookups and
    // dome/aerial samples land correctly.
    this.bakeMaterial.colorNode = vec4(this.radianceNode(equirectDirection(uv())), 1.0);

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.domeMaterial());
    this.mesh.name = "photoreal-sky";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = SKY_RENDER_ORDER;
  }

  /** Renders the sky-view LUT (once; static per preset). Call after the
   *  renderer has initialized and before the first frame. */
  bake(renderer: THREE.WebGPURenderer): void {
    if (this.baked) return;
    this.baked = true;
    const quad = new THREE.QuadMesh(this.bakeMaterial);
    const previousTarget = renderer.getRenderTarget();
    const previousToneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping; // the LUT stores linear radiance
    renderer.setRenderTarget(this.lut);
    quad.render(renderer);
    renderer.setRenderTarget(previousTarget);
    renderer.toneMapping = previousToneMapping;
    quad.geometry.dispose();
  }

  /** The stats identity block — scenes assert WHICH tier rendered the sky. */
  identity() {
    return {
      owner: "skyModel" as const,
      tier: this.tier,
      lut: `${SKY_LUT_WIDTH}x${SKY_LUT_HEIGHT}`,
      turbidity: this.params.turbidity,
      overcast: Number(this.params.overcast.toFixed(4)),
    };
  }

  dispose(): void {
    this.lut.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.bakeMaterial.dispose();
  }

  /** The visible sky: LUT sample + analytic sun disc (the disc is EXCLUDED
   *  from the LUT so the IBL never double-counts the DirectionalLight). */
  private domeMaterial(): THREE.NodeMaterial {
    const p = this.params;
    const material = new THREE.MeshBasicNodeMaterial();
    material.name = "photoreal-sky-dome";
    material.side = THREE.BackSide;
    material.depthTest = false;
    material.depthWrite = false;
    material.fog = false;
    // Camera-locked dome: rotation-only view transform (w = 0 kills the
    // translation), clip z parked mid-range (depth is ignored — the dome
    // draws first in the painter band, renderOrder -100).
    const viewPosition = modelViewMatrix.mul(vec4(positionGeometry, 0.0));
    const clip = cameraProjectionMatrix.mul(vec4(viewPosition.xyz, 1.0)).toVar();
    material.vertexNode = vec4(clip.x, clip.y, clip.w.mul(0.5), clip.w);

    const dir = normalize(positionWorldDirection).toVar();
    const sky = texture(this.lut.texture, equirectUV(dir)).rgb.toVar();
    const sunDir = vec3(...p.sunDirection);
    const cosSun = dot(dir, sunDir);
    const disc = smoothstep(float(SUN_DISC_COS_OUTER), float(SUN_DISC_COS_INNER), cosSun)
      .mul(smoothstep(float(-0.015), float(0.01), dir.z))
      .mul(SUN_DISC_RADIANCE * (1 - p.overcast));
    const discColor = vec3(...p.sunTransmittance).mul(disc);
    material.colorNode = vec4(sky.add(discColor), 1.0);
    return material;
  }

  /** Single-scattering raymarch (N view samples × M sun-transmittance samples)
   *  + MS floor + CIE-overcast blend + below-horizon ground bounce. All
   *  parameters are per-preset constants — the graph has no uniforms. The
   *  body lives in an Fn(): TSL Loop/addAssign statements need a stack
   *  context — at raw graph level they orphan and the accumulator stays 0. */
  private radianceNode(dirRaw: Vec3Node): Vec3Node {
    // The cast re-types the untyped Fn return (@types/three drops the node
    // type, which keeps the dome in the intended painter band).
    return Fn(() => this.radianceBody(dirRaw))() as unknown as Vec3Node;
  }

  private radianceBody(dirRaw: Vec3Node): Vec3Node {
    const p = this.params;
    const betaR = vec3(...BETA_RAYLEIGH);
    const betaMScatter = BETA_MIE_SCATTER * p.mieScale;
    const betaMExtinction = BETA_MIE_EXTINCTION * p.mieScale;
    const sunDir = vec3(...p.sunDirection);
    const r0 = PLANET_RADIUS_KM + EYE_ALTITUDE_KM;

    // Sky is evaluated just above the horizon; below-horizon texels reuse the
    // horizon radiance with a ground-bounce tint (smooth across the seam).
    const dirIn = vec3(dirRaw).toVar();
    const mu = max(dirIn.z, 0.004).toVar();
    const dir = normalize(vec3(dirIn.x, dirIn.y, mu)).toVar();

    const tTop = float(r0 * r0)
      .mul(mu.mul(mu).sub(1.0))
      .add(ATMOSPHERE_TOP_KM * ATMOSPHERE_TOP_KM)
      .sqrt()
      .sub(mu.mul(r0))
      .toVar();
    const STEPS = 32;
    const SUN_STEPS = 6;
    const dt = tTop.div(STEPS).toVar();

    const cosTheta = dot(dir, sunDir).toVar();
    const phaseR = cosTheta
      .mul(cosTheta)
      .add(1.0)
      .mul(3 / (16 * Math.PI))
      .toVar();
    const g2 = MIE_G * MIE_G;
    const phaseM = float((1 - g2) / (4 * Math.PI))
      .div(
        float(1 + g2)
          .sub(cosTheta.mul(2 * MIE_G))
          .pow(1.5),
      )
      .toVar();
    // MS floor scales with delivered sun height (a dim dusk sky stays dim).
    const msAmbient = MS_FLOOR * Math.sqrt(Math.max(p.sunDirection[2], 0));
    const lowSunAureole = lowSunAureoleStrength(p.sunDirection[2], p.overcast);

    const radiance = vec3(0.0).toVar();
    const odView = vec3(0.0).toVar();
    Loop(STEPS, ({ i }: { readonly i: Node<"int"> }) => {
      const t = float(i).add(0.5).mul(dt).toVar();
      const px = dir.x.mul(t).toVar();
      const py = dir.y.mul(t).toVar();
      const pz = dir.z.mul(t).add(r0).toVar();
      const rp = px.mul(px).add(py.mul(py)).add(pz.mul(pz)).sqrt().toVar();
      const h = rp.sub(PLANET_RADIUS_KM).toVar();
      const rhoR = h.div(-RAYLEIGH_SCALE_KM).exp().toVar();
      const rhoM = h.div(-MIE_SCALE_KM).exp().toVar();
      odView.addAssign(betaR.mul(rhoR).add(rhoM.mul(betaMExtinction)).mul(dt));
      const tView = odView.negate().exp().toVar();

      // Transmittance toward the sun from this sample (inline mini-march).
      const muS = px.mul(sunDir.x).add(py.mul(sunDir.y)).add(pz.mul(sunDir.z)).div(rp).toVar();
      const tSunTop = rp
        .mul(rp)
        .mul(muS.mul(muS).sub(1.0))
        .add(ATMOSPHERE_TOP_KM * ATMOSPHERE_TOP_KM)
        .sqrt()
        .sub(muS.mul(rp))
        .toVar();
      const dts = tSunTop.div(SUN_STEPS).toVar();
      const odSun = vec3(0.0).toVar();
      Loop(SUN_STEPS, ({ i: j }: { readonly i: Node<"int"> }) => {
        const ts = float(j).add(0.5).mul(dts);
        const sx = px.add(sunDir.x.mul(ts));
        const sy = py.add(sunDir.y.mul(ts));
        const sz = pz.add(sunDir.z.mul(ts));
        const hs = sx.mul(sx).add(sy.mul(sy)).add(sz.mul(sz)).sqrt().sub(PLANET_RADIUS_KM).toVar();
        odSun.addAssign(
          betaR
            .mul(hs.div(-RAYLEIGH_SCALE_KM).exp())
            .add(hs.div(-MIE_SCALE_KM).exp().mul(betaMExtinction))
            .mul(dts),
        );
      });
      // Earth shadow: the sun set below this sample's local horizon.
      const horizonMu = float(1.0)
        .sub(float(PLANET_RADIUS_KM * PLANET_RADIUS_KM).div(rp.mul(rp)))
        .max(0.0)
        .sqrt()
        .negate()
        .toVar();
      const shadow = smoothstep(horizonMu.sub(0.008), horizonMu.add(0.004), muS);
      const tSun = odSun.negate().exp().mul(shadow).toVar();

      const scatterR = betaR.mul(rhoR).toVar();
      const scatterM = rhoM.mul(betaMScatter).toVar();
      const single = tSun.mul(scatterR.mul(phaseR).add(scatterM.mul(phaseM)));
      const multiple = scatterR
        .add(scatterM)
        .mul(vec3(...MS_TINT))
        .mul(msAmbient / (4 * Math.PI));
      radiance.addAssign(tView.mul(single.add(multiple)).mul(dt));
    });
    const sunwardAureole = smoothstep(
      float(LOW_SUN_AUREOLE_COS_OUTER),
      float(LOW_SUN_AUREOLE_COS_INNER),
      cosTheta,
    ).mul(lowSunAureole);
    const clearSky = radiance
      .mul(SUN_RADIANCE)
      .add(vec3(...p.sunTransmittance).mul(sunwardAureole))
      .toVar();

    // Overcast dome (flat HIGH-KEY grey; horizon ~1.27× the zenith — mist).
    const overcastGradient = float(1.05).sub(max(dirIn.z, 0.0).mul(0.22));
    const overcastSky = vec3(...OVERCAST_ZENITH_RADIANCE)
      .mul(overcastGradient)
      .mul(Math.sqrt(Math.max(p.sunDirection[2], 0.05)));
    const sky = mix(clearSky, overcastSky, p.overcast).toVar();

    // Below the horizon: fade to the ground-bounce tint (the IBL's up-welling
    // term). Under overcast the fog owns the ground view — up-welling matches
    // the fog's brightness instead of darkening to bare-earth bounce.
    const groundTint = GROUND_BOUNCE_TINT.map((c) => c + (0.88 - c) * p.overcast) as unknown as Rgb;
    const ground = smoothstep(float(0.0), float(0.35), dirIn.z.negate());
    return mix(sky, sky.mul(vec3(...groundTint)), ground);
  }
}

/** The sky draws before every world layer in the painter band (battle layers
 *  start at renderOrder -10). Depth is not consulted (depthTest false). */
const SKY_RENDER_ORDER = -100;
