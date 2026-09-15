import {
  lookAt,
  multiply,
  invert,
  orthographicReverseZ,
} from "../../../packages/renderer-core/src/mat4";
import {
  singleShadowFit,
  SINGLE_MAP_SIZE,
  SHADOW_BIAS,
  SHADOW_NORMAL_BIAS,
  shadowRadiusForTurbidity,
} from "../../../packages/game-renderer/src/battle/shadowPolicy";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../packages/game-renderer/src/environment/physicalEnvironment";

export function shadowFrameData(
  environment: CivsimEnvironment,
  rect: readonly [number, number, number, number],
) {
  const spec = photorealEnvironment(environment);
  const fit = singleShadowFit(rect, spec.sunDirection);
  // Three's directional shadow camera retains its default +Y up axis.
  const view = lookAt(fit.position, fit.target, [0, 1, 0]);
  const projection = orthographicReverseZ(
    fit.left,
    fit.right,
    fit.top,
    fit.bottom,
    fit.near,
    fit.far,
  );
  const viewProjection = multiply(projection, view),
    inverse = invert(viewProjection);
  if (!inverse) throw Error("Singular shadow projection");
  const camera = new Float32Array(48);
  camera.set(viewProjection);
  camera.set(inverse, 16);
  camera.set(fit.position, 32);
  camera[35] = fit.near;
  camera.set(fit.target.slice(0, 2), 36);
  camera[38] = camera[39] = SINGLE_MAP_SIZE;
  camera[43] = fit.far;
  const state = new Float32Array(20);
  state.set(viewProjection);
  state.set(
    [SHADOW_BIAS, SHADOW_NORMAL_BIAS, shadowRadiusForTurbidity(environment.physical.turbidity), 1],
    16,
  );
  return {
    camera,
    state,
    view,
    projection,
    viewProjection,
    near: fit.near,
    mapSize: SINGLE_MAP_SIZE,
  };
}
