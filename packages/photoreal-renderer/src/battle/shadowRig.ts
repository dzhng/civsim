import { fitSunShadowRect } from "../landscape/sunShadow";
// shadowRig — real cascaded sun shadows for the battle world. One rig per
// world, configured once from the SAME sun DirectionalLight
// applyCivsimEnvironment builds — direction and colour stay owned by the ONE
// environment preset owner; this file only decides HOW that sun casts.
//
// Tier contract (README standing gate 8 — SwiftShader enforces the fallback):
//   'csm'    — hardware: three's CSMShadowNode addon, cascades split from
//              the LIVE camera projection. We own the camera math
//              (cameraBridge/applyCamera3d poses it), so updateFrustums()
//              every frame keeps the splits tracking the zoom rig exactly.
//   'single' — software adapters (SwiftShader): one low-res orthographic
//              shadow fit to the terrain rect. Depth-array-per-cascade
//              rendering is the named SwiftShader risk; the fallback renders
//              the SAME contract (sun-direction shadows) one tier down.
//   'off'    — lab debug only (?shadows=off on /renderer/photoreal-battle).
// The stats identity publishes which tier ran; the photoreal-shadows scene
// asserts it per adapter.
//
// Preset coupling (lighting is an environment, not a material): the shadow
// REDUCTION under overcast comes free from physics — the preset's
// physical.sunIntensity (0.4 overcast vs 3.4 golden) already scales the sun's
// contribution, so its shadow term fades with it. The SOFTNESS maps from the
// preset's turbidity below (aerosols blur the solar disc): clear noon reads
// crisp, hazy dusk/overcast read soft. No shadow field is added to the preset
// owner — both couplings derive from fields it already has.
import * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import type { CivsimEnvironment } from "../../../game-renderer/src/environment/environment";
import { projectionFootprint } from "../../../renderer-core/src/camera3d";
import type { CrowdProjectionView } from "../crowd/crowdLod";
import { CROWD_SHADOW_LAYER } from "../crowd/crowdAudience";

export type SunShadowMode = "csm" | "single" | "off";

// --- The classic shadow knob set --------------------------------------------
/** Cascade count on the hardware tier. Three practical-split cascades cover
 *  gameplay mid zoom (dense texels on the crowd) through the vista ridge. */
// 2 cascades over the tightened 1500m range: the third re-rendered the
// whole crowd for far-field texels haze owns anyway.
export const CSM_CASCADES = 2;
/** Per-cascade shadow map resolution on hardware. */
export const CSM_MAP_SIZE = 2048;
/** The single-tier (SwiftShader) map resolution — correctness proxy, not look. */
const SINGLE_MAP_SIZE = 1024;
/** How far from the eye cascades reach before shadows fade out. Past this the
 *  10b aerial haze owns distance attenuation anyway; CSMShadowNode.fade blends
 *  the last cascade toward it instead of hard-clipping. */
// 1500, not 2600: haze owns depth past ~1.5km and a longer range stretches
// the far cascade's texels to ~1.3m - at 0.3m normal bias the distant field
// self-shadowed WHOLESALE (David's giant view-following dark band).
const SHADOW_MAX_FAR = 1500;
/** Light-space margin behind each cascade's near plane so off-frustum casters
 *  (a headland, a tree line just out of frame) still throw shadows in. */
const CSM_LIGHT_MARGIN = 300;
/** Depth-compare bias in [0,1] depth units — the acne knob. Multiply by
 *  SHADOW_CAM_FAR for world units (-0.00003 ≈ 0.075 world). CSMShadowNode
 *  multiplies it by (cascade + 1), so coarser far cascades get more. Tuned
 *  conservatively: a bias deeper than the caster erases soldier-sized
 *  shadows. */
const SHADOW_BIAS = -0.00003;
/** World-unit push along the receiver normal: the peter-panning-vs-acne
 *  trade. 0.3 ≈ a boot height; shrinks a golden-hour soldier shadow by
 *  ~0.8 world at the far tip, which contact framing still reads fine.
 *  NOTE: three reads the receiver normal from the STANDARD 'normal'
 *  attribute — every custom-named geometry aliases it (see crowdLayer). */
const SHADOW_NORMAL_BIAS = 0.6;
/** Ortho shadow-camera depth range. CSMShadowNode sets each cascade's XY
 *  extents but leaves the CLONED DirectionalLightShadow camera's near/far at
 *  three's defaults (0.5/500). Size it to the light-space depth of a
 *  whole battle map + the light margin. */
const SHADOW_CAM_NEAR = 1;
const SHADOW_CAM_FAR = 2500;

/** PCF softness from the preset's turbidity (aerosol optical depth blurs the
 *  solar disc): clear skies cast crisp shadows, hazy/overcast cast soft ones.
 *  Turbidity 2 (noon) → 1.0; 9.8 (overcast-highland) → 3.0. */
export function shadowRadiusForTurbidity(turbidity: number): number {
  return Math.min(3, Math.max(1, 1 + (turbidity - 2) * 0.28));
}

/** Adapter capability probe → shadow tier. Software rasterizers take the
 *  'single' tier by name; an explicit override (lab ?shadows= param) wins. */
export function resolveSunShadowMode(
  adapterLabel: string,
  override?: string | null,
): SunShadowMode {
  if (override === "off" || override === "single" || override === "csm") return override;
  const label = (adapterLabel || "").toLowerCase();
  const software = ["swiftshader", "llvmpipe", "lavapipe", "software", "cpu"].some((needle) =>
    label.includes(needle),
  );
  // 'single' everywhere by default: even 2-cascade CSM re-renders the crowd
  // per cascade and costs roughly 25% of the battle frame. One soft pass keeps
  // grounded soldiers/trees at playable fps; ?shadows=csm remains for QA.
  return "single";
}

