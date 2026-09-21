import type { ImpostorAtlasData } from "../../../packages/soldier-assets/src/impostorAtlas";
import { tgpu } from "typegpu";
import { initFromDevice, target, frame } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { CrowdInstance } from "../../../packages/crowd-runtime/src/instanceData";
import { cameraUniformData } from "../../../packages/renderer-core/src/cameraUniform";
import { viewMatrix, type Camera3DParams } from "../../../packages/renderer-core/src/camera3d";
import { GPU_DEPTH_FORMAT } from "../../../packages/renderer-core/src/depthContract";
import type { ImpostorView } from "../../../packages/battle-renderer/src/impostorData";
import type { ImpostorAtlasLayout } from "../../../packages/soldier-assets/src/impostorAtlas";
import { impostorRecordFloats } from "../../../packages/battle-renderer/src/world/impostorDerivation";
import {
  SHADER_F32,
  compareImpostorRecords,
  localViewDirection,
  type RecordVerdict,
} from "../candidates/typegpu/impostorRecordCases";
import type { WorldSurfaceDiagnostic } from "../../../packages/battle-renderer/src/shaders/environment";
import { createRawEnvironment, rawEnvironmentWgsl } from "./raw/world/environment";
import { createRawImpostors } from "./raw/world/impostor";
import { createTypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import { createTypegpuImpostors } from "../../../packages/battle-renderer/src/world/impostor";
import { Camera, typegpuCameraLayout } from "../../../packages/battle-renderer/src/world/camera";
import { createVgpuEnvironment } from "./vgpu/environment";
import { createVgpuImpostors } from "./vgpu/impostor";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
import { readHdrTexture } from "./numericalReadback";

export type ImpostorBackend = "raw" | "typegpu" | "vgpu";
/** `packImpostors` pads its nine-float record to a sixteen-byte-aligned twelve per soldier. */
const PACKED_STRIDE = 12;
/** What every record in this gate is measured against. */
const REFERENCE = "three-instance-attributes";
/** What a layer can show the numerical control about the record its vertex stage consumes.
 *
 *  Raw and vgpu pack that record on the CPU and upload it, so they hand back the very
 *  Float32Array they wrote — the control's long-standing exact comparison against Three.
 *  The TypeGPU layer has no packed buffer: it uploads six camera-independent floats and a
 *  48-byte view block and derives the record in the vertex stage, so it reads records back
 *  from those installed buffers through the same derivation instead. */
export type ImpostorControlRecords =
  | { source: "uploaded-packed-record"; packed: Float32Array; stride: number }
  | { source: "gpu-derived-readback"; records: readonly (readonly number[])[] };
export interface ImpostorControlLayer {
  update(source: readonly CrowdInstance[], view: ImpostorView): void;
  /** Diagnostic, and allocating or reading back on some backends: never on a frame path. */
  controlRecords(): Promise<ImpostorControlRecords>;
  render(camera: Camera3DParams): Promise<GPUTexture>;
  stats(): {
    instances: number;
    draws: number;
    clipInvariant: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    atlasSource: string;
  };
  dispose(): void;
}
export interface ImpostorControlBackend {
  create(atlas: ImpostorAtlasData): Promise<ImpostorControlLayer>;
  borrowedResourcesAlive(): Promise<boolean>;
  dispose(): void;
}
/** One verdict per case, in the report the control publishes. */
export type ImpostorRecordControl =
  | {
      source: "uploaded-packed-record";
      reference: typeof REFERENCE;
      probes: number;
      compared: number;
      exact: number;
      /** Exact float-for-float agreement with Three, the gate this lab has always run. */
      packingEqual: boolean;
      passed: boolean;
    }
  | (RecordVerdict & {
      source: "gpu-derived-readback";
      reference: typeof REFERENCE;
      /** Declared before the comparison, never fitted to its outcome. */
      tolerance: string;
      dotBand: number;
      passed: boolean;
    });
/** The control's record gate, against Three's own instance attributes.
 *
 * A packed backend uploaded those nine floats, so the comparison stays what it has always
 * been: exact equality, float for float, with no tolerance anywhere in it.
 *
 * A derived backend has no packed buffer left to assert on — the former equality would be
 * comparing `packImpostors` to Three while the GPU ran a different computation. The
 * corresponding actual-GPU contract is the records read back out of the layer's installed
 * buffers, compared to the same Three attributes under tolerances declared by
 * `impostorRecordCases` before any comparison. Exact agreement is still counted and
 * reported; every tile difference is reported too, separated into cells baked from the
 * identical direction, cells the route cannot tell apart, and faults. */
export function compareControlRecords(
  atlas: ImpostorAtlasLayout,
  source: readonly CrowdInstance[],
  view: ImpostorView,
  three: (index: number) => readonly number[],
  actual: ImpostorControlRecords,
): ImpostorRecordControl {
  if (actual.source === "uploaded-packed-record") {
    let compared = 0,
      exact = 0;
    for (let i = 0; i < source.length; i++) {
      const expected = three(i);
      for (let c = 0; c < expected.length; c++) {
        compared++;
        if (actual.packed[i * actual.stride + c] === expected[c]) exact++;
      }
    }
    const packingEqual = exact === compared;
    return {
      source: actual.source,
      reference: REFERENCE,
      probes: source.length,
      compared,
      exact,
      packingEqual,
      passed: packingEqual,
    };
  }
  const probes = source.map((instance, index) => ({
    label: `soldier ${index}`,
    instance,
    view,
    direction: localViewDirection(instance, view),
  }));
  const verdict = compareImpostorRecords(
    atlas,
    probes,
    (_probe, index) => actual.records[index],
    SHADER_F32,
    (_probe, index) => three(index),
  );
  return {
    source: actual.source,
    reference: REFERENCE,
    tolerance: SHADER_F32.label,
    dotBand: SHADER_F32.dot,
    ...verdict,
    passed: verdict.faults.length === 0 && verdict.nonfinite.length === 0,
  };
}

/** Numerical-control adapter only. Each implementation owns its own resources and submission API. */
export async function createImpostorControlBackend(
  kind: ImpostorBackend,
  device: GPUDevice,
  env: CivsimEnvironment,
  samples: 1 | 4,
  width: number,
  height: number,
  errors: string[],
  diagnostic?: WorldSurfaceDiagnostic,
): Promise<ImpostorControlBackend> {
  const release: Array<() => void> = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of release.reverse()) f();
  };
  const cameraBytes = (camera: Camera3DParams) =>
    cameraUniformData({
      camera3d: camera,
      x: 0,
      y: 0,
      zoom: 8,
      width,
      height,
      sunAzimuth: 0,
      sunElevation: 0,
    });
  const finite = async (...textures: GPUTexture[]) =>
    (await Promise.all(textures.map((t) => readHdrTexture(device, t)))).every((p) =>
      p.every(Number.isFinite),
    );
  try {
    if (kind === "raw") {
      const environment = await createRawEnvironment(device, env);
      release.push(environment.dispose);
      if (diagnostic) environment.shader = rawEnvironmentWgsl(env, diagnostic);
      const camera = device.createBuffer({
        size: 192,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      release.push(() => camera.destroy());
      const layout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      });
      const group = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: camera } }],
      });
      const output = device.createTexture({
        size: [width, height],
        format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      release.push(() => output.destroy());
      const msaa =
        samples === 4
          ? device.createTexture({
              size: [width, height],
              format: "rgba16float",
              sampleCount: samples,
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            })
          : undefined;
      if (msaa) release.push(() => msaa.destroy());
      const depth = device.createTexture({
        size: [width, height],
        format: GPU_DEPTH_FORMAT,
        sampleCount: samples,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      release.push(() => depth.destroy());
      return {
        create: async (atlas) => {
          const layer = await createRawImpostors(device, atlas, layout, environment, samples);
          let packed = new Float32Array(0);
          return {
            ...layer,
            update: (source, view) => {
              packed = layer.update(source, view);
            },
            controlRecords: async () => ({
              source: "uploaded-packed-record" as const,
              packed,
              stride: PACKED_STRIDE,
            }),
            render: async (params) => {
              environment.setView(viewMatrix(params), [0, 0, 0]);
              device.queue.writeBuffer(camera, 0, cameraBytes(params));
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginRenderPass({
                colorAttachments: [
                  {
                    view: (msaa ?? output).createView(),
                    resolveTarget: msaa ? output.createView() : undefined,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: [0, 0, 0, 0],
                  },
                ],
                depthStencilAttachment: {
                  view: depth.createView(),
                  depthClearValue: 0,
                  depthLoadOp: "clear",
                  depthStoreOp: "store",
                },
              });
              layer.draw(pass, group);
              pass.end();
              device.queue.submit([encoder.finish()]);
              return output;
            },
          };
        },
        borrowedResourcesAlive: () => finite(output, environment.sky.lut),
        dispose,
      };
    }
    if (kind === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      release.push(() => root.destroy());
      const environment = await createTypegpuEnvironment(device, env, diagnostic);
      release.push(environment.dispose);
      const camera = root.createBuffer(Camera).$usage("uniform");
      release.push(() => camera.destroy());
      const group = root.createBindGroup(typegpuCameraLayout, { cam: camera });
      const output = root
        .createTexture({ size: [width, height], format: "rgba16float" })
        .$usage("render");
      release.push(() => output.destroy());
      const msaa =
        samples === 4
          ? root
              .createTexture({ size: [width, height], format: "rgba16float", sampleCount: samples })
              .$usage("render")
          : undefined;
      if (msaa) release.push(() => msaa.destroy());
      const depth = root
        .createTexture({ size: [width, height], format: GPU_DEPTH_FORMAT, sampleCount: samples })
        .$usage("render");
      release.push(() => depth.destroy());
      return {
        create: async (atlas) => {
          // Admitted with the record diagnostic: the control is its only caller.
          const layer = await createTypegpuImpostors(device, atlas, environment, samples, true);
          return {
            ...layer,
            update: (source, view) => {
              layer.updateState(source);
              layer.setView(view);
            },
            controlRecords: async () => ({
              source: "gpu-derived-readback" as const,
              records: (await layer.readRecords()).map(impostorRecordFloats),
            }),
            render: async (params) => {
              environment.setView(viewMatrix(params), [0, 0, 0]);
              camera.write(cameraBytes(params).buffer);
              const encoder = root["~unstable"].createCommandEncoder();
              const pass = encoder.beginRenderPass({
                colorAttachments: [
                  {
                    view: msaa ?? output,
                    resolveTarget: msaa ? output : undefined,
                    clearValue: [0, 0, 0, 0],
                  },
                ],
                depthStencilAttachment: { view: depth, depthClearValue: 0 },
              });
              layer.draw(pass, group);
              pass.end();
              encoder.submit();
              return root.unwrap(output);
            },
          };
        },
        borrowedResourcesAlive: () => finite(root.unwrap(output), environment.sky.lut),
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    release.push(() => gpu.dispose());
    const unsubscribe = gpu.onError((e) => errors.push(e.message));
    release.push(unsubscribe);
    const environment = await createVgpuEnvironment(gpu, env, diagnostic);
    release.push(environment.dispose);
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    release.push(() => camera.destroy());
    const output = target(gpu, {
      size: [width, height],
      format: "rgba16float",
      depth: GPU_DEPTH_FORMAT,
      msaa: samples === 4,
      clearColor: [0, 0, 0, 0],
    });
    release.push(() => destroyVgpuTarget(output));
    return {
      create: async (atlas) => {
        const layer = await createVgpuImpostors(gpu, atlas, environment, camera, samples);
        let packed = new Float32Array(0);
        return {
          ...layer,
          update: (source, view) => {
            packed = layer.update(source, view);
          },
          controlRecords: async () => ({
            source: "uploaded-packed-record" as const,
            packed,
            stride: PACKED_STRIDE,
          }),
          render: async (params) => {
            environment.setView(viewMatrix(params), [0, 0, 0]);
            camera.write(cameraBytes(params));
            await frame(gpu, (current) =>
              current.pass({ target: output, clear: [0, 0, 0, 0], clearDepth: 0 }, (pass) =>
                layer.draw(pass),
              ),
            ).done;
            return output.color.gpu;
          },
        };
      },
      borrowedResourcesAlive: () => finite(output.color.gpu, environment.sky.lut.gpu),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
