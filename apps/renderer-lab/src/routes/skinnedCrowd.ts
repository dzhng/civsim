import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { loadPlaceholderVat } from "@packages/soldier-assets/src/placeholders";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const count = Number(ctx.params.get("count") ?? 2000);
  const vat = await loadPlaceholderVat();
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: -2,
    zoom: 5.2,
    pitch: 1.1,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const instances = generatedFormation(Math.floor(count / 2), {
    x: -20,
    y: -12,
    faction: 0,
    columns: 40,
    frame: 1,
  }).concat(
    generatedFormation(Math.ceil(count / 2), { x: 20, y: 4, faction: 1, columns: 40, frame: 8 }),
  );
  animateSkinned(shell, pipeline, () => instances, { phaseSpeed: 0.45 });
  ctx.status.innerHTML = reportTable({
    route: "skinned-crowd",
    count: instances.length,
    drawCalls: pipeline.stats().drawCalls,
    clips: pipeline.stats().clips.join(", "),
  });
  publish("skinned-crowd", true, { ...pipeline.stats(), count: instances.length });
}
