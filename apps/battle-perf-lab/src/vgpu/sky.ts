import { destroyVgpuTarget } from "./targetLifetime";
import {
  draw,
  frame,
  initFromDevice,
  sampler,
  target,
  uniforms,
  type Frame,
  type Target,
} from "vgpu";
import type { SkyModelParams } from "../../../../packages/game-renderer/src/environment/skyParameters";
import {
  SKY_LUT_WIDTH,
  SKY_LUT_HEIGHT,
} from "../../../../packages/game-renderer/src/environment/skyParameters";
import {
  type SkyRays,
  equirectDirectionWgsl,
  equirectUvWgsl,
  skyRadianceWgsl,
  skyDiscWgsl,
} from "../shaders/physicalSky";

const fullscreen = `
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Vertex {
  let uv = array<vec2f, 3>(vec2f(0, 0), vec2f(2, 0), vec2f(0, 2))[i];
  return Vertex(vec4f(uv * vec2f(2, -2) + vec2f(-1, 1), 0, 1), uv);
}`;

/** Linear HDR only. Borrows the device; owns vgpu resources and wrapper lifetime. */
export async function createVgpuSky(device: GPUDevice, params: SkyModelParams) {
  const gpu = await initFromDevice(device);
  const targets: Target[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const t of targets) destroyVgpuTarget(t);
    gpu.dispose();
  };
  try {
    const lut = target(gpu, {
      size: [SKY_LUT_WIDTH, SKY_LUT_HEIGHT],
      format: "rgba16float",
      label: "vgpu-sky-lut",
    });
    targets.push(lut);
    const rays = uniforms(gpu, { origin: [0, 1, 0], dx: [0, 0, 0], dy: [0, 0, 0] });
    const linearSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const bake = draw(gpu, {
      label: "vgpu-sky-bake",
      vertices: 3,
      shader: `${fullscreen}
fn direction${equirectDirectionWgsl}
fn radiance${skyRadianceWgsl(params)}
@fragment fn fs(in: Vertex) -> @location(0) vec4f {
  return max(vec4f(radiance(direction(in.uv)), 1.0), vec4f(0.0));
}`,
    });
    const background = draw(gpu, {
      label: "vgpu-sky-background",
      vertices: 3,
      set: { rays, lutView: lut.color, linearSampler },
      shader: `${fullscreen}
struct Rays { origin: vec3f, dx: vec3f, dy: vec3f };
@group(0) @binding(0) var<uniform> rays: Rays;
@group(0) @binding(1) var lutView: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
fn equirectUv${equirectUvWgsl}
fn disc${skyDiscWgsl(params)}
@fragment fn fs(in: Vertex) -> @location(0) vec4f {
  let dir = normalize(rays.origin + rays.dx * in.uv.x + rays.dy * in.uv.y);
  let color = textureSampleLevel(lutView, linearSampler, equirectUv(dir), 0.0).rgb + disc(dir);
  return max(vec4f(color, 1.0), vec4f(0.0));
}`,
    });
    await Promise.all([bake.compile(lut), background.compile({ colors: ["rgba16float"] })]);
    await frame(gpu, (current) => current.pass(lut, bake)).done;
    return {
      gpu,
      lut: lut.color,
      setRays(value: SkyRays) {
        if (gpu.disposed) throw new Error("Vgpu sky is disposed");
        rays.set({ origin: [...value.origin], dx: [...value.dx], dy: [...value.dy] });
      },
      // Caller owns submission; background encoding never opens or submits another frame.
      encodeBackground(current: Frame, output: Target) {
        if (gpu.disposed) throw new Error("Vgpu sky is disposed");
        current.pass(output, background);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