export interface SunShadowRig {
  readonly mode: SunShadowMode;
  /** Per-frame, after applyCamera3d: re-fit cascade splits to the live
   *  projection (the zoom rig changes fovY/pitch continuously). No-op off/single. */
  update(camera: THREE.PerspectiveCamera): void;
  /** Terrain rect (setTerrain) — the single-tier ortho fit. No-op for csm. */
  setWorldRect(rect: [number, number, number, number]): void;
  /** Matching shadow frusta and texel projections keep off-screen casters alive
   * at the detail demanded by the map that actually draws their shadows. */
  cullingViews(): CrowdProjectionView[];
  /** The stats identity block — scenes assert WHICH tier cast the shadows. */
  identity(): {
    owner: "shadowRig";
    mode: SunShadowMode;
    cascades: number;
    mapSize: number;
    maxFar: number;
    radius: number;
  };
  dispose(): void;
}

/**
 * Configures how the environment's sun casts shadows. Call once at world
 * construction, BEFORE the first render (three clones the shadow config into
 * per-cascade lights at first build).
 */
export function configureSunShadows(
  renderer: THREE.WebGPURenderer,
  sun: THREE.DirectionalLight,
  env: CivsimEnvironment,
  mode: SunShadowMode,
): SunShadowRig {
  const radius = shadowRadiusForTurbidity(env.physical.turbidity);
  const identityFor = (
    cascades: number,
    mapSize: number,
  ): ReturnType<SunShadowRig["identity"]> => ({
    owner: "shadowRig",
    mode,
    cascades,
    mapSize,
    maxFar: SHADOW_MAX_FAR,
    radius: mode === "off" ? 0 : radius,
  });

  if (mode === "off") {
    return {
      mode,
      update: () => {},
      setWorldRect: () => {},
      cullingViews: () => [],
      identity: () => identityFor(0, 0),
      dispose: () => {},
    };
  }

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = true;
  const shadow = sun.shadow;
  // A non-default bit keeps Three from inheriting the main camera's mask.
  // Configure before CSM clones this camera; ordinary world casters stay on layer 0.
  shadow.camera.layers.enable(CROWD_SHADOW_LAYER);
  shadow.bias = SHADOW_BIAS;
  shadow.normalBias = SHADOW_NORMAL_BIAS;
  shadow.radius = radius;

  if (mode === "csm") {
    shadow.mapSize.set(CSM_MAP_SIZE, CSM_MAP_SIZE);
    // Set BEFORE constructing the node: each cascade clones this shadow.
    shadow.camera.near = SHADOW_CAM_NEAR;
    shadow.camera.far = SHADOW_CAM_FAR;
    const csm = new CSMShadowNode(sun, {
      cascades: CSM_CASCADES,
      maxFar: SHADOW_MAX_FAR,
      mode: "practical",
      lightMargin: CSM_LIGHT_MARGIN,
    });
    csm.fade = true;
    (shadow as { shadowNode?: unknown }).shadowNode = csm;
    return {
      mode,
      // CSMShadowNode binds the camera at first build; after that every frame
      // re-derives breaks + cascade bounds from the live projection matrix.
      update: () => {
        if (csm.camera !== null) csm.updateFrustums();
      },
      setWorldRect: () => {},
      cullingViews: () => shadowViewsForCascadeLights(csm.lights),
      identity: () => identityFor(CSM_CASCADES, CSM_MAP_SIZE),
      dispose: () => csm.dispose(),
    };
  }

  // 'single': one orthographic shadow camera fit to the whole terrain rect.
  shadow.mapSize.set(SINGLE_MAP_SIZE, SINGLE_MAP_SIZE);
  const fit = (rect: [number, number, number, number]) => fitSunShadowRect(sun, rect);
  fit([-220, -180, 440, 360]);
  return {
    mode,
    update: () => {},
    setWorldRect: fit,
    cullingViews: () => shadowViewsForCascadeLights([sun]),
    identity: () => identityFor(1, SINGLE_MAP_SIZE),
    dispose: () => shadow.dispose(),
  };
}

function shadowViewsForCascadeLights(
  lights: Array<
    THREE.Object3D & { target?: THREE.Object3D; shadow?: THREE.DirectionalLightShadow }
  >,
): CrowdProjectionView[] {
  const out: CrowdProjectionView[] = [];
  const mat = new THREE.Matrix4();
  const target = new THREE.Vector3();
  for (const light of lights) {
    const shadow = light.shadow;
    const cam = shadow?.camera;
    const lightTarget = light.target;
    if (!shadow || !cam || !lightTarget) continue;
    light.updateMatrixWorld(true);
    lightTarget.updateMatrixWorld(true);
    cam.position.setFromMatrixPosition(light.matrixWorld);
    target.setFromMatrixPosition(lightTarget.matrixWorld);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    mat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    out.push({
      frustum: new THREE.Frustum().setFromProjectionMatrix(
        mat,
        cam.coordinateSystem,
        cam.reversedDepth,
      ),
      projection: projectionFootprint(
        cam.matrixWorldInverse.elements,
        cam.projectionMatrix.elements,
        shadow.mapSize.y,
        cam.near,
      ),
      shadow: true,
    });
  }
  return out;
}
