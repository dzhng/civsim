import {
  lookAt,
  multiply,
  invert,
  orthographicReverseZ,
  type Mat4,
} from "../../renderer-core/src/mat4";
import {
  SingleShadowPolicy,
  type ShadowViewFit,
  CSM_MAP_SIZE,
  SINGLE_MAP_SIZE,
  SHADOW_BIAS,
  SHADOW_MAX_FAR,
  sunShadowRadius,
} from "../../game-renderer/src/battle/shadowPolicy";
import {
  cascadeFits,
  resolveCascadeFar,
  type CascadeFit,
} from "../../game-renderer/src/battle/cascadePolicy";
import {
  SUN_CASCADE_RECORD_FLOATS,
  SUN_SHADOW_BLOCK_FLOATS,
  SUN_SHADOW_CONTROL_OFFSET,
} from "./shaders/shadow";
import {
  FINITE_CAMERA_FAR_FALLBACK,
  projectionFootprint,
  type Camera3DParams,
} from "../../renderer-core/src/camera3d";
import { reverseZFrustumPlanes } from "./crowdFrustum";
import type { CrowdProjectionView } from "../../crowd-runtime/src/visibility";
import type { CivsimEnvironment } from "../../game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../game-renderer/src/environment/physicalEnvironment";

/** The two modes that own depth resources. `off` never reaches this owner. */
export type NativeShadowMode = "single" | "csm";

/** Floats in one caster camera uniform (192 bytes) — the shared world camera
 *  layout, posed as the light instead of the eye. */
export const SHADOW_CAMERA_FLOATS = 48;

export interface NativeShadowCascade {
  index: number;
  /** This cascade's own caster camera. Distinct per cascade: two passes sharing
   *  one buffer would both see the last write queued before submission. */
  camera: Float32Array<ArrayBuffer>;
  view: Mat4;
  projection: Mat4;
  viewProjection: Mat4;
  near: number;
  crowdView: CrowdProjectionView;
}

export interface NativeShadowData {
  mode: NativeShadowMode;
  mapSize: number;
  cascades: readonly NativeShadowCascade[];
  /** The fixed 208-byte receiver block — every shadow receiver's only uniform. */
  receiver: Float32Array<ArrayBuffer>;
  /** Fit evidence, not a second projection owner. */
  cappedFar: number;
  crowdViews: CrowdProjectionView[];
}

/** One caster camera, packed into the shared world camera layout. */
function casterCamera(
  viewProjection: Mat4,
  position: readonly number[],
  target: readonly number[],
  near: number,
  far: number,
  mapSize: number,
): Float32Array<ArrayBuffer> {
  const inverse = invert(viewProjection);
  if (!inverse) throw Error("Singular shadow projection");
  const camera = new Float32Array(SHADOW_CAMERA_FLOATS);
  camera.set(viewProjection);
  camera.set(inverse, 16);
  camera.set(position.slice(0, 3), 32);
  camera[35] = near;
  camera.set(target.slice(0, 2), 36);
  camera[38] = camera[39] = mapSize;
  camera[43] = far;
  return camera;
}

/** Writes one cascade record into the receiver block. The matrix is the SAME
 *  world-to-shadow-clip matrix its caster pass rendered with. */
function writeRecord(
  receiver: Float32Array<ArrayBuffer>,
  index: number,
  viewProjection: ArrayLike<number>,
  depthBias: number,
  normalBias: number,
  radius: number,
  interval: readonly [number, number],
): void {
  const at = index * SUN_CASCADE_RECORD_FLOATS;
  receiver.set(viewProjection, at);
  receiver.set([depthBias, normalBias, radius, 0], at + 16);
  receiver.set([interval[0], interval[1], 0, 0], at + 20);
}

/** The record no active cascade owns. Initialized to an identity matrix and an
 *  EMPTY interval at the far limit, so nothing can select it and no shader path
 *  can reach a depth layer the array does not have. */
