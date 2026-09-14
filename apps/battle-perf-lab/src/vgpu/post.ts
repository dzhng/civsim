import {
  draw,
  initFromDevice,
  sampler,
  target,
  uniforms,
  type Draw,
  type Frame,
  type Target,
  type Texture,
} from "vgpu";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
import {
  fullscreenWGSL,
  postColorWGSL,
  BLOOM_KERNEL_RADII,
  bloomHighpassWgsl,
  bloomBlurWgsl,
  bloomCompositeWgsl,
  postFinalWgsl,
} from "../shared/postShader";

/** Five-level HDR bloom plus grade/AgX/output. Device/input/output are borrowed;
 * the vgpu wrapper owns intermediates. Encoding never submits or waits. */
export async function createVgpuPost(
  device: GPUDevice,
  input: GPUTextureView,
  width: number,
  height: number,
  outputFormat: GPUTextureFormat = "rgba8unorm",
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64)
    throw new Error("Five-level parity bloom requires a framebuffer at least 64×64");
  if (outputFormat.endsWith("-srgb")) throw new Error("Post output already applies sRGB transfer");
  const gpu = await initFromDevice(device);
  try {
    const linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
    const grade = uniforms(gpu, {
      strength: 0,
      saturationBoost: 0,
      contrast: 0,
      splitTone: 0,
      shadowLift: 0,
      exposure: 1,
      pad0: 0,
      pad1: 0,
    });
    const stages: { render: Draw; output: Target }[] = [];
    const compile: Promise<Draw>[] = [];
    const createTarget = (w: number, h: number) =>
      target(gpu, { size: [w, h], format: "rgba16float" });
    const stage = (shader: string, set: Record<string, unknown>, output: Target, label: string) => {
      const render = draw(gpu, { shader: fullscreenWGSL + shader, set, vertices: 3, label });
      stages.push({ render, output });
      compile.push(render.compile(output));
    };
    const sampled =
      "@group(0) @binding(0) var linearSampler:sampler;\n@group(0) @binding(1) var source:texture_2d<f32>;\n";
    let w = Math.floor(width / 2),
      h = Math.floor(height / 2);
    const bright = createTarget(w, h);
    stage(
      sampled +
        `fn highpass${bloomHighpassWgsl}\n@fragment fn fragment(v:VertexOut)->@location(0) vec4f{return highpass(v.uv,source,linearSampler);}`,
      { source: input, linearSampler },
      bright,
      "vgpu bloom highpass",
    );
    let source: Texture = bright.color;
    const levels: Target[] = [];
    let compositeTarget: Target = bright;
    for (const radius of BLOOM_KERNEL_RADII) {
      const horizontal = createTarget(w, h),
        vertical = createTarget(w, h);
      if (levels.length === 0) compositeTarget = horizontal;
      for (const [axis, output] of [
        [0, horizontal],
        [1, vertical],
      ] as const) {
        stage(
          sampled +
            `fn blur${bloomBlurWgsl(radius, w, h, axis)}\n@fragment fn fragment(v:VertexOut)->@location(0) vec4f{return blur(v.uv,source,linearSampler);}`,
          { source, linearSampler },
          output,
          `vgpu bloom ${axis === 0 ? "horizontal" : "vertical"} ${levels.length}`,
        );
        source = output.color;
      }
      levels.push(vertical);
      w = Math.floor(w / 2);
      h = Math.floor(h / 2);
    }
    stage(
      `@group(0) @binding(0) var linearSampler:sampler;
${levels.map((_, i) => `@group(0) @binding(${i + 1}) var level${i}:texture_2d<f32>;`).join("\n")}
fn composite${bloomCompositeWgsl}
@fragment fn fragment(v:VertexOut)->@location(0) vec4f{return composite(v.uv,level0,level1,level2,level3,level4,linearSampler);}`,
      {
        linearSampler,
        ...Object.fromEntries(levels.map((level, i) => [`level${i}`, level.color])),
      },
      compositeTarget,
      "vgpu bloom composite",
    );
    // Fresh WebGPU textures are zero-initialized; bloom-off never reads stale intermediates.
    const zero = createTarget(1, 1);
    const finalShader =
      fullscreenWGSL +
      postColorWGSL +
      `
@group(0) @binding(0) var linearSampler:sampler;
@group(0) @binding(1) var scene:texture_2d<f32>;
@group(0) @binding(2) var bloom:texture_2d<f32>;
@group(0) @binding(3) var<uniform> grade:Grade;
fn finalColor${postFinalWgsl}
@fragment fn fragment(v:VertexOut)->@location(0) vec4f{return finalColor(v.uv,scene,bloom,linearSampler,grade);}`;
    const finals = [zero, compositeTarget].map((output) =>
      draw(gpu, {
        shader: finalShader,
        vertices: 3,
        set: { linearSampler, scene: input, bloom: output.color, grade },
        label: "vgpu grade AgX output",
      }),
    );
    await Promise.all([
      ...compile,
      ...finals.map((render) => render.compile({ colors: [outputFormat] })),
    ]);
    return {
      gpu,
      setGrade(value: BattlePostGradeUniforms, exposure: number) {
        if (gpu.disposed) throw new Error("Vgpu post is disposed");
        const values = {
          strength: value.strength,
          saturationBoost: value.saturationBoost,
          contrast: value.contrast,
          splitTone: value.splitTone,
          shadowLift: value.shadowLift,
          exposure,
        };
        if (!Object.values(values).every(Number.isFinite))
          throw new Error("Post parameters must be finite");
        grade.set(values);
      },
      encode(current: Frame, output: Target, bloom = true) {
        if (gpu.disposed) throw new Error("Vgpu post is disposed");
        if (bloom)
          for (const stage of stages)
            current.pass({ target: stage.output, clear: [0, 0, 0, 0] }, stage.render);
        current.pass({ target: output, clear: [0, 0, 0, 0] }, finals[bloom ? 1 : 0]);
      },
      dispose() {
        gpu.dispose();
      },
    };
  } catch (error) {
    gpu.dispose();
    throw error;
  }
}
