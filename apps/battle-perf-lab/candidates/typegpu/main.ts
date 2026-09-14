import { createTypegpuPreflight, checkBorrowedOwnership } from "./preflight";

const output = document.querySelector("#result")!;
const canvas = document.querySelector("canvas")!;
const errors: string[] = [];
const cleanups: (() => void)[] = [];
const dispose = () => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
};
window.addEventListener("pagehide", dispose, { once: true });
try {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter available");
  const device = await adapter.requestDevice();
  cleanups.push(() => device.destroy());
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
  device.pushErrorScope("validation");
  const external = device.createBuffer({
    size: 24,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.VERTEX |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });
  cleanups.push(() => external.destroy());
  const preflight = await createTypegpuPreflight(device, external, canvas);
  cleanups.push(() => preflight.dispose());
  const first = await preflight.run(0.25);
  const second = await preflight.run(-0.25);
  const ownership = await checkBorrowedOwnership(device, external);
  // Restore the verified triangle after the ownership probe overwrote its first vertex.
  const restored = await preflight.run(-0.25);
  const validation = await device.popErrorScope();
  if (validation) errors.push(validation.message);
  const expected = (offset: number) => [
    [offset, 0.5],
    [offset - 0.5, -0.5],
    [offset + 0.5, -0.5],
  ];
  const passed =
    JSON.stringify(first) === JSON.stringify(expected(0.25)) &&
    JSON.stringify(second) === JSON.stringify(expected(-0.25)) &&
    JSON.stringify(ownership) === JSON.stringify([0.125, -0.25]) &&
    JSON.stringify(restored) === JSON.stringify(expected(-0.25)) &&
    errors.length === 0;
  const report = {
    kind: "typegpu-preflight",
    typegpuVersion: "0.12.5",
    pluginVersion: "0.12.3",
    passed,
    adapter: {
      vendor: adapter.info.vendor,
      architecture: adapter.info.architecture,
      device: adapter.info.device,
      description: adapter.info.description,
    },
    userAgent: navigator.userAgent,
    framebuffer: [canvas.width, canvas.height],
    first,
    second,
    ownership,
    restored,
    errors,
    battleParity: "not implemented; unrankable",
  };
  output.textContent = JSON.stringify(report, null, 2);
  Object.assign(window, { __typegpuPreflight: report });
} catch (error) {
  dispose();
  const report = { passed: false, error: String(error), errors };
  output.textContent = JSON.stringify(report, null, 2);
  Object.assign(window, { __typegpuPreflight: report });
}