function writeInactiveRecord(receiver: Float32Array<ArrayBuffer>, index: number): void {
  const at = index * SUN_CASCADE_RECORD_FLOATS;
  receiver.fill(0, at, at + SUN_CASCADE_RECORD_FLOATS);
  for (const diagonal of [0, 5, 10, 15]) receiver[at + diagonal] = 1;
  receiver.set([1, 1, 0, 0], at + 20);
}

function shadowFrameData(
  environment: CivsimEnvironment,
  fit: ShadowViewFit,
  cappedFar: number,
): NativeShadowData {
  const view = lookAt(fit.position, fit.target, fit.up);
  const projection = orthographicReverseZ(
    fit.left,
    fit.right,
    fit.top,
    fit.bottom,
    fit.near,
    fit.far,
  );
  const viewProjection = multiply(projection, view);
  const radius = sunShadowRadius(environment.physical.turbidity, "single");
  const receiver = new Float32Array(SUN_SHADOW_BLOCK_FLOATS);
  // The fitted map owns the whole receiver range; it is sampled directly, so
  // the interval is only evidence of that.
  writeRecord(receiver, 0, viewProjection, SHADOW_BIAS, fit.normalBias, radius, [0, 1]);
  writeInactiveRecord(receiver, 1);
  receiver.set([cappedFar, 1, 0, 0], SUN_SHADOW_CONTROL_OFFSET);
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
  const crowdView: CrowdProjectionView = {
    shadow: true,
    frustum: { planes: reverseZFrustumPlanes(multiply(crowdProjection, view)) },
    projection: projectionFootprint(view, crowdProjection, SINGLE_MAP_SIZE, fit.crowdNear),
  };
  return {
    mode: "single",
    mapSize: SINGLE_MAP_SIZE,
    cascades: [
      {
        index: 0,
        camera: casterCamera(
          viewProjection,
          fit.position,
          fit.target,
          fit.near,
          fit.far,
          SINGLE_MAP_SIZE,
        ),
        view,
        projection,
        viewProjection,
        near: fit.near,
        crowdView,
      },
    ],
    receiver,
    cappedFar,
    crowdViews: [crowdView],
  };
}

function cascadeFrameData(
  environment: CivsimEnvironment,
  camera: Camera3DParams,
  sun: readonly [number, number, number],
): NativeShadowData {
  const frame = cascadeFits({
    camera,
    resolvedFar: FINITE_CAMERA_FAR_FALLBACK,
    unitSunDirection: sun,
  });
  const radius = sunShadowRadius(environment.physical.turbidity, "csm");
  const receiver = new Float32Array(SUN_SHADOW_BLOCK_FLOATS);
  const cascades = frame.cascades.map((fit: CascadeFit) => {
    writeRecord(
      receiver,
      fit.index,
      fit.viewProjection,
      fit.depthBias,
      fit.normalBias,
      radius,
      fit.interval,
    );
    return {
      index: fit.index,
      camera: casterCamera(
        fit.viewProjection,
        fit.position,
        fit.target,
        fit.near,
        fit.far,
        frame.mapSize,
      ),
      view: fit.view,
      projection: fit.projection,
      viewProjection: fit.viewProjection,
      near: fit.near,
      // The cascade audience is the cascade's own box: the source culls each
      // cascade light against its full depth range, not a crowd-only near plane.
      crowdView: {
        shadow: true as const,
        frustum: { planes: reverseZFrustumPlanes(fit.viewProjection) },
        projection: projectionFootprint(fit.view, fit.projection, frame.mapSize, fit.near),
      },
    };
  });
  receiver.set([frame.cappedFar, cascades.length, 0, 0], SUN_SHADOW_CONTROL_OFFSET);
  return {
    mode: "csm",
    mapSize: frame.mapSize,
    cascades,
    receiver,
    cappedFar: frame.cappedFar,
    crowdViews: cascades.map((cascade) => cascade.crowdView),
  };
}

