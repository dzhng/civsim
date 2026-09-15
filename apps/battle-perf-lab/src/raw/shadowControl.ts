import { RawSunShadow } from "./shadow";
import { shadowPcfWgsl, shadowVisibilityWgsl } from "../shaders/shadow";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
export function createRawShadowControl(
  device: GPUDevice,
  env: CivsimEnvironment,
  cubeData: Float32Array<ArrayBuffer>,
  groundData: Float32Array<ArrayBuffer>,
  width: number,
  height: number,
) {
  const releases: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of releases.reverse()) f();
  };
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  try {
    const cameraLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
    });
    const native = own(new RawSunShadow(device, env));
    const shadowCameraGroup = device.createBindGroup({
      layout: cameraLayout,
      entries: [{ binding: 0, resource: { buffer: native.camera } }],
    });
    const output = own(
      device.createTexture({
        size: [width, height],
        format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
    );
    const mainCamera = own(
      device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    );
    const mainGroup = device.createBindGroup({
      layout: cameraLayout,
      entries: [{ binding: 0, resource: { buffer: mainCamera } }],
    });
    const lightLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      ],
    });
    const lightGroup = device.createBindGroup({
      layout: lightLayout,
      entries: [
        { binding: 0, resource: { buffer: native.state } },
        { binding: 1, resource: native.depth.createView() },
        { binding: 2, resource: native.comparison },
      ],
    });
    const vertex = `struct Camera {vp:mat4x4f}; @group(0) @binding(0) var<uniform> camera:Camera;
      struct V {@builtin(position) clip:vec4f,@location(0) world:vec3f};
      @vertex fn vertex(@location(0) p:vec3f)->V {return V(camera.vp*vec4f(p,1),p);}`;
    const receiver = `${vertex}
      struct Sun {vp:mat4x4f,settings:vec4f}; @group(1) @binding(0) var<uniform> sun:Sun;
      @group(1) @binding(1) var depth:texture_depth_2d;
      @group(1) @binding(2) var compare:sampler_comparison;
      fn shadowPcf${shadowPcfWgsl}
      fn shadowVisibility${shadowVisibilityWgsl}
      @fragment fn fragment(v:V)->@location(0) vec4f {
        let shade=shadowVisibility(depth,compare,sun.vp,sun.settings,v.world,vec3f(0,0,1),v.clip.xy);
        return vec4f(vec3f(shade),1);
      }`;
    const vertexLayout: GPUVertexBufferLayout = {
      arrayStride: 12,
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
    };
    const depthModule = device.createShaderModule({ code: vertex });
    const depthPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: { module: depthModule, entryPoint: "vertex", buffers: [vertexLayout] },
      primitive: { cullMode: "none" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "greater-equal",
      },
    });
    const module = device.createShaderModule({ code: receiver });
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, lightLayout] }),
      vertex: { module, entryPoint: "vertex", buffers: [vertexLayout] },
      fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
      primitive: { cullMode: "none" },
    });
    const upload = (array: Float32Array<ArrayBuffer>) => {
      const buffer = own(
        device.createBuffer({
          size: array.byteLength,
          usage: GPUBufferUsage.VERTEX,
          mappedAtCreation: true,
        }),
      );
      new Float32Array(buffer.getMappedRange()).set(array);
      buffer.unmap();
      return { buffer, count: array.length / 3 };
    };
    const cube = upload(cubeData),
      ground = upload(groundData);
    return {
      output,
      setWorldRect: native.setWorldRect.bind(native),
      unusedColorBytes: 0,
      async render(vp: Float32Array) {
        if (disposed) throw Error("Raw shadow control disposed");
        device.queue.writeBuffer(mainCamera, 0, vp);
        const encoder = device.createCommandEncoder();
        native.encode(encoder, (pass) => {
          pass.setPipeline(depthPipeline);
          pass.setBindGroup(0, shadowCameraGroup);
          pass.setVertexBuffer(0, cube.buffer);
          pass.draw(cube.count);
        });
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: output.createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 1, g: 1, b: 1, a: 1 },
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, mainGroup);
        pass.setBindGroup(1, lightGroup);
        pass.setVertexBuffer(0, ground.buffer);
        pass.draw(ground.count);
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
