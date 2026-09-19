import {
  lookAt,
  multiply,
  invert,
  orthographicReverseZ,
} from "../../renderer-core/src/mat4";
import {
  SingleShadowPolicy,
  type ShadowViewFit,
  SINGLE_MAP_SIZE,
  SHADOW_BIAS,
  shadowRadiusForTurbidity,
} from "../../game-renderer/src/battle/shadowPolicy";
import {
  projectionFootprint,
  type Camera3DParams,
} from "../../renderer-core/src/camera3d";
import { reverseZFrustumPlanes } from "./crowdFrustum";
import type { CrowdProjectionView } from "../../crowd-runtime/src/visibility";
import type { CivsimEnvironment } from "../../game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../game-renderer/src/environment/physicalEnvironment";

function shadowFrameData(environment: CivsimEnvironment, fit: ShadowViewFit) {
  const view = lookAt(fit.position, fit.target, fit.up);
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
    [SHADOW_BIAS, fit.normalBias, shadowRadiusForTurbidity(environment.physical.turbidity), 1],
    16,
  );
  // Terrain rasterization keeps the full elevation range; bodies only cast
  // within the independently fitted crowd depth range.
  const crowdProjection = orthographicReverseZ(
    fit.left,
    fit.right,
    fit.top,
    fit.bottom,
    fit.crowdNear,
    fit.far,
  );
  const crowdViews: CrowdProjectionView[] = [
    {
      shadow: true,
      frustum: { planes: reverseZFrustumPlanes(multiply(crowdProjection, view)) },
      projection: projectionFootprint(view, crowdProjection, SINGLE_MAP_SIZE, fit.crowdNear),
    },
  ];
  return {
    crowdViews,
    camera,
    state,
    view,
    projection,
    viewProjection,
    near: fit.near,
    mapSize: SINGLE_MAP_SIZE,
  };
}

/** Native packing and upload cadence for the shared fit. Resource adapters own
 * the buffers; every native backend consumes these same matrices and audience. */
export class NativeShadowFrame {
  private readonly policy: SingleShadowPolicy;
  private revision = 0;
  private data!: ReturnType<typeof shadowFrameData>;

  constructor(
    private readonly environment: CivsimEnvironment,
    private readonly upload: (data: ReturnType<typeof shadowFrameData>) => void,
  ) {
    this.policy = new SingleShadowPolicy(photorealEnvironment(environment).sunDirection);
  }

  setWorldRect(
    rect: readonly [number, number, number, number],
    elevation: readonly [number, number] = [0, 0],
  ) {
    this.policy.setWorldRect(rect, elevation);
    return this.install();
  }

  update(camera: Camera3DParams) {
    this.policy.update(camera);
    return this.install();
  }

  private install() {
    if (this.revision !== this.policy.refits) {
      const data = shadowFrameData(this.environment, this.policy.fit);
      this.upload(data);
      this.data = data;
      this.revision = this.policy.refits;
    }
    return this.data;
  }
}
