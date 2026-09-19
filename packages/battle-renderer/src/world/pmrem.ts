import { cubeUvWGSL, ggxConvolutionWGSL, pmremPlanes } from "../shaders/pmrem";
import { equirectUvWgsl } from "../shaders/physicalSky";

/** Native implementation of the pinned equirectangular→CubeUV GGX prefilter.
 * Preparation only; source/device are borrowed. No sampling shortcuts versus
 * Three: the same nine levels, 512 samples and filter→copy passes are encoded. */
export async function createRawPmrem(device: GPUDevice, sourceLut: GPUTexture) {
  if (sourceLut.width !== 384 || sourceLut.height !== 192 || sourceLut.format !== "rgba16float")
    throw new Error("PMREM comparison expects the canonical 384×192 HDR sky LUT");
  const maxMip = Math.floor(Math.log2(sourceLut.width / 4));
  const cubeSize = 2 ** maxMip,
    width = 3 * Math.max(cubeSize, 16 * 7),
    height = 4 * cubeSize;
  const resources: (GPUBuffer | GPUTexture)[] = [];
  const allocateTexture = () => {
    const value = device.createTexture({
      size: [width, height],
      format: "rgba16float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    resources.push(value);
    return value;
  };
  const texture = allocateTexture(),
    ping = allocateTexture();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of resources) r.destroy();
  };
  try {
    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    const vertex = `
      struct VertexOut { @builtin(position) position:vec4f,@location(0) uv:vec2f,@location(1) face:f32 };
      @vertex fn vertex(@location(0) position:vec3f,@location(1) uv:vec2f,@location(2) face:f32)->VertexOut {
        return VertexOut(vec4f(position,1),uv,face);
      }
    `;
    const layout: GPUVertexBufferLayout = {
      arrayStride: 24,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 12, format: "float32x2" },
        { shaderLocation: 2, offset: 20, format: "float32" },
      ],
    };
    const pipeline = (code: string) => {
      const module = device.createShaderModule({ code: vertex + cubeUvWGSL + code });
      return device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module, entryPoint: "vertex", buffers: [layout] },
        fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
        primitive: { topology: "triangle-list" },
      });
    };
    const bindings =
      "@group(0) @binding(0) var source:texture_2d<f32>;\n@group(0) @binding(1) var linear:sampler;\n";
    const [bake, filter] = await Promise.all([
      pipeline(
        bindings +
          `fn equirectUv${equirectUvWgsl}
        @fragment fn fragment(v:VertexOut)->@location(0) vec4f {
          return textureSampleLevel(source,linear,equirectUv(normalize(cubeDirection(v.uv,v.face))),0);
        }`,
      ),
      pipeline(
        bindings +
          ggxConvolutionWGSL +
          `
        @group(0) @binding(2) var<uniform> params:vec4f;
        @fragment fn fragment(v:VertexOut)->@location(0) vec4f {
          return vec4f(convolve(source,linear,normalize(cubeDirection(v.uv,v.face)),params.x,params.y,params.z),1);
        }`,
      ),
    ]);
    const group = (pipeline: GPURenderPipeline, source: GPUTexture, params?: number[]) => {
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: sampler },
      ];
      if (params) {
        const buffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.UNIFORM,
          mappedAtCreation: true,
        });
        new Float32Array(buffer.getMappedRange()).set(params);
        buffer.unmap();
        resources.push(buffer);
        entries.push({ binding: 2, resource: { buffer } });
      }
      return device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
    };
    const encoder = device.createCommandEncoder({ label: "native PMREM preparation" });
    const count = maxMip - 4 + 1 + 6;
    const geometry: GPUBuffer[] = [];
    for (let i = 0; i < count; i++) {
      const vertices = pmremPlanes(2 ** Math.max(4, maxMip - i));
      const buffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(buffer.getMappedRange()).set(vertices);
      buffer.unmap();
      resources.push(buffer);
      geometry.push(buffer);
    }
    const draw = (
      pipeline: GPURenderPipeline,
      group: GPUBindGroup,
      target: GPUTexture,
      lod: number,
      clear: boolean,
    ) => {
      const size = 2 ** Math.max(4, maxMip - lod),
        x = 3 * size * Math.max(lod - maxMip + 4, 0),
        y = 4 * (cubeSize - size);
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: target.createView(),
            loadOp: clear ? "clear" : "load",
            storeOp: "store",
            clearValue: [0, 0, 0, 0],
          },
        ],
      });
      pass.setViewport(x, y, 3 * size, 2 * size, 0, 1);
      pass.setScissorRect(x, y, 3 * size, 2 * size);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.setVertexBuffer(0, geometry[lod]);
      pass.draw(36);
      pass.end();
    };
    draw(bake, group(bake, sourceLut), texture, 0, true);
    for (let lod = 1; lod < count; lod++) {
      const target = lod / (count - 1),
        previous = (lod - 1) / (count - 1);
      const roughness = Math.sqrt(target * target - previous * previous) * (target * 1.25);
      draw(
        filter,
        group(filter, texture, [roughness, maxMip - lod + 1, maxMip, 0]),
        ping,
        lod,
        lod === 1,
      );
      draw(filter, group(filter, ping, [0, maxMip - lod, maxMip, 0]), texture, lod, false);
    }
    device.queue.submit([encoder.finish()]);
    return { texture, maxMip, width, height, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
