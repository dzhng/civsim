import { compute, draw, storage, target, uniforms } from "vgpu";
import { VgpuBattleRuntime } from "./runtime";
import { VGPU_CANDIDATE } from "./identity";

const header = "struct Camera { time: f32 }; @group(0) @binding(0) var<uniform> cam: Camera;";

export async function probeSharedUniform(shared: boolean) {
  const canvas = document.createElement("canvas");
  const runtime = await VgpuBattleRuntime.create(canvas, {
    viewport: { width: 16, height: 16, pixelRatio: 1 },
  });
  const { gpu } = runtime;
  const native = gpu.gpu;
  const uncaptured: string[] = [];
  const onError = (event: GPUUncapturedErrorEvent) => uncaptured.push(event.error.message);
  native.addEventListener("uncapturederror", onError);
  native.pushErrorScope("validation");
  let caught: string | null = null;
  let imageRgba: number[] = [];
  const samples: { value: number; computed: number; pixel: number[] }[] = [];
  try {
    const camera = uniforms(gpu, { time: 0.25 });
    const drawCamera = shared ? camera : uniforms(gpu, { time: 0.25 });
    const result = storage(gpu, 4);
    const kernel = compute(
      gpu,
      `${header}
      @group(1) @binding(0) var<storage,read_write> result: f32;
      @compute @workgroup_size(1) fn cs() { result = cam.time; }
    `,
      { label: "shared-uniform-compute", set: { cam: camera, result } },
    );
    // Match the historical trigger: compute populates the shared cache before draw exists.
    kernel.dispatch(1);
    const initialComputed = new Float32Array(await result.read())[0];
    if (initialComputed !== 0.25) throw new Error("Initial compute control failed");
    const triangle = draw(gpu, {
      label: "shared-uniform-draw",
      shader: `${header}
        @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
          let p = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
          return vec4f(p[i], cam.time, 1);
        }
        @fragment fn fs() -> @location(0) vec4f { return vec4f(cam.time,0,0,1); }
      `,
      vertices: 3,
      set: { cam: drawCamera },
    });
    const output = target(gpu, { size: [16, 16], format: "rgba8unorm", label: "preflight-output" });
    await triangle.compile(output);
    for (const value of [0.25, 0.75]) {
      camera.set({ time: value });
      if (!shared) drawCamera.set({ time: value });
      kernel.dispatch(1);
      const computed = new Float32Array(await result.read())[0];
      const submitted = runtime.submit((current) => current.pass(output, triangle));
      await submitted.done;
      const pixels = await output.color.read({ mipLevel: 0, region: "all" });
      imageRgba = Array.from(pixels);
      samples.push({
        value,
        computed,
        pixel: Array.from(pixels.slice((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 4)),
      });
    }
    await gpu.settled();
  } catch (error) {
    caught = error instanceof Error ? error.message : String(error);
  }
  const validation = await native.popErrorScope();
  const errors = [...uncaptured, ...runtime.errors];
  native.removeEventListener("uncapturederror", onError);
  const adapter = {
    vendor: native.adapterInfo.vendor,
    architecture: native.adapterInfo.architecture,
    device: native.adapterInfo.device,
    description: native.adapterInfo.description,
  };
  runtime.dispose();
  return {
    adapter,
    imageRgba,
    disposed: gpu.disposed,
    shared,
    samples,
    caught,
    validationError: validation?.message ?? null,
    errors,
    passed:
      gpu.disposed &&
      !caught &&
      !validation &&
      errors.length === 0 &&
      samples.length === 2 &&
      samples.every(
        (s) =>
          s.computed === s.value &&
          Math.abs(s.pixel[0] - Math.round(s.value * 255)) <= 1 &&
          s.pixel[1] === 0 &&
          s.pixel[2] === 0 &&
          s.pixel[3] === 255,
      ),
  };
}

async function run() {
  const shared = await probeSharedUniform(true);
  const separate = await probeSharedUniform(false);
  return {
    identity: VGPU_CANDIDATE,
    shared,
    separate,
    verdict:
      shared.passed && separate.passed
        ? "historical defect not reproduced"
        : !shared.passed && separate.passed
          ? "shared-uniform defect reproduced"
          : "preflight inconclusive — healthy control failed",
  };
}

void run()
  .then((report) => {
    document.querySelector("pre")!.textContent = JSON.stringify(report, null, 2);
    Object.assign(window, { vgpuPreflight: report });
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    document.querySelector("pre")!.textContent = message;
    Object.assign(window, { vgpuPreflightError: message });
  });
