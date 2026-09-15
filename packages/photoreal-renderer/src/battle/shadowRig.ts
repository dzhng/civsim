// The environment owns sunlight; this adapter owns Three shadow resources and
// camera updates. Shared fit/filter policy lives outside the renderer runtime.
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  SINGLE_MAP_SIZE,
  SHADOW_MAX_FAR,
  CSM_LIGHT_MARGIN,
  SHADOW_BIAS,
  SHADOW_NORMAL_BIAS,
  SHADOW_CAM_NEAR,
  SHADOW_CAM_FAR,
  shadowRadiusForTurbidity,
  singleShadowFit,
  type SunShadowMode,
} from "../../../game-renderer/src/battle/shadowPolicy";
import * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import type { CivsimEnvironment } from "../../../game-renderer/src/environment/environment";
import { projectionFootprint } from "../../../renderer-core/src/camera3d";
import type { CrowdProjectionView } from "../../../crowd-runtime/src/visibility";
import { CROWD_SHADOW_LAYER } from "./crowdAudience";

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
  shadow.camera.userData.battleShadowCamera = true;
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
  const fit = (rect: [number, number, number, number]) => {
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    const fitted = singleShadowFit(rect, [dir.x, dir.y, dir.z]);
    sun.target.position.set(...fitted.target);
    sun.position.set(...fitted.position);
    const cam = shadow.camera;
    cam.left = fitted.left;
    cam.right = fitted.right;
    cam.top = fitted.top;
    cam.bottom = fitted.bottom;
    cam.near = fitted.near;
    cam.far = fitted.far;
    cam.updateProjectionMatrix();
    shadow.needsUpdate = true;
  };
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
    cam.userData.battleShadowCamera = true;
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
