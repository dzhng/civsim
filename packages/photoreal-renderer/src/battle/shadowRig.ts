// shadowRig — real cascaded sun shadows for the battle world (slice 11; the
// 08a blob-shadow decal stand-ins are deleted by this seam). One rig per
// world, configured once from the SAME sun DirectionalLight
// applyCivsimEnvironment builds — direction and colour stay owned by the ONE
// environment preset owner; this file only decides HOW that sun casts.
//
// Tier contract (README standing gate 8 — SwiftShader enforces the fallback):
//   'csm'    — hardware: three's CSMShadowNode addon (the recorded slice-11
//              decision, see slices/11-csm-shadows.md), cascades split from
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

export type SunShadowMode = "csm" | "single" | "off";

// --- The classic shadow knob set (slice-11 tuning constants, documented) ----
/** Cascade count on the hardware tier. Three practical-split cascades cover
 *  gameplay mid zoom (dense texels on the crowd) through the vista ridge. */
export const CSM_CASCADES = 3;
/** Per-cascade shadow map resolution on hardware. */
export const CSM_MAP_SIZE = 2048;
/** The single-tier (SwiftShader) map resolution — correctness proxy, not look. */
export const SINGLE_MAP_SIZE = 1024;
/** How far from the eye cascades reach before shadows fade out. Past this the
 *  10b aerial haze owns distance attenuation anyway; CSMShadowNode.fade blends
 *  the last cascade toward it instead of hard-clipping. */
export const SHADOW_MAX_FAR = 2600;
/** Light-space margin behind each cascade's near plane so off-frustum casters
 *  (a headland, a tree line just out of frame) still throw shadows in. */
export const CSM_LIGHT_MARGIN = 300;
/** Depth-compare bias in [0,1] depth units — the acne knob. Multiply by
 *  SHADOW_CAM_FAR for world units (-0.00003 ≈ 0.075 world). CSMShadowNode
 *  multiplies it by (cascade + 1), so coarser far cascades get more. Tuned
 *  DOWN from -0.0005: over-biasing silently erased every soldier-sized
 *  shadow (a bias deeper than the caster is a deleted caster). */
export const SHADOW_BIAS = -0.00003;
/** World-unit push along the receiver normal: the peter-panning-vs-acne
 *  trade. 0.3 ≈ a boot height; shrinks a golden-hour soldier shadow by
 *  ~0.8 world at the far tip, which contact framing still reads fine.
 *  NOTE: three reads the receiver normal from the STANDARD 'normal'
 *  attribute — every custom-named geometry aliases it (see crowdLayer). */
export const SHADOW_NORMAL_BIAS = 0.3;
/** Ortho shadow-camera depth range. CSMShadowNode sets each cascade's XY
 *  extents but leaves the CLONED DirectionalLightShadow camera's near/far at
 *  three's defaults (0.5/500) — receivers past 500 light-units compare
 *  against cleared depth and read fully shadowed (a giant smooth blackout,
 *  caught on the first hardware shot). Size it to the light-space depth of a
 *  whole battle map + the light margin. */
export const SHADOW_CAM_NEAR = 1;
export const SHADOW_CAM_FAR = 2500;

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
  return software ? "single" : "csm";
}

export interface SunShadowRig {
  readonly mode: SunShadowMode;
  /** Per-frame, after applyCamera3d: re-fit cascade splits to the live
   *  projection (the zoom rig changes fovY/pitch continuously). No-op off/single. */
  update(camera: THREE.PerspectiveCamera): void;
  /** Terrain rect (setTerrain) — the single-tier ortho fit. No-op for csm. */
  setWorldRect(rect: [number, number, number, number]): void;
  /** Active shadow-camera frusta used by the crowd culler in addition to the
   *  view frustum, so off-screen casters stay alive for sun shadows. */
  cullingFrusta(): THREE.Frustum[];
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
      cullingFrusta: () => [],
      identity: () => identityFor(0, 0),
      dispose: () => {},
    };
  }

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = true;
  const shadow = sun.shadow;
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
      cullingFrusta: () => shadowFrustaForCascadeLights(csm.lights),
      identity: () => identityFor(CSM_CASCADES, CSM_MAP_SIZE),
      dispose: () => csm.dispose(),
    };
  }

  // 'single': one orthographic shadow camera fit to the whole terrain rect.
  shadow.mapSize.set(SINGLE_MAP_SIZE, SINGLE_MAP_SIZE);
  const fit = (rect: [number, number, number, number]) => {
    const [x, y, w, h] = rect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    // Re-anchor the sun on the map centre (same direction — shading identical)
    // so the ortho volume needs only the map's half-diagonal.
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    sun.target.position.set(cx, cy, 0);
    sun.position.set(cx + dir.x * 400, cy + dir.y * 400, dir.z * 400);
    const half = Math.hypot(w, h) / 2 + 40;
    const cam = shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = Math.max(0.1, 400 - half - 120);
    cam.far = 400 + half + 120;
    cam.updateProjectionMatrix();
  };
  fit([-220, -180, 440, 360]);
  return {
    mode,
    update: () => {},
    setWorldRect: fit,
    cullingFrusta: () => shadowFrustaForCascadeLights([sun]),
    identity: () => identityFor(1, SINGLE_MAP_SIZE),
    dispose: () => {},
  };
}

function shadowFrustaForCascadeLights(
  lights: Array<
    THREE.Object3D & { target?: THREE.Object3D; shadow?: THREE.DirectionalLightShadow }
  >,
): THREE.Frustum[] {
  const out: THREE.Frustum[] = [];
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
    out.push(
      new THREE.Frustum().setFromProjectionMatrix(mat, cam.coordinateSystem, cam.reversedDepth),
    );
  }
  return out;
}
