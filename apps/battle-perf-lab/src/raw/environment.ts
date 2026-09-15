import type { RawSunShadow } from "./shadow";
import { shadowPcfWgsl, shadowVisibilityWgsl } from "../shaders/shadow";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import { skyModelParams } from "../../../../packages/game-renderer/src/environment/skyParameters";
import { createRawSky } from "./sky";
import { createRawPmrem } from "./pmrem";
import { cubeUvWGSL } from "../shaders/pmrem";
import { standardPbrWgsl } from "../shaders/standardPbr";
import { aerialWgsl } from "../shaders/aerial";
import { equirectUvWgsl } from "../shaders/physicalSky";
import { DFG_LUT_DATA, DFG_LUT_SIZE } from "../shaders/dfgLut";

import { environmentFunctions, type WorldSurfaceDiagnostic } from "../shaders/environment";

/** All native world materials share group3. Camera/projection stays group0,
 * with the canonical WORLD_CAMERA_WGSL block supplied by the material. */
export function rawEnvironmentWgsl(
  env: CivsimEnvironment,
  diagnostic?: WorldSurfaceDiagnostic,
  shadows = false,
): string {
  return `
    struct Environment {
      worldToView:mat4x4f, observer:vec4f, sunDirection:vec4f, sunRadiance:vec4f, settings:vec4f
    };
    @group(3) @binding(0) var<uniform> environment:Environment;
    @group(3) @binding(1) var environmentSky:texture_2d<f32>;
    @group(3) @binding(2) var environmentPmrem:texture_2d<f32>;
    @group(3) @binding(3) var environmentDfg:texture_2d<f32>;
    @group(3) @binding(4) var environmentSampler:sampler;
    ${
      shadows
        ? `
    struct SunShadow {matrix:mat4x4f,settings:vec4f};
    @group(3) @binding(5) var<uniform> sunShadow:SunShadow;
    @group(3) @binding(6) var sunDepth:texture_depth_2d;
    @group(3) @binding(7) var sunCompare:sampler_comparison;
    fn shadowPcf${shadowPcfWgsl}
    fn shadowVisibility${shadowVisibilityWgsl}
    fn sampleSunShadow(world:vec3f,normal:vec3f,pixel:vec2f)->f32 {
      return shadowVisibility(sunDepth,sunCompare,sunShadow.matrix,sunShadow.settings,world,normal,pixel);
    }`
        : ""
    }
    ${cubeUvWGSL}
    fn standardPbr${standardPbrWgsl}
    fn equirectUv${equirectUvWgsl}
    fn applyAerial${aerialWgsl(env)}
    ${Object.entries(environmentFunctions(diagnostic))
      .map(([name, body]) => `fn ${name}${body}`)
      .join("\n")}
    fn geometryRoughness(normalWorld:vec3f)->f32 {
      return geometryRoughnessWithView(normalWorld,environment.worldToView);
    }
    fn shadeWorldSurface(base:vec3f,emissive:vec3f,roughness:f32,geomRoughness:f32,metal:f32,ao:f32,normalWorld:vec3f,worldPosition:vec3f,shadow:f32)->vec4f {
      return shadeEnvironment(base,emissive,roughness,geomRoughness,metal,ao,normalWorld,worldPosition,shadow,cam.eye,environment.observer.xyz,environment.sunDirection.xyz,environment.sunRadiance.xyz,environment.settings.y,environment.settings.x,environmentSky,environmentPmrem,environmentDfg,environmentSampler);
    }
  `;
}

/** Prepared once per environment. This owns the sky, IBL, DFG and one small view
 * buffer; borrowed device/camera data/output attachments retain their owners. */
export async function createRawEnvironment(
  device: GPUDevice,
  env: CivsimEnvironment,
  backgroundSamples: 1 | 4 = 1,
  shadow?: Pick<RawSunShadow, "state" | "depth" | "comparison">,
) {
  const spec = photorealEnvironment(env);
  let sky: Awaited<ReturnType<typeof createRawSky>> | undefined;
  let pmrem: Awaited<ReturnType<typeof createRawPmrem>> | undefined;
  let dfg: GPUTexture | undefined, uniform: GPUBuffer | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    sky?.dispose();
    pmrem?.dispose();
    dfg?.destroy();
    uniform?.destroy();
  };
  try {
    sky = await createRawSky(device, skyModelParams(env), backgroundSamples);
    pmrem = await createRawPmrem(device, sky.lut);
    dfg = device.createTexture({
      size: [DFG_LUT_SIZE, DFG_LUT_SIZE],
      format: "rg16float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: dfg }, DFG_LUT_DATA, { bytesPerRow: DFG_LUT_SIZE * 4 }, [
      DFG_LUT_SIZE,
      DFG_LUT_SIZE,
    ]);
    uniform = device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    const layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        ...[1, 2, 3].map((binding) => ({
          binding,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" as const },
        })),
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ...(shadow
          ? [
              {
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" as const },
              },
              {
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "depth" as const },
              },
              {
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "comparison" as const },
              },
            ]
          : []),
      ],
    });
    const bindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: sky.lut.createView() },
        { binding: 2, resource: pmrem.texture.createView() },
        { binding: 3, resource: dfg.createView() },
        { binding: 4, resource: sampler },
        ...(shadow
          ? [
              { binding: 5, resource: { buffer: shadow.state } },
              { binding: 6, resource: shadow.depth.createView() },
              { binding: 7, resource: shadow.comparison },
            ]
          : []),
      ],
    });
    // A caster must not bind the sampled depth texture it is currently writing.
    // Its vertex stage needs only the existing view uniform from this owner.
    const casterLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
    });
    const casterBindGroup = device.createBindGroup({
      layout: casterLayout,
      entries: [{ binding: 0, resource: { buffer: uniform } }],
    });
    const values = new Float32Array(32);
    values.set(spec.sunDirection, 20);
    values.set(
      spec.sunColor.map((c) => c * spec.sunIntensity),
      24,
    );
    values[28] = pmrem.maxMip;
    values[29] = spec.environmentIntensity;
    return {
      layout,
      bindGroup,
      casterLayout,
      casterBindGroup,
      shadows: Boolean(shadow),
      sky,
      pmrem,
      exposure: spec.exposure,
      shader: rawEnvironmentWgsl(env, undefined, Boolean(shadow)),
      /** View matrix must come from renderer-core camera3d; observer is the exact
       * camera ground target, including its terrain elevation. */
      setView(worldToView: ArrayLike<number>, observer: readonly [number, number, number]) {
        if (disposed) throw new Error("Raw environment is disposed");
        if (worldToView.length !== 16) throw new Error("Expected a camera view matrix");
        values.set(worldToView, 0);
        values.set(observer, 16);
        device.queue.writeBuffer(uniform!, 0, values);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
export type RawEnvironment = Awaited<ReturnType<typeof createRawEnvironment>>;
