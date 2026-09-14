/** Native API control for library compute→draw preflights. This is not a battle
 * renderer or a performance score: all beauty/scene parity remains outstanding. */
export async function runRawPreflight(device: GPUDevice) {
  const cases = [];
  for (const sharedUniform of [true, false]) {
    const resources: (GPUBuffer | GPUTexture)[] = [];
    const buffer = (size: number, usage: GPUBufferUsageFlags) => {
      const value = device.createBuffer({ size, usage });
      resources.push(value);
      return value;
    };
    device.pushErrorScope("validation");
    try {
      const computeUniform = buffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      const renderUniform = sharedUniform
        ? computeUniform
        : buffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      device.queue.writeBuffer(computeUniform, 0, new Float32Array([2, 0, 0, 0]));
      if (!sharedUniform)
        device.queue.writeBuffer(renderUniform, 0, new Float32Array([3, 0, 0, 0]));
      const values = buffer(16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const readback = buffer(512, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      const target = device.createTexture({
        size: [1, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      resources.push(target);
      const compute = await device.createComputePipelineAsync({
        layout: "auto",
        compute: {
          module: device.createShaderModule({
            code: `
          struct Params { factor: f32 };
          @group(0) @binding(0) var<uniform> params: Params;
          @group(0) @binding(1) var<storage, read_write> values: array<f32>;
          @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) id: vec3u) {
            values[id.x] = f32(id.x + 1u) * params.factor;
          }`,
          }),
          entryPoint: "main",
        },
      });
      const shader = device.createShaderModule({
        code: `
        struct Params { factor: f32 };
        @group(0) @binding(0) var<uniform> params: Params;
        @group(0) @binding(1) var<storage, read> values: array<f32>;
        @vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
          let points = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
          return vec4f(points[i], 0, 1);
        }
        @fragment fn fragment() -> @location(0) vec4f {
          return vec4f(values[0] / 8.0, values[3] / 8.0, params.factor / 4.0, 1.0);
        }`,
      });
      const render = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module: shader, entryPoint: "vertex" },
        fragment: { module: shader, entryPoint: "fragment", targets: [{ format: "rgba8unorm" }] },
      });
      // Layout visibility/access differs by pipeline even when resources are shared.
      const bind = (layout: GPUBindGroupLayout, uniform: GPUBuffer) =>
        device.createBindGroup({
          layout,
          entries: [
            { binding: 0, resource: { buffer: uniform } },
            { binding: 1, resource: { buffer: values } },
          ],
        });
      const commands = device.createCommandEncoder();
      const computePass = commands.beginComputePass();
      computePass.setPipeline(compute);
      computePass.setBindGroup(0, bind(compute.getBindGroupLayout(0), computeUniform));
      computePass.dispatchWorkgroups(1);
      computePass.end();
      const renderPass = commands.beginRenderPass({
        colorAttachments: [
          {
            view: target.createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      renderPass.setPipeline(render);
      renderPass.setBindGroup(0, bind(render.getBindGroupLayout(0), renderUniform));
      renderPass.draw(3);
      renderPass.end();
      commands.copyBufferToBuffer(values, 0, readback, 0, 16);
      commands.copyTextureToBuffer(
        { texture: target },
        { buffer: readback, offset: 256, bytesPerRow: 256 },
        [1, 1],
      );
      device.queue.submit([commands.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const mapped = readback.getMappedRange();
      const computed = Array.from(new Float32Array(mapped, 0, 4));
      const pixel = Array.from(new Uint8Array(mapped, 256, 4));
      readback.unmap();
      cases.push({
        sharedUniform,
        computed,
        pixel,
        passed:
          computed.every((value, index) => value === (index + 1) * 2) &&
          pixel.every(
            (value, index) =>
              Math.abs(value - [64, 255, sharedUniform ? 128 : 191, 255][index]) <= 1,
          ),
      });
    } finally {
      for (const resource of resources) resource.destroy();
      const validation = await device.popErrorScope();
      if (validation) throw new Error(validation.message);
    }
  }
  return { kind: "native-api-preflight", cases, passed: cases.every((value) => value.passed) };
}
