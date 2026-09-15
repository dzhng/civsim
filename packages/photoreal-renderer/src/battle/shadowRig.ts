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
  ShadowFitStabilizer,
  shadowRadiusForTurbidity,
  singleShadowFit,
  viewShadowFit,
  type ShadowViewFit,
  type SunShadowMode,
} from "../../../game-renderer/src/battle/shadowPolicy";
import * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import type { CivsimEnvironment } from "../../../game-renderer/src/environment/environment";
import { projectionFootprint, type Camera3DParams } from "../../../renderer-core/src/camera3d";
import type { CrowdProjectionView } from "../../../crowd-runtime/src/visibility";
import { CROWD_SHADOW_LAYER } from "./crowdAudience";

export interface SunShadowRig {
  readonly mode: SunShadowMode;
  /** Per-frame, after applyCamera3d, with the parameters the projection owner
   *  resolved: 'csm' re-splits its cascades, 'single' re-fits its one map to the
   *  ground this camera can see. No-op for 'off'. */
  update(view: Camera3DParams): void;
  /** Terrain rect and ground elevation range (setTerrain) — the receiver domain
   *  the single-tier fit clamps to. Elevation is optional for the comparison
   *  runtimes, which never pose a camera and stay on the whole-map fit. No-op
   *  for csm. */
  setWorldRect(
    rect: [number, number, number, number],
    elevation?: readonly [number, number],
  ): void;
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
    /** Single-tier fit evidence: what the map is actually spending itself on. */
    fit?: {
      extent: number;
      worldUnitsPerTexel: number;
      normalBias: number;
      coverage: number;
      /** Fits applied since construction — a stable camera must not raise it. */
      refits: number;
    };
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

  // 'single': one orthographic shadow camera. It is fitted to the ground the
  // live camera can see (viewShadowFit) once a projection is available, and to
  // the whole terrain rect (singleShadowFit) before that — the same whole-map
  // fallback the comparison runtimes use, so an unposed rig behaves as it did.
  shadow.mapSize.set(SINGLE_MAP_SIZE, SINGLE_MAP_SIZE);
  const stabilizer = new ShadowFitStabilizer();
  let rect: [number, number, number, number] = [-220, -180, 440, 360];
  let elevation: readonly [number, number] = [0, 0];
  let lastView: Camera3DParams | null = null;

  // The fit MOVES the light along its own axis, so reading the direction back
  // round-trips through our own arithmetic. Latch it: last-bit noise from that
  // round trip must not re-fit the map, while a real environment change must.
  let sunAxis: [number, number, number] = readSunDirection(sun);
  const sunDirection = (): [number, number, number] => {
    const dir = readSunDirection(sun);
    const drift = Math.abs(dir[0] - sunAxis[0]) + Math.abs(dir[1] - sunAxis[1]) + Math.abs(dir[2] - sunAxis[2]);
    if (drift > 1e-9) sunAxis = dir;
    return sunAxis;
  };
  const cam = shadow.camera;

  const viewFit = (view: Camera3DParams): ShadowViewFit =>
    viewShadowFit({
      camera: view,
      rect,
      elevation,
      unitSunDirection: sunDirection(),
      mapSize: SINGLE_MAP_SIZE,
      stabilizer,
    });

  const wholeMapFit = (): ShadowViewFit => {
    const whole = singleShadowFit(rect, sunDirection());
    const extent = whole.right - whole.left;
    return {
      ...whole,
      up: [0, 1, 0],
      extent,
      worldUnitsPerTexel: extent / SINGLE_MAP_SIZE,
      normalBias: SHADOW_NORMAL_BIAS,
      // No camera posed it, so nothing is offscreen to admit and nothing is
      // beyond its reach: the whole map is both its audience and its coverage.
      crowdNear: whole.near,
      coverage: extent,
      box: {
        x0: rect[0],
        y0: rect[1],
        x1: rect[0] + rect[2],
        y1: rect[1] + rect[3],
        z0: elevation[0],
        z1: elevation[1],
      },
    };
  };

