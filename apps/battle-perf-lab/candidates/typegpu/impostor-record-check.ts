import { runImpostorRecordCheck } from "./impostorRecordCheck";

/** Browser entry for the derived-record hardware control. The check itself, its fixture
 * and its declared tolerances are modules; this owns only the adapter and the page. */
const report = await (async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter available");
  const device = await adapter.requestDevice();
  try {
    return await runImpostorRecordCheck(device);
  } finally {
    device.destroy();
  }
})().catch((error: unknown) => ({ passed: false, error: String(error) }));
document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
Object.assign(window, { __typegpuImpostorRecords: report });
