import {
  shadowPcfWgsl,
  shadowVisibilityWgsl,
  sunCascadeRecordWgsl,
  sunShadowSampleWgsl,
} from "../../../../packages/battle-renderer/src/shaders/shadow";
import type { createVgpuSunShadow } from "./shadow";
import { texture, sampler, type Gpu } from "vgpu";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import { skyModelParams } from "../../../../packages/game-renderer/src/environment/skyParameters";
import { createVgpuSky } from "./sky";
import { createVgpuPmrem } from "./pmrem";
import { cubeUvWGSL } from "../../../../packages/battle-renderer/src/shaders/pmrem";
import { standardPbrWgsl } from "../../../../packages/battle-renderer/src/shaders/standardPbr";
import { aerialWgsl } from "../../../../packages/battle-renderer/src/shaders/aerial";
import { equirectUvWgsl } from "../../../../packages/battle-renderer/src/shaders/physicalSky";
import { DFG_LUT_DATA, DFG_LUT_SIZE } from "../../../../packages/battle-renderer/src/shaders/dfgLut";
import { environmentFunctions, type WorldSurfaceDiagnostic } from "../../../../packages/battle-renderer/src/shaders/environment";

/** The frame owner lends its vgpu context. Every prepared resource/pipeline is vgpu-owned. */
export async function createVgpuEnvironment(
  gpu: Gpu,
  env: CivsimEnvironment,
  diagnostic?: WorldSurfaceDiagnostic,
  groupIndex = 2,
  backgroundSamples: 1 | 4 = 1,
  shadow?: ReturnType<typeof createVgpuSunShadow>,
) {
  const owned: { dispose(): void }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.dispose();
  };
  try {
    const sky = await createVgpuSky(gpu.device.gpu, skyModelParams(env), backgroundSamples);
    owned.push(sky);
    const pmrem = await createVgpuPmrem(gpu.device.gpu, sky.lut.gpu);
    owned.push(pmrem);
    const dfg = texture(gpu, {
      kind: "2d",
      size: [DFG_LUT_SIZE, DFG_LUT_SIZE],
      format: "rg16float",
      usage: ["texture_binding", "copy_dst"],
    });
    owned.push(dfg);
    // vgpu exposes texture creation/readback but no texel-upload method in0.5.0.
    gpu.device.queue.gpu.writeTexture(
      { texture: dfg.gpu },
      DFG_LUT_DATA,
      { bytesPerRow: DFG_LUT_SIZE * 4 },
      [DFG_LUT_SIZE, DFG_LUT_SIZE],
    );
    const data = gpu.device.createBuffer({ size: 128, usage: ["uniform", "copy_dst"] });
    owned.push(data);
    const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
    const spec = photorealEnvironment(env);
    const casterShader = `struct Environment {worldToView:mat4x4f,observer:vec4f,sunDirection:vec4f,sunRadiance:vec4f,settings:vec4f}; @group(${groupIndex}) @binding(0) var<uniform> environment:Environment;`;
    const shader = `
struct Environment {worldToView:mat4x4f,observer:vec4f,sunDirection:vec4f,sunRadiance:vec4f,settings:vec4f};
@group(${groupIndex}) @binding(0) var<uniform> environment:Environment;
@group(${groupIndex}) @binding(1) var environmentSky:texture_2d<f32>;
@group(${groupIndex}) @binding(2) var environmentPmrem:texture_2d<f32>;
@group(${groupIndex}) @binding(3) var environmentDfg:texture_2d<f32>;
@group(${groupIndex}) @binding(4) var environmentSampler:sampler;
${
  shadow
    ? `${sunCascadeRecordWgsl}
@group(${groupIndex}) @binding(5) var<uniform> sunShadow:SunCascade;
@group(${groupIndex}) @binding(6) var sunDepth:texture_depth_2d;
@group(${groupIndex}) @binding(7) var sunCompare:sampler_comparison;
fn shadowPcf${shadowPcfWgsl("single-map")}
fn shadowVisibility${shadowVisibilityWgsl("single-map")}
${sunShadowSampleWgsl("single", "single-map")}`
    : ""
}
${cubeUvWGSL}
fn standardPbr${standardPbrWgsl}
fn equirectUv${equirectUvWgsl}
fn applyAerial${aerialWgsl(env)}
${Object.entries(environmentFunctions(diagnostic))
  .map(([name, body]) => `fn ${name}${body}`)
  .join("\n")}
fn geometryRoughness(normalWorld:vec3f)->f32 { return geometryRoughnessWithView(normalWorld,environment.worldToView); }
fn shadeWorldSurface(base:vec3f,emissive:vec3f,roughness:f32,geomRoughness:f32,metal:f32,ao:f32,normal:vec3f,position:vec3f,shadow:f32)->vec4f{
return shadeEnvironment(base,emissive,roughness,geomRoughness,metal,ao,normal,position,shadow,cam.eye,environment.observer.xyz,environment.sunDirection.xyz,environment.sunRadiance.xyz,environment.settings.y,environment.settings.x,environmentSky,environmentPmrem,environmentDfg,environmentSampler);
}`;
    return {
      shader,
      shadows: Boolean(shadow),
      casterShader,
      casterBindings: { environment: data },
      bindings: {
        environment: data,
        environmentSky: sky.lut,
        environmentPmrem: pmrem.texture.createView(),
        environmentDfg: dfg,
        environmentSampler: linear,
        ...(shadow
          ? { sunShadow: shadow.state, sunDepth: shadow.depth, sunCompare: shadow.comparison }
          : {}),
      },
      sky,
      pmrem,
      exposure: spec.exposure,
      setView(view: ArrayLike<number>, observer: readonly [number, number, number]) {
        if (disposed) throw new Error("vgpu environment disposed");
        if (view.length !== 16) throw new Error("Expected camera view matrix");
        data.write(
          new Float32Array([
            ...Array.from(view),
            ...observer,
            0,
            ...spec.sunDirection,
            0,
            ...spec.sunColor.map((c) => c * spec.sunIntensity),
            0,
            pmrem.maxMip,
            spec.environmentIntensity,
            0,
            0,
          ]),
        );
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
export type VgpuEnvironment = Awaited<ReturnType<typeof createVgpuEnvironment>>;