  let applied = wholeMapFit();
  let refits = 0;
  const install = (next: ShadowViewFit): void => {
    if (refits > 0 && sameShadowMap(applied, next)) return;
    applied = next;
    refits++;
    sun.target.position.set(...next.target);
    sun.position.set(...next.position);
    cam.up.set(...next.up);
    cam.left = next.left;
    cam.right = next.right;
    cam.top = next.top;
    cam.bottom = next.bottom;
    cam.near = next.near;
    cam.far = next.far;
    // Normal offset is a property of texel size, not a free constant: the
    // 0.6 units tuned at the whole-map fit would erase contact at this density.
    shadow.normalBias = next.normalBias;
    cam.updateProjectionMatrix();
    shadow.needsUpdate = true;
  };

  install(applied);
  return {
    mode,
    update: (view) => {
      lastView = view;
      install(viewFit(view));
    },
    setWorldRect: (next, nextElevation) => {
      rect = next;
      elevation = nextElevation ?? [0, 0];
      // A new field invalidates the fitted extent, not the pose: re-rung from
      // scratch against the live camera if this rig has already seen one.
      stabilizer.reset();
      install(lastView ? viewFit(lastView) : wholeMapFit());
    },
    cullingViews: () => [crowdShadowView(sun, applied.crowdNear)],
    identity: () => ({
      ...identityFor(1, SINGLE_MAP_SIZE),
      fit: {
        extent: applied.extent,
        worldUnitsPerTexel: applied.worldUnitsPerTexel,
        normalBias: applied.normalBias,
        coverage: applied.coverage,
        refits,
      },
    }),
    dispose: () => shadow.dispose(),
  };
}

/** Two fits that would rasterise the same map: the ortho bounds and the normal
 *  offset both derive from the extent, so extent plus pose settles it. A
 *  stationary camera skips the rebuild instead of paying for an identical one. */
function sameShadowMap(a: ShadowViewFit, b: ShadowViewFit): boolean {
  return (
    a.extent === b.extent &&
    a.near === b.near &&
    a.far === b.far &&
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.position[2] === b.position[2]
  );
}

/** The crowd's share of the single map: the same pose and the same texels, with
 *  the near plane pulled back off the cliff ceiling to the height a body can
 *  actually cast from. Every soldier whose shadow can land on the map is still
 *  inside it; the ones that would have been submitted for a cliff's reach are not. */
function crowdShadowView(sun: THREE.DirectionalLight, near: number): CrowdProjectionView {
  const shadow = sun.shadow;
  const cam = shadow.camera;
  sun.updateMatrixWorld(true);
  sun.target.updateMatrixWorld(true);
  cam.position.setFromMatrixPosition(sun.matrixWorld);
  cam.lookAt(
    sun.target.matrixWorld.elements[12],
    sun.target.matrixWorld.elements[13],
    sun.target.matrixWorld.elements[14],
  );
  cam.updateMatrixWorld(true);
  const projection = new THREE.Matrix4().makeOrthographic(
    cam.left,
    cam.right,
    cam.top,
    cam.bottom,
    near,
    cam.far,
    cam.coordinateSystem,
    cam.reversedDepth,
  );
  const viewProjection = new THREE.Matrix4().multiplyMatrices(projection, cam.matrixWorldInverse);
  return {
    frustum: new THREE.Frustum().setFromProjectionMatrix(
      viewProjection,
      cam.coordinateSystem,
      cam.reversedDepth,
    ),
    projection: projectionFootprint(
      cam.matrixWorldInverse.elements,
      projection.elements,
      shadow.mapSize.y,
      near,
    ),
    shadow: true,
  };
}

function readSunDirection(sun: THREE.DirectionalLight): [number, number, number] {
  const dir = sun.position.clone().sub(sun.target.position).normalize();
  return [dir.x, dir.y, dir.z];
}

/** One view per CASCADE light. The single tier fits its own map and builds its
 *  own audience; this is the cascade path's. */
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
