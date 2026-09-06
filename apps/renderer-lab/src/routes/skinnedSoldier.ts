import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { PLACEHOLDER_RENDER_CLASS_COUNT } from "@packages/soldier-assets/src/soldierMesh";
import {
  type LabContext,
  animateSkinned,
  createConfiguredShell,
  createSkinnedPipeline,
  integerParam,
  numberParam,
  publish,
  reportTable,
} from "../labShell";

export async function route(ctx: LabContext) {
  const phase = numberParam(ctx.params, "phase", 0);
  const classId = integerParam(ctx.params, "class", 0, 0, PLACEHOLDER_RENDER_CLASS_COUNT - 1);
  const faction = integerParam(ctx.params, "team", 0, 0, 1) as 0 | 1;
  const facing = numberParam(ctx.params, "facing", Math.PI / 2);
  const clip = ctx.params.get("clip") ?? "march";
  const shell = await createConfiguredShell(ctx.canvas, {
    x: numberParam(ctx.params, "x", 0),
    y: numberParam(ctx.params, "y", 0),
    zoom: numberParam(ctx.params, "zoom", 86),
    pitch: numberParam(ctx.params, "pitch", 1.1),
    yaw: numberParam(ctx.params, "yaw", 0),
  });
  const pipeline = await createSkinnedPipeline(shell);
  const soldier = generatedFormation(1, { clip, spacing: 1, faction, classId }).map((inst) => ({
    ...inst,
    facing,
  }));
  animateSkinned(shell, pipeline, () => soldier, {
    phaseOffset: phase,
    forcedClip: clip,
    phaseSpeed: 0,
    size: numberParam(ctx.params, "size", 1),
  });
  ctx.status.innerHTML = reportTable({
    route: "skinned-soldier",
    classId,
    clip,
    phase,
    facing: facing.toFixed(2),
    vertices: pipeline.stats().vertices,
    variants: pipeline.stats().meshVariants,
  });
  publish("skinned-soldier", true, { ...pipeline.stats(), classId, clip, phase, facing });
}