/** The receiver block a mode publishes before it has ever seen a camera: legal,
 *  empty and explicitly zero-cascade, so no draw can read stale uniform memory. */
function coldFrameData(mode: NativeShadowMode): NativeShadowData {
  const receiver = new Float32Array(SUN_SHADOW_BLOCK_FLOATS);
  writeInactiveRecord(receiver, 0);
  writeInactiveRecord(receiver, 1);
  receiver.set([SHADOW_MAX_FAR, 0, 0, 0], SUN_SHADOW_CONTROL_OFFSET);
  return {
    mode,
    mapSize: mode === "csm" ? CSM_MAP_SIZE : SINGLE_MAP_SIZE,
    cascades: [],
    receiver,
    cappedFar: SHADOW_MAX_FAR,
    crowdViews: [],
  };
}

/** Native packing and upload cadence for the shared fits. Resource adapters own
 * the buffers; every native backend consumes these same matrices and audience.
 *
 * Both modes fit from the camera handed in, so a fit and the culling views built
 * from it always describe the SAME frame. The source instead initializes its
 * cascade lights during first render and positions them during render update,
 * which leaves its pre-render crowd admission with prior-frame cascade boxes on
 * a pan; that lag is deliberately not reproduced. */
export class NativeShadowFrame {
  private readonly policy: SingleShadowPolicy | null;
  private readonly sun: readonly [number, number, number];
  private revision = 0;
  private current: NativeShadowData;

  constructor(
    private readonly environment: CivsimEnvironment,
    readonly mode: NativeShadowMode,
    private readonly upload: (data: NativeShadowData) => void,
  ) {
    this.sun = photorealEnvironment(environment).sunDirection;
    this.policy = mode === "single" ? new SingleShadowPolicy(this.sun) : null;
    this.current = coldFrameData(mode);
    this.upload(this.current);
  }

  get data(): NativeShadowData {
    return this.current;
  }

  /** The receiver domain the fitted single map clamps to. Cascades derive their
   *  boxes from the camera alone, exactly as the source does, so this is a
   *  no-op for High rather than a second fit input. */
  setWorldRect(
    rect: readonly [number, number, number, number],
    elevation: readonly [number, number] = [0, 0],
  ): NativeShadowData {
    if (!this.policy) return this.current;
    this.policy.setWorldRect(rect, elevation);
    return this.installSingle();
  }

  update(camera: Camera3DParams): NativeShadowData {
    if (this.policy) {
      this.policy.update(camera);
      return this.installSingle(cappedFarFor(camera));
    }
    const next = cascadeFrameData(this.environment, camera, this.sun);
    if (sameCascadeFrame(this.current, next)) return this.current;
    this.current = next;
    this.upload(next);
    return next;
  }

  /** The single fit is expensive enough to be worth not repacking when the
   *  policy reports no refit; the cascade path compares its own cheap fit key. */
  private installSingle(cappedFar = this.current.cappedFar): NativeShadowData {
    const policy = this.policy!;
    if (this.revision === policy.refits && this.current.cappedFar === cappedFar)
      return this.current;
    this.revision = policy.refits;
    this.current = shadowFrameData(this.environment, policy.fit, cappedFar);
    this.upload(this.current);
    return this.current;
  }
}

function cappedFarFor(camera: Camera3DParams): number {
  return resolveCascadeFar({ camera, resolvedFar: FINITE_CAMERA_FAR_FALLBACK }).cappedFar;
}

/** Everything a repack would change. The receiver block carries every cascade's
 *  world-to-shadow matrix, bias, interval and the split reference; the caster
 *  cameras and the audience derive from those same fits, so an identical block
 *  means an identical frame and the buffers can keep what they already hold. */
function sameCascadeFrame(a: NativeShadowData, b: NativeShadowData): boolean {
  if (a.cascades.length !== b.cascades.length) return false;
  for (let i = 0; i < SUN_SHADOW_BLOCK_FLOATS; i++)
    if (a.receiver[i] !== b.receiver[i]) return false;
  return true;
}
