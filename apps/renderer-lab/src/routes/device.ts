import { createFrameShell } from "@packages/renderer-core/src/frameShell";
import { requestGpuDevice } from "@packages/renderer-core/src/device";
import { generatedCrowd } from "../labFixtures";
import { type LabContext, LabGroundPass, chartSnapshot, createSkinnedPipeline, labGroundFramePass, publish, reportTable, skinnedCrowdPass } from "../labShell";
import { CAMPAIGN_ENVIRONMENT } from "@packages/game-renderer/src/campaign/environment";

export async function route(ctx: LabContext) {
  const info = await requestGpuDevice();
  const shell = await createFrameShell(ctx.canvas, { sun: CAMPAIGN_ENVIRONMENT });
  const markers = generatedCrowd(18, -8, -4, 0).concat(generatedCrowd(18, 8, 2, 1));
  const pipeline = await createSkinnedPipeline(shell);
  pipeline.upload(markers);
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  shell.setCamera(chartSnapshot({ x: 0, y: 0, zoom: 10, pitch: 0.25, yaw: 0 }, shell));
  shell.drawFrame({
    precompute: (encoder) => pipeline.precompute(encoder),
    passes: [
      labGroundFramePass(ground, "device-ground"),
      skinnedCrowdPass(pipeline, "device-crowd"),
    ],
  });
  ctx.status.innerHTML = reportTable({
    route: "device",
    status: "WebGPU ready",
    vendor: info.vendor,
    architecture: info.architecture,
    format: info.format,
    features: info.features.length,
    markers: markers.length,
  });
  publish("device", true, { ...shell.stats(), vendor: info.vendor, features: info.features });
}
