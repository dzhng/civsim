import { tgpu, d } from "typegpu";

// Adapted from Software Mansion's MIT-licensed triangle and boids examples:
// typed storage/vertex reuse and TypeGPU pipeline dispatch own the work here.
const Positions = d.arrayOf(d.vec2f, 3);
const points = tgpu.const(Positions, [d.vec2f(0, 0.5), d.vec2f(-0.5, -0.5), d.vec2f(0.5, -0.5)]);
const layout = tgpu.bindGroupLayout({
  positions: { storage: Positions, access: "mutable" },
  offset: { uniform: d.f32 },
});

export async function createTypegpuPreflight(
  device: GPUDevice,
  externalPositions: GPUBuffer,
  canvas: HTMLCanvasElement,
) {
  const root = tgpu.initFromDevice({ device });
  const positions = root.createBuffer(Positions, externalPositions).$usage("storage", "vertex");
  const offset = root.createBuffer(d.f32, 0).$usage("uniform");
  const bindGroup = root.createBindGroup(layout, { positions, offset });
  const compute = root
    .createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1], in: { id: d.builtin.globalInvocationId } })(
        ({ id }) => {
          "use gpu";
          layout.$.positions[id.x] = d.vec2f(points.$[id.x].x + layout.$.offset, points.$[id.x].y);
        },
      ),
    })
    .with(bindGroup);
  const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));
  const render = root
    .createRenderPipeline({
      attribs: { position: vertexLayout.attrib },
      vertex: ({ position }) => {
        "use gpu";
        return { $position: d.vec4f(position, 0, 1) };
      },
      fragment: () => {
        "use gpu";
        return d.vec4f(0.82, 0.52, 0.2, 1);
      },
      targets: { format: navigator.gpu.getPreferredCanvasFormat() },
    })
    .with(vertexLayout, positions);
  const context = root.configureContext({ canvas, alphaMode: "opaque" });
  await Promise.all([compute.initAsync(), render.initAsync()]);
  return {
    async run(xOffset: number) {
      offset.write(xOffset);
      // Documented external-encoder API. TypeGPU encodes both native passes;
      // this caller owns just the command encoder and single queue submission.
      const encoder = device.createCommandEncoder({ label: "typegpu-preflight" });
      compute.with(encoder).dispatchWorkgroups(3);
      render
        .with(encoder)
        .withColorAttachment({ view: context, clearValue: [0.06, 0.07, 0.08, 1] })
        .draw(3);
      device.queue.submit([encoder.finish()]);
      return (await positions.read()).map((value) => [value.x, value.y]);
    },
    dispose() {
      positions.destroy(); // Borrowed buffer: this destroys the wrapper, not the GPUBuffer.
      offset.destroy();
      context.unconfigure();
      root.destroy(); // Borrowed device remains owned by the caller.
    },
  };
}

/** Exercise the documented borrowed-root/buffer lifetime independently of drawing. */
export async function checkBorrowedOwnership(device: GPUDevice, buffer: GPUBuffer) {
  const root = tgpu.initFromDevice({ device });
  const wrapped = root.createBuffer(Positions, buffer);
  wrapped.destroy();
  root.destroy();
  // A real queue operation + readback proves more than checking JS references.
  device.queue.writeBuffer(buffer, 0, new Float32Array([0.125, -0.25]));
  const readback = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(buffer, 0, readback, 0, 8);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const values = Array.from(new Float32Array(readback.getMappedRange()));
  readback.unmap();
  readback.destroy();
  return values;
}
