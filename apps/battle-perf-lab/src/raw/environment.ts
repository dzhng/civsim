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

/** All native world materials share group3. Camera/projection stays group0,
 * with the canonical WORLD_CAMERA_WGSL block supplied by the material. */
export type WorldSurfaceDiagnostic = "albedo" | "normal" | "roughness" | "ao";
export function rawEnvironmentWgsl(
  env: CivsimEnvironment,
  diagnostic?: WorldSurfaceDiagnostic,
): string {
  const shade =
    diagnostic === "ao"
      ? "return vec4f(vec3f(ao),1);"
      : diagnostic === "albedo"
        ? "return vec4f(base,1);"
        : diagnostic === "normal"
          ? "return vec4f(normalize(normalWorld)*0.5+vec3f(0.5),1);"
          : diagnostic === "roughness"
            ? "return vec4f(min(max(roughness,0.0525)+geomRoughness,1.0),geomRoughness,metal,1);"
            : `let lit=standardPbr(base,emissive,roughness,geomRoughness,metal,ao,normalize(normalWorld),normalize(cam.eye-worldPosition),environment.sunDirection.xyz,environment.sunRadiance.xyz,shadow,environment.settings.y,environmentPmrem,environmentSampler,environment.settings.x,environmentDfg,environmentSampler);
      return applyAerial(vec4f(lit,1),worldPosition,cam.eye,environment.observer.xyz,environmentSky,environmentSampler);`;
  return `
    struct Environment {
      worldToView:mat4x4f, observer:vec4f, sunDirection:vec4f, sunRadiance:vec4f, settings:vec4f
    };
    @group(3) @binding(0) var<uniform> environment:Environment;
    @group(3) @binding(1) var environmentSky:texture_2d<f32>;
    @group(3) @binding(2) var environmentPmrem:texture_2d<f32>;
    @group(3) @binding(3) var environmentDfg:texture_2d<f32>;
    @group(3) @binding(4) var environmentSampler:sampler;
    ${cubeUvWGSL}
    fn standardPbr${standardPbrWgsl}
    fn equirectUv${equirectUvWgsl}
    fn applyAerial${aerialWgsl(env)}
    fn geometryRoughnessFromView(normalView:vec3f)->f32 {
      let n=normalize(normalView);
      let d=max(abs(dpdx(n)),abs(dpdy(n)));
      return max(max(d.x,d.y),d.z);
    }
    fn geometryRoughness(normalWorld:vec3f)->f32 {
      return geometryRoughnessFromView((environment.worldToView*vec4f(normalWorld,0)).xyz);
    }
    fn shadeWorldSurface(base:vec3f,emissive:vec3f,roughness:f32,geomRoughness:f32,metal:f32,ao:f32,normalWorld:vec3f,worldPosition:vec3f,shadow:f32)->vec4f {
      ${shade}
    }
  `;
}

/** Prepared once per environment. This owns the sky, IBL, DFG and one small view
 * buffer; borrowed device/camera data/output attachments retain their owners. */
export async function createRawEnvironment(device: GPUDevice, env: CivsimEnvironment) {
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
    sky = await createRawSky(device, skyModelParams(env));
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
      ],
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
      sky,
      pmrem,
      exposure: spec.exposure,
      shader: rawEnvironmentWgsl(env),
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
