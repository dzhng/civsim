import { initFromDevice, uniforms, compute, storage, draw, target } from "vgpu";

async function reproduce() {
  const shared = new URLSearchParams(location.search).get("shared") !== "0";
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter");
  const device = await adapter.requestDevice();
  const gpu = await initFromDevice(device);
  try {
    const camera = uniforms(gpu, { time: 0.25 });
    const result = storage(gpu, 4);
    const header = "struct Camera {time:f32}; @group(0) @binding(0) var<uniform> cam:Camera;";
    const kernel = compute(
      gpu,
      `${header}
      @group(1) @binding(0) var<storage,read_write> result:f32;
      @compute @workgroup_size(1) fn cs(){result=cam.time;}`,
      { set: { cam: camera, result } },
    );
    kernel.dispatch(1);
    const value = new Float32Array(await result.read())[0];
    if (value !== 0.25) throw new Error("Compute fixture failed");
    const triangle = draw(gpu, {
      shader: `${header}
      @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
        let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],cam.time,1);
      }
      @fragment fn fs()->@location(0) vec4f {return vec4f(1,0,0,1);}`,
      set: { cam: shared ? camera : uniforms(gpu, { time: 0.25 }) },
    });
    const output = target(gpu, { size: [16, 16] });
    await triangle.compile(output);
    device.pushErrorScope("validation");
    triangle.draw(output);
    await device.queue.onSubmittedWorkDone();
    const error = await device.popErrorScope();
    return { shared, computeValue: value, validationError: error?.message ?? null };
  } finally {
    gpu.dispose();
    device.destroy();
  }
}
reproduce()
  .then((result) => {
    document.querySelector("#status")!.textContent = JSON.stringify(result, null, 2);
    Object.assign(window, { repro: result });
  })
  .catch((error) => {
    document.querySelector("#status")!.textContent = String(error.stack ?? error);
    Object.assign(window, { spikeError: String(error.stack ?? error) });
  });
