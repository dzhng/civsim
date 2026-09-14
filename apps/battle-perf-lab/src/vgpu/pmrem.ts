import { destroyVgpuTarget } from "./targetLifetime";
import {
  draw,
  frame,
  geometry,
  initFromDevice,
  sampler,
  target,
  uniforms,
  type Draw,
  type Target,
} from "vgpu";
import { cubeUvWGSL, ggxConvolutionWGSL, pmremPlanes } from "../shaders/pmrem";
import { equirectUvWgsl } from "../shaders/physicalSky";

/** Borrowed device/source; vgpu owns atlas, ping-pong, geometry and per-draw uniforms.
 * Same nine-level, 512-sample filter→copy chain as the pinned Three reference. */
export async function createVgpuPmrem(device: GPUDevice, sourceLut: GPUTexture) {
  if (sourceLut.width !== 384 || sourceLut.height !== 192 || sourceLut.format !== "rgba16float")
    throw new Error("PMREM comparison expects the canonical 384×192 HDR sky LUT");
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
    const maxMip = Math.floor(Math.log2(sourceLut.width / 4)),
      cubeSize = 2 ** maxMip;
    const width = 3 * Math.max(cubeSize, 112),
      height = 4 * cubeSize;
    const count = maxMip - 4 + 1 + 6;
    const atlas = target(gpu, {
      size: [width, height],
      format: "rgba16float",
      label: "vgpu PMREM atlas",
    });
    targets.push(atlas);
    const ping = target(gpu, {
      size: [width, height],
      format: "rgba16float",
      label: "vgpu PMREM ping-pong",
    });
    targets.push(ping);
    const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
    const meshes = Array.from({ length: count }, (_, lod) =>
      geometry(gpu, {
        buffers: [
          {
            data: pmremPlanes(2 ** Math.max(4, maxMip - lod)),
            attributes: { position: "float32x3", uv: "float32x2", face: "float32" },
            stride: 24,
          },
        ],
        vertexCount: 36,
      }),
    );
    const vertex = `
struct VertexOut { @builtin(position) position:vec4f,@location(0) uv:vec2f,@location(1) face:f32 };
@vertex fn vertex(@location(0) position:vec3f,@location(1) uv:vec2f,@location(2) face:f32)->VertexOut {
  return VertexOut(vec4f(position,1),uv,face);
}`;
    const bindings =
      "@group(0) @binding(0) var source:texture_2d<f32>;\n@group(0) @binding(1) var linear:sampler;\n";
    const bakeShader =
      vertex +
      cubeUvWGSL +
      bindings +
      `fn equirectUv${equirectUvWgsl}
@fragment fn fragment(v:VertexOut)->@location(0) vec4f {
  return textureSampleLevel(source,linear,equirectUv(normalize(cubeDirection(v.uv,v.face))),0);
}`;
    const filterShader =
      vertex +
      cubeUvWGSL +
      bindings +
      ggxConvolutionWGSL +
      `
struct FilterParams { value:vec4f };
@group(0) @binding(2) var<uniform> params:FilterParams;
@fragment fn fragment(v:VertexOut)->@location(0) vec4f {
  return vec4f(convolve(source,linear,normalize(cubeDirection(v.uv,v.face)),params.value.x,params.value.y,params.value.z),1);
}`;
    const stages: { render: Draw; output: Target; lod: number; clear: boolean }[] = [];
    const bake = draw(gpu, {
      shader: bakeShader,
      geometry: meshes[0],
      set: { source: sourceLut.createView(), linear },
      label: "vgpu PMREM projection",
    });
    stages.push({ render: bake, output: atlas, lod: 0, clear: true });
    for (let lod = 1; lod < count; lod++) {
      const targetRoughness = lod / (count - 1),
        previousRoughness = (lod - 1) / (count - 1);
      const roughness =
        Math.sqrt(targetRoughness * targetRoughness - previousRoughness * previousRoughness) *
        (targetRoughness * 1.25);
      for (const [source, output, value, clear] of [
        [atlas, ping, [roughness, maxMip - lod + 1, maxMip, 0], lod === 1],
        [ping, atlas, [0, maxMip - lod, maxMip, 0], false],
      ] as const) {
        // Each encoded draw owns its values; later queue writes cannot collapse the LOD chain.
        const params = uniforms(gpu, { value: [...value] });
        const render = draw(gpu, {
          shader: filterShader,
          geometry: meshes[lod],
          set: { source: source.color, linear, params },
          label: `vgpu PMREM ${value[0] === 0 ? "copy" : "filter"} ${lod}`,
        });
        stages.push({ render, output, lod, clear });
      }
    }
    await Promise.all(stages.map((stage) => stage.render.compile(stage.output)));
    await frame(gpu, (current) => {
      for (const stage of stages) {
        const size = 2 ** Math.max(4, maxMip - stage.lod),
          x = 3 * size * Math.max(stage.lod - maxMip + 4, 0),
          y = 4 * (cubeSize - size);
        current.pass(
          {
            target: stage.output,
            clear: stage.clear ? [0, 0, 0, 0] : false,
            viewport: { x, y, width: 3 * size, height: 2 * size },
            scissor: [x, y, 3 * size, 2 * size],
          },
          stage.render,
        );
      }
    }).done;
    await gpu.settled();
    return {
      texture: atlas.color.gpu,
      maxMip,
      width,
      height,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
