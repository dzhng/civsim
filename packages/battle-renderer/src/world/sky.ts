import {
  SKY_LUT_WIDTH,
  SKY_LUT_HEIGHT,
  type SkyModelParams,
} from "../../../game-renderer/src/environment/skyParameters";
import {
  equirectDirectionWgsl,
  equirectUvWgsl,
  skyRadianceWgsl,
  skyDiscWgsl,
  type SkyRays,
} from "../shaders/physicalSky";
import { fullscreenWGSL } from "../shaders/post";

/** The world's sky source, in the linear HDR contract the lab's typed candidates
 * are measured against. Device/output are borrowed; resources are private. */
export async function createRawSky(
  device: GPUDevice,
  params: SkyModelParams,
  backgroundSamples: 1 | 4 = 1,
) {
  const lut = device.createTexture({
    label: "raw sky LUT",
    size: [SKY_LUT_WIDTH, SKY_LUT_HEIGHT],
    format: "rgba16float",
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });
  const rays = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lut.destroy();
    rays.destroy();
  };
  try {
    const pipeline = (code: string, samples: 1 | 4 = 1) => {
      const module = device.createShaderModule({ code: fullscreenWGSL + code });
      return device.createRenderPipelineAsync({
        layout: "auto",
        multisample: { count: samples },
        vertex: { module, entryPoint: "vertex" },
        fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
        primitive: { topology: "triangle-list" },
      });
    };
    const [bake, background] = await Promise.all([
      pipeline(`fn direction${equirectDirectionWgsl}\nfn radiance${skyRadianceWgsl(params)}
        @fragment fn fragment(v: VertexOut) -> @location(0) vec4f {
          return max(vec4f(radiance(direction(v.uv)),1),vec4f(0));
        }`),
      pipeline(
        `fn equirectUv${equirectUvWgsl}\nfn disc${skyDiscWgsl(params)}
        struct Rays { origin:vec3f, dx:vec3f, dy:vec3f };
        @group(0) @binding(0) var<uniform> rays:Rays;
        @group(0) @binding(1) var sky:texture_2d<f32>;
        @group(0) @binding(2) var linearSampler:sampler;
        @fragment fn fragment(v:VertexOut) -> @location(0) vec4f {
          let dir=normalize(rays.origin+rays.dx*v.uv.x+rays.dy*v.uv.y);
          return max(vec4f(textureSampleLevel(sky,linearSampler,equirectUv(dir),0).rgb+disc(dir),1),vec4f(0));
        }`,
        backgroundSamples,
      ),
    ]);
    const group = device.createBindGroup({
      layout: background.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: rays } },
        { binding: 1, resource: lut.createView() },
        { binding: 2, resource: sampler },
      ],
    });
    const encoder = device.createCommandEncoder({ label: "raw sky LUT" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: lut.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] },
      ],
    });
    pass.setPipeline(bake);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    return {
      lut,
      setRays(value: SkyRays) {
        if (disposed) throw new Error("Raw sky is disposed");
        device.queue.writeBuffer(
          rays,
          0,
          new Float32Array([...value.origin, 0, ...value.dx, 0, ...value.dy, 0]),
        );
      },
      encodeBackground(encoder: GPUCommandEncoder, target: GPUTextureView) {
        if (disposed) throw new Error("Raw sky is disposed");
        const pass = encoder.beginRenderPass({
          label: "raw sky background",
          colorAttachments: [
            { view: target, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] },
          ],
        });
        pass.setPipeline(background);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
