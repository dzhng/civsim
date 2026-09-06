import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: -3,
    zoom: 4.6,
    pitch: 0.34,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell);
  const instances = generatedFormation(1200, {
    x: -21,
    y: -13,
    faction: 0,
    columns: 42,
    frame: 1,
  }).concat(generatedFormation(1200, { x: 21, y: 5, faction: 1, columns: 42, frame: 8 }));
  animateSkinned(shell, pipeline, () => instances, { phaseSpeed: 0.5 });
  ctx.status.innerHTML = reportTable({
    route: "battle",
    placeholderSoldiers: instances.length,
    renderer: "raw WebGPU",
    ui: "lab surface",
  });
  publish("battle", true, { ...pipeline.stats(), soldiers: instances.length });
}
