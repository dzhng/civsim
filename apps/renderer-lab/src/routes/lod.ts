import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { assignCrowdLods, countLods } from "@packages/crowd-runtime/src/lod";
import {
  chartCamera3d,
  projectionFootprint,
  viewMatrix,
  projMatrix,
} from "@packages/renderer-core/src/camera3d";
import {
  type LabContext,
  animateSkinned,
  createConfiguredShell,
  createSkinnedPipeline,
  publish,
  reportTable,
} from "../labShell";

export async function route(ctx: LabContext) {
  const zoom = Number(ctx.params.get("zoom") ?? 5);
  const instances = generatedFormation(900, {
    x: -16,
    y: -10,
    faction: 0,
    columns: 30,
    clip: "march",
  }).concat(generatedFormation(900, { x: 16, y: 4, faction: 1, columns: 30, clip: "march" }));
  const shell = await createConfiguredShell(ctx.canvas, { x: 0, y: -1, zoom, pitch: 0.24, yaw: 0 });
  const height = shell.stats().height;
  const camera = chartCamera3d({ x: 0, y: -1, zoom, pitch: 0.24, yaw: 0 }, height);
  const lods = assignCrowdLods(
    instances,
    projectionFootprint(viewMatrix(camera), projMatrix(camera), height, camera.near),
  );
  const counts = countLods(lods);
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
