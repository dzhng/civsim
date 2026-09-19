import { SunSampling, shadowVisibility, type createTypegpuSunShadow } from "./shadow";
import { typegpuTextureBytes } from "./textureUpload";
import { tgpu, d } from "typegpu";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import { skyModelParams } from "../../../../packages/game-renderer/src/environment/skyParameters";
import { createTypegpuSky } from "./sky";
import { createTypegpuPmrem } from "./pmrem";
import { samplePmrem } from "./pmremSampling";
import { standardPbrWgsl } from "../../../../packages/battle-renderer/src/shaders/standardPbr";
import { aerialWgsl } from "../../../../packages/battle-renderer/src/shaders/aerial";
import { equirectUvWgsl } from "../../../../packages/battle-renderer/src/shaders/physicalSky";
import { DFG_LUT_DATA, DFG_LUT_SIZE } from "../../../../packages/battle-renderer/src/shaders/dfgLut";
import { environmentFunctions, type WorldSurfaceDiagnostic } from "../../../../packages/battle-renderer/src/shaders/environment";

const Environment = d.struct({
  worldToView: d.mat4x4f,
  observer: d.vec4f,
  sunDirection: d.vec4f,
  sunRadiance: d.vec4f,
  settings: d.vec4f,
});
const environmentEntries = {
  data: { uniform: Environment, visibility: ["vertex", "fragment"] },
  sky: { texture: d.texture2d(), visibility: ["fragment"] },
  pmrem: { texture: d.texture2d(), visibility: ["fragment"] },
  dfg: { texture: d.texture2d(), visibility: ["fragment"] },
  linear: { sampler: "filtering", visibility: ["fragment"] },
} satisfies Parameters<typeof tgpu.bindGroupLayout>[0];
export const environmentLayout = tgpu.bindGroupLayout(environmentEntries);
const shadowEnvironmentLayout = tgpu.bindGroupLayout({
  ...environmentEntries,
  sun: { uniform: SunSampling, visibility: ["fragment"] },
  sunDepth: { texture: d.textureDepth2d(), visibility: ["fragment"] },
  sunCompare: { sampler: "comparison", visibility: ["fragment"] },
});
const casterEnvironmentLayout = tgpu.bindGroupLayout({
  data: { uniform: Environment, visibility: ["vertex"] },
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
  backgroundSamples: 1 | 4 = 1,
  shadow?: ReturnType<typeof createTypegpuSunShadow>,
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
    const sky = await createTypegpuSky(device, skyModelParams(env), backgroundSamples);
    owned.push({ destroy: sky.dispose });
    const pmrem = await createTypegpuPmrem(device, sky.lut);
    owned.push({ destroy: pmrem.dispose });
    const dfg = root
      .createTexture({ size: [DFG_LUT_SIZE, DFG_LUT_SIZE], format: "rg16float" })
      .$usage("sampled");
    owned.push(dfg);
    dfg.write(typegpuTextureBytes(DFG_LUT_DATA));
    const data = root.createBuffer(Environment).$usage("uniform");
    owned.push(data);
    const linear = root.createSampler({ minFilter: "linear", magFilter: "linear" });
    const resources = {
      data,
      sky: sky.lut.createView(),
      pmrem: pmrem.texture.createView(),
      dfg: dfg.createView(),
      linear,
    };
    const layout = shadow ? shadowEnvironmentLayout : environmentLayout;
    const group = shadow
      ? root.createBindGroup(shadowEnvironmentLayout, {
          ...resources,
          sun: shadow.state,
          sunDepth: shadow.depth.createView(),
          sunCompare: shadow.comparison,
        })
      : root.createBindGroup(environmentLayout, resources);
    const casterGroup = root.createBindGroup(casterEnvironmentLayout, { data });
    const sampleSunShadow = shadow
      ? tgpu.fn(
          [d.vec3f, d.vec3f, d.vec2f],
          d.f32,
        )((world, normal, pixel) => {
          "use gpu";
          return shadowVisibility(
            shadowEnvironmentLayout.$.sunDepth,
            shadowEnvironmentLayout.$.sunCompare,
            shadowEnvironmentLayout.$.sun.vp,
            shadowEnvironmentLayout.$.sun.settings,
            world,
            normal,
            pixel,
          );
        })
      : tgpu.fn(
          [d.vec3f, d.vec3f, d.vec2f],
          d.f32,
        )("(world:vec3f,normal:vec3f,pixel:vec2f)->f32{return 1.0;}");
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
        layout.$.data.observer.xyz,
        layout.$.data.sunDirection.xyz,
        layout.$.data.sunRadiance.xyz,
        layout.$.data.settings.y,
        layout.$.data.settings.x,
        layout.$.sky,
        layout.$.pmrem,
        layout.$.dfg,
        layout.$.linear,
      );
    });
    return {
      group,
      layout,
      casterLayout: casterEnvironmentLayout,
      casterGroup,
      shadows: Boolean(shadow),
      sampleSunShadow,
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
