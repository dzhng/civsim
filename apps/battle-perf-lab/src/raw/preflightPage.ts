import { runRawPreflight } from "./preflight";

const result = document.getElementById("result")!;
let device: GPUDevice | undefined;
try {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter");
  device = await adapter.requestDevice();
  const report = {
    ...(await runRawPreflight(device)),
    adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture },
  };
  result.textContent = JSON.stringify(report, null, 2);
  Object.assign(window, { __rawPreflight: report });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  result.textContent = message;
  Object.assign(window, { __rawPreflight: { passed: false, error: message } });
} finally {
  device?.destroy();
}
