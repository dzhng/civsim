import { createFrameShell, type FrameGraphCommands } from "@packages/renderer-core/src/frameShell";
import { assertStorageBufferFits } from "@packages/renderer-core/src/capabilities";
import { Nested3dFixturePass } from "@packages/game-renderer/src/fixtures/nested3d";
import { generatedCrowd } from "../labFixtures";
import { type LabContext, LabGroundPass, chartSnapshot, createSkinnedPipeline, integerParam, labGroundFramePass, publish, reportTable, skinnedCrowdPass } from "../labShell";
import { CAMPAIGN_ENVIRONMENT } from "@packages/game-renderer/src/campaign/environment";

export async function route(ctx: LabContext) {
  const sampleParam = integerParam(ctx.params, "msaa", 1, 1, 4);
  const shell = await createFrameShell(ctx.canvas, {
    sun: CAMPAIGN_ENVIRONMENT,
    enableGpuTimer: true,
    sampleCount: sampleParam,
  });
  const caps = shell.info.caps;

  // VAT storage-buffer guard: oversize is rejected before allocation; a real
  // size fits.
  let oversizeRejected = false;
  let oversizeMessage = "";
  try {
    assertStorageBufferFits(caps.maxStorageBufferBindingSize + 1, caps, "probe-oversize");
  } catch (error) {
    oversizeRejected = true;
    oversizeMessage = error instanceof Error ? error.message : String(error);
  }
  let realSizeFits = true;
  try {
    assertStorageBufferFits(1 << 20, caps, "probe-fits");
  } catch {
    realSizeFits = false;
  }

  shell.setCamera(chartSnapshot({ x: 0, y: 0, zoom: 9, pitch: 0.34, yaw: -0.12 }, shell));
  const markers = generatedCrowd(80, -10, -9, 0).concat(generatedCrowd(80, 10, 3, 1));
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  pipeline.upload(markers);
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  const fixture = new Nested3dFixturePass(shell);
  const draw = (): FrameGraphCommands => ({
    passes: [
      labGroundFramePass(ground, "capabilities-ground"),
      {
        id: "capabilities-nested-3d",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => fixture.draw(pass),
      },
      skinnedCrowdPass(pipeline, "capabilities-crowd"),
    ],
  });

  const tick = () => {
    shell.drawFrame(draw());
    const stats = shell.stats();
    ctx.status.innerHTML = reportTable({
      route: "capabilities",
      "power preference": caps.powerPreference,
      "preferred format": shell.info.format,
      "depth format": stats.depth.format,
      maxStorageBufferBindingSize: caps.maxStorageBufferBindingSize,
      maxBufferSize: caps.maxBufferSize,
      "MSAA supported": caps.msaaSupported,
      "sample count": stats.sampleCount,
      "timestamp-query": caps.timestampQuery,
      "GPU time (ms)": stats.gpuTimeMs === null ? "pending" : stats.gpuTimeMs.toFixed(3),
      "VAT oversize rejected": oversizeRejected,
      "VAT real size fits": realSizeFits,
    });
    publish("capabilities", true, {
      route: "capabilities",
      caps,
      depth: stats.depth,
      grantedLimits: {
        maxStorageBufferBindingSize: shell.info.limits.maxStorageBufferBindingSize,
        maxBufferSize: shell.info.limits.maxBufferSize,
      },
      sampleCount: stats.sampleCount,
      gpuTimeMs: stats.gpuTimeMs,
      vatGuard: { oversizeRejected, oversizeMessage, realSizeFits },
      features: shell.info.features,
    });
    requestAnimationFrame(tick);
  };
  tick();
}
