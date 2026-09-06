import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { assignCrowdLods, countLods } from "@packages/crowd-runtime/src/lod";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const zoom = Number(ctx.params.get("zoom") ?? 5);
  const instances = generatedFormation(900, {
    x: -16,
    y: -10,
    faction: 0,
    columns: 30,
    frame: 1,
  }).concat(generatedFormation(900, { x: 16, y: 4, faction: 1, columns: 30, frame: 1 }));
  const lods = assignCrowdLods(instances, zoom);
  const counts = countLods(lods);
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -1, zoom, pitch: 0.24, yaw: 0 });
  const pipeline = await createSkinnedPipeline(shell);
  const renderInstances = instances.map((instance, i) => ({ ...instance, lod: lods[i].level }));
  animateSkinned(shell, pipeline, () => renderInstances);
  ctx.status.innerHTML = reportTable({
    route: "lod",
    zoom,
    L0: counts.l0,
    L1: counts.l1,
    L2: counts.l2,
    L3: counts.l3,
  });
  publish("lod", true, { counts, zoom });
}
