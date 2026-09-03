import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { loadPlaceholderVat } from "@packages/soldier-assets/src/placeholders";
import { PLACEHOLDER_RENDER_CLASS_COUNT } from "@packages/soldier-assets/src/soldierMesh";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, integerParam, numberParam, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const strength = numberParam(ctx.params, "strength", 1);
  const faction = integerParam(ctx.params, "team", 0, 0, 1) as 0 | 1;
  const classId = integerParam(ctx.params, "class", 0, 0, PLACEHOLDER_RENDER_CLASS_COUNT - 1);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 86,
    pitch: 0.1,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  pipeline.setFactionMaskStrength(strength);
  const soldier = generatedFormation(1, { frame: 6, spacing: 1, faction, classId }).map((inst) => ({
    ...inst,
    x: 0,
    y: 0,
    facing: Math.PI / 2,
  }));
  animateSkinned(shell, pipeline, () => soldier, {
    forcedClip: "at_ease",
    phaseSpeed: 0,
    size: 1.6,
  });
  ctx.status.innerHTML = reportTable({
    route: "soldier-materials",
    "accent strength": strength.toFixed(2),
    faction,
    classId,
    note: "material-led body and shield; faction appears only on the upper sword-arm band",
  });
  publish("soldier-materials", true, {
    route: "soldier-materials",
    strength,
    faction,
    classId,
    ...pipeline.stats(),
  });
}
