import type {
  RawFrameShell,
  WorldRenderPass,
} from "../../../packages/renderer-core/src/frameShell";
import type { CameraSnapshot } from "../../../packages/renderer-core/src/cameraUniform";
import { cameraUniformData } from "../../../packages/renderer-core/src/cameraUniform";
import {
  eyePosition,
  invViewProj,
  viewProjMatrix,
} from "../../../packages/renderer-core/src/camera3d";

export type BackendName = "raw" | "typegpu" | "vgpu";
export type Camera = CameraSnapshot & { sunAzimuth: number; sunElevation: number };
export interface ShadowBackend {
  updateCamera(camera: Camera): void;
  setCount(count: number): void;
  draw(pass: WorldRenderPass): void;
  destroy(): void;
  details: Record<string, unknown>;
}
export type MakeBackend = (
  shell: RawFrameShell,
  quad: GPUBuffer,
  instances: GPUBuffer,
  count: number,
  camera: Camera,
) => Promise<ShadowBackend>;
export const quadData = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
export const shadowLayouts: GPUVertexBufferLayout[] = [
  { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
  {
    arrayStride: 16,
    stepMode: "instance",
    attributes: [{ shaderLocation: 1, offset: 0, format: "float32x4" }],
  },
];

// Values come from the production projection functions. Each library owns packing;
// the existing packer is an independent byte-layout oracle for the schema probe.
export function cameraValues(camera: Camera) {
  const params = { ...camera.camera3d, aspect: camera.width / Math.max(1, camera.height) };
  return {
    viewProj: Array.from(viewProjMatrix(params)),
    invViewProj: Array.from(invViewProj(params)),
    eye: eyePosition(params),
    znear: params.near,
    focus: [camera.x, camera.y] as [number, number],
    width: camera.width,
    height: camera.height,
    zoom: camera.zoom,
    tilt: Math.sin(Math.min(Math.PI / 2, Math.max(0, params.pitch))),
    time: camera.time ?? 0,
    zfar: params.far ?? 0,
    sunAz: camera.sunAzimuth,
    sunEl: camera.sunElevation,
  };
}
export { cameraUniformData };
