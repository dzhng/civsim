import { buildCrowdInstances, generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { toCrowdBuildInputs } from "../labFixtures";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, publish } from "../labShell";

export async function route(ctx: LabContext) {
  const count = Number(ctx.params.get("count") ?? 1000);
  const player = generatedFormation(Math.floor(count / 2), {
    x: -18,
    y: -10,
    faction: 0,
    columns: 34,
    frame: 1,
  });
  const enemy = generatedFormation(count - player.length, {
    x: 18,
    y: 5,
    faction: 1,
    columns: 34,
    frame: 1,
  });
  const instances = player.concat(enemy);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: -1,
    zoom: 4.8,
    pitch: 0.24,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  animateSkinned(shell, pipeline, () => instances);
  const built = buildCrowdInstances(toCrowdBuildInputs(instances));
  publish("crowd-data", true, {
    route: "crowd-data",
    stats: built.stats,
  });
}
