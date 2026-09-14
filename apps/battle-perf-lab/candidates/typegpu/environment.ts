import { tgpu, d } from "typegpu";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import { skyModelParams } from "../../../../packages/game-renderer/src/environment/skyParameters";
import { createTypegpuSky } from "./sky";
import { createTypegpuPmrem } from "./pmrem";
import { samplePmrem } from "./pmremSampling";
import { standardPbrWgsl } from "../../src/shaders/standardPbr";
import { aerialWgsl } from "../../src/shaders/aerial";
import { equirectUvWgsl } from "../../src/shaders/physicalSky";
import { DFG_LUT_DATA, DFG_LUT_SIZE } from "../../src/shaders/dfgLut";
import { environmentFunctions, type WorldSurfaceDiagnostic } from "../../src/shaders/environment";

const Environment = d.struct({
  worldToView: d.mat4x4f,
  observer: d.vec4f,
  sunDirection: d.vec4f,
  sunRadiance: d.vec4f,
  settings: d.vec4f,
});
export const environmentLayout = tgpu.bindGroupLayout({
  data: { uniform: Environment, visibility: ["vertex", "fragment"] },
  sky: { texture: d.texture2d(), visibility: ["fragment"] },
  pmrem: { texture: d.texture2d(), visibility: ["fragment"] },
  dfg: { texture: d.texture2d(), visibility: ["fragment"] },
  linear: { sampler: "filtering", visibility: ["fragment"] },
});
const standardPbr = tgpu
  .fn(
    [
      d.vec3f,
      d.vec3f,
      d.f32,
      d.f32,
      d.f32,
      d.f32,
      d.vec3f,
      d.vec3f,
      d.vec3f,
      d.vec3f,
      d.f32,
      d.f32,
      d.texture2d(),
      d.sampler(),
      d.f32,
      d.texture2d(),
      d.sampler(),
    ],
    d.vec3f,
  )(standardPbrWgsl)
  .$uses({ samplePmrem });
const equirectUv = tgpu.fn([d.vec3f], d.vec2f)(equirectUvWgsl);

/** TypeGPU resource ownership; exposed GPU views are borrowed by component bindings. */
export async function createTypegpuEnvironment(
  device: GPUDevice,
  env: CivsimEnvironment,
  diagnostic?: WorldSurfaceDiagnostic,
) {
  const root = tgpu.initFromDevice({ device }),
    owned: { destroy(): void }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
    root.destroy();
  };
  try {
    const sky = await createTypegpuSky(device, skyModelParams(env));
    owned.push({ destroy: sky.dispose });
    const pmrem = await createTypegpuPmrem(device, sky.lut);
    owned.push({ destroy: pmrem.dispose });
    const dfg = root
      .createTexture({ size: [DFG_LUT_SIZE, DFG_LUT_SIZE], format: "rg16float" })
      .$usage("sampled");
    owned.push(dfg);
    dfg.write(DFG_LUT_DATA);
    const data = root.createBuffer(Environment).$usage("uniform");
    owned.push(data);
    const linear = root.createSampler({ minFilter: "linear", magFilter: "linear" });
    const group = root.createBindGroup(environmentLayout, {
      data,
      sky: sky.lut.createView(),
      pmrem: pmrem.texture.createView(),
      dfg: dfg.createView(),
      linear,
    });
    const spec = photorealEnvironment(env),
      functions = environmentFunctions(diagnostic);
    const applyAerial = tgpu
      .fn(
        [d.vec4f, d.vec3f, d.vec3f, d.vec3f, d.texture2d(), d.sampler()],
        d.vec4f,
      )(aerialWgsl(env))
      .$uses({ equirectUv });
    const fromView = tgpu.fn([d.vec3f], d.f32)(functions.geometryRoughnessFromView);
    const shadeAlgorithm = tgpu
      .fn(
        [
          d.vec3f,
          d.vec3f,
          d.f32,
          d.f32,
          d.f32,
          d.f32,
          d.vec3f,
          d.vec3f,
          d.f32,
          d.vec3f,
          d.vec3f,
          d.vec3f,
          d.vec3f,
          d.f32,
          d.f32,
          d.texture2d(),
          d.texture2d(),
          d.texture2d(),
          d.sampler(),
        ],
        d.vec4f,
      )(functions.shadeEnvironment)
      .$uses({ standardPbr, applyAerial });
    const shade = tgpu.fn(
      [d.vec3f, d.vec3f, d.f32, d.f32, d.f32, d.f32, d.vec3f, d.vec3f, d.f32, d.vec3f],
      d.vec4f,
    )((base, emissive, roughness, geomRoughness, metal, ao, normal, position, shadow, eye) => {
      "use gpu";
      return shadeAlgorithm(
        base,
        emissive,
        roughness,
        geomRoughness,
        metal,
        ao,
        normal,
        position,
        shadow,
        eye,
        environmentLayout.$.data.observer.xyz,
        environmentLayout.$.data.sunDirection.xyz,
        environmentLayout.$.data.sunRadiance.xyz,
        environmentLayout.$.data.settings.y,
        environmentLayout.$.data.settings.x,
        environmentLayout.$.sky,
        environmentLayout.$.pmrem,
        environmentLayout.$.dfg,
        environmentLayout.$.linear,
      );
    });
    return {
      group,
      shade,
      geometryRoughnessFromView: fromView,
      sky,
      pmrem,
      exposure: spec.exposure,
      setView(worldToView: ArrayLike<number>, observer: readonly [number, number, number]) {
        if (disposed) throw Error("TypeGPU environment disposed");
        if (worldToView.length !== 16) throw Error("Expected camera view matrix");
        data.write({
          worldToView: Array.from(worldToView),
          observer: d.vec4f(...observer, 0),
          sunDirection: d.vec4f(...spec.sunDirection, 0),
          sunRadiance: d.vec4f(
            ...(spec.sunColor.map((c) => c * spec.sunIntensity) as [number, number, number]),
            0,
          ),
          settings: d.vec4f(pmrem.maxMip, spec.environmentIntensity, 0, 0),
        });
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
export type TypegpuEnvironment = Awaited<ReturnType<typeof createTypegpuEnvironment>>;
