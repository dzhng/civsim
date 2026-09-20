import { chromium } from "../../../../web/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { GPU_HARDWARE_FLAGS } from "../../../../web/renderer-probe-lib.mjs";

// Requires the coordinated GPU slot; numerical correctness, not a timing run.
// TYPEGPU_SHADOW_MUTATION selects an opt-in defect. A mutated run is expected to
// FAIL the same comparison the baseline passes, so this runner asserts the
// outcome it was asked for rather than the outcome it happens to get.
const mutation = process.env.TYPEGPU_SHADOW_MUTATION ?? "none";
if (!["none", "layer-swap", "receiver-swap"].includes(mutation))
  throw Error(`Unknown TYPEGPU_SHADOW_MUTATION: ${mutation}`);
const expectPass = mutation === "none";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: GPU_HARDWARE_FLAGS,
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  const base = process.env.TYPEGPU_SHADOW_URL ?? "http://127.0.0.1:5187/shadow-check.html";
  await page.goto(`${base}?mutation=${mutation}`);
  await page.waitForFunction(() => window.__typegpuShadowOverlap !== undefined, null, {
    timeout: 180000,
  });
  const adapter = await page.evaluate(async () => {
    const found = await navigator.gpu.requestAdapter();
    return found?.info
      ? { vendor: found.info.vendor, architecture: found.info.architecture }
      : null;
  });
  const report = {
    ...(await page.evaluate(() => window.__typegpuShadowOverlap)),
    adapter,
    pageErrors,
    expectPass,
  };
  const output = new URL(
    process.env.TYPEGPU_SHADOW_REPORT ??
      `../../../../throwaway/typegpu-shadow/shadow-check-${mutation}.json`,
    import.meta.url,
  );
  await mkdir(new URL("./", output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  // A mutation must fail numerically, not because the GPU rejected its work.
  const validReadback =
    report.validation?.length === 0 &&
    report.probes?.length > 0 &&
    report.configurations?.length > 0 &&
    report.configurations.every(
      (entry) => entry.nonfinite === 0 && entry.actual.length === report.probes.length,
    );
  const numericalMismatch = report.configurations?.some((entry) => entry.maxAbs > report.tolerance);
  const satisfied =
    validReadback &&
    report.passed === expectPass &&
    (expectPass || numericalMismatch) &&
    pageErrors.length === 0;
  console.log(
    satisfied
      ? `OK: mutation=${mutation} passed=${report.passed} as expected`
      : `FAIL: mutation=${mutation} expected passed=${expectPass}, got ${report.passed}`,
  );
  if (!satisfied) process.exitCode = 1;
} finally {
  await browser.close();
}
