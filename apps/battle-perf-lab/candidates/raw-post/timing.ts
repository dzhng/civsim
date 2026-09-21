import { factories } from "./factories";
import { runPostControl, syntheticHdr } from "./control";
import {
  NativeGpuTelemetry,
  type NativeGpuBackend,
  type NativeGpuEvent,
} from "../../../../packages/battle-renderer/src/nativeGpuTelemetry";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import {
  BLOOM_LEVELS,
  GRADE_CONTRAST,
  GRADE_SATURATION_BOOST,
  GRADE_SHADOW_LIFT,
  GRADE_SPLIT_TONE,
  gradeStrengthForPreset,
} from "../../../../packages/game-renderer/src/environment/postParameters";
import { summarizePostSamples } from "./timingSummary";

const backend = new URLSearchParams(location.search).get("backend") ?? "typegpu";
const factory = factories[backend];
const width = 2880,
  height = 1800,
  warmup = 4,
  measured = 24;
const errors: string[] = [];
const report: Record<string, unknown> = {
  passed: false,
  backend,
  framebuffer: [width, height],
  warmup,
  measured,
  errors,
  scope:
    "Fixed HDR post-only diagnostic; GPU pass time excludes copies, queue waits and presentation. Not a whole-battle ranking.",
};
const publish = () => {
  Object.assign(window, { __postTiming: report });
  document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
};
let device: GPUDevice | undefined;
let telemetry: NativeGpuTelemetry | undefined;
let input: GPUTexture | undefined;
let post: Awaited<ReturnType<typeof factory>> | undefined;
try {
  if (!factory) throw Error(`Unknown backend ${backend}`);
  // Preserve the original odd-size/preset/bloom numerical gate verbatim.
  await runPostControl(factory, backend);
  const numerical = (window as unknown as { __rawPostCheck: { passed: boolean } }).__rawPostCheck;
  report.numerical = numerical;
  if (!numerical?.passed) throw Error("Existing numerical control failed");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter || !adapter.features.has("timestamp-query"))
    throw Error("Hardware timestamp queries unavailable");
  report.adapter = { vendor: adapter.info.vendor, architecture: adapter.info.architecture };
  device = await adapter.requestDevice({ requiredFeatures: ["timestamp-query"] });
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  telemetry = new NativeGpuTelemetry(device, backend as NativeGpuBackend, { passDetails: true });
  input = device.createTexture({
    size: [width, height],
    format: "rgba16float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: input },
    syntheticHdr(width, height),
    { bytesPerRow: width * 8 },
    [width, height],
  );
  const format = navigator.gpu.getPreferredCanvasFormat();
  report.outputFormat = format;
  post = await factory(device, input.createView(), width, height, format);
  const preset = Object.values(CIVSIM_ENVIRONMENTS)[0];
  report.preset = preset.id;
  post.setGrade(
    {
      strength: gradeStrengthForPreset(preset.id),
      contrast: GRADE_CONTRAST,
      saturationBoost: GRADE_SATURATION_BOOST,
      shadowLift: GRADE_SHADOW_LIFT,
      splitTone: GRADE_SPLIT_TONE,
    },
    preset.physical.exposure,
  );
  const modes = [];
  for (const bloom of [true, false]) {
    const events: NativeGpuEvent[] = [];
    for (let index = 0; index < warmup + measured; index++) {
      const cursor = telemetry.eventsSince(0)!.nextSequence;
      device.pushErrorScope("validation");
      telemetry.beginSubmission("render-only");
      const pending = post.render(bloom);
      const validation = Promise.all([
        pending,
        device.popErrorScope().then((error) => {
          if (error) throw Error(error.message);
        }),
      ]);
      const identity = telemetry.endSubmission(validation);
      await validation;
      if (!identity) throw Error("Post did not submit");
      const deadline = performance.now() + 20000;
      let event: NativeGpuEvent | undefined;
      while (
        !(event = telemetry
          .eventsSince(cursor)
          ?.events.find((e) => e.submissionId === identity.submissionId))
      ) {
        if (performance.now() > deadline) throw Error("Post timestamp result timed out");
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (event.status !== "complete") throw Error(`Post timing incomplete: ${event.reason}`);
      if (index >= warmup) events.push(event);
    }
    modes.push({
      bloom,
      levels: bloom ? BLOOM_LEVELS : 0,
      passes: summarizePostSamples(events, bloom),
      events,
    });
    report.modes = modes;
  }
  report.passed = errors.length === 0;
} catch (error) {
  report.error = String(error);
} finally {
  for (const cleanup of [
    () => post?.dispose(),
    () => input?.destroy(),
    () => telemetry?.dispose(),
    () => device?.destroy(),
  ]) {
    try {
      cleanup();
    } catch (error) {
      report.passed = false;
      errors.push(String(error));
    }
  }
  publish();
}
