import type { SceneryInstance } from "../../../../packages/game-renderer/src/terrain/scenery";
import { CampaignSceneryPass } from "@packages/game-renderer/src/campaign/sceneryPass";
import { PROP_REVIEW_GROUPS } from "@packages/game-renderer/src/models/shared/sceneryPropRegistry";
import { type LabContext, LabGroundPass, createCampaignShell, labGroundFramePass, publish, reportTable } from "../labShell";

export // Reusable scenery props posed for model-sheet review: each family alone on
// neutral ground, no cities, labels, roads, water, or fog. The compositions are
// owned by the shared prop registry so battle and campaign review the same poses.
async function route(ctx: LabContext) {
  const requested = ctx.params.get("gate");
  const group = PROP_REVIEW_GROUPS.find((g) => g.id === requested) ?? PROP_REVIEW_GROUPS[0];
  const camera = group.camera;
  const shell = await createCampaignShell(ctx.canvas, camera);
  const scenery = new CampaignSceneryPass(shell, ctx.params.get("detail") === "canopy" ? "canopy" : "leaves");
  const instances: SceneryInstance[] = group.props.map((prop) => ({
    x: prop.x,
    y: prop.y,
    size: prop.size,
    kind: prop.kind,
    shade: prop.shade,
    yaw: prop.yaw,
  }));
  scenery.upload(instances);
  const ground = new LabGroundPass(shell, [-18, -12, 36, 24]);
  shell.drawFrame({
    clear: { r: 0.09, g: 0.1, b: 0.1, a: 1 },
    passes: [
      labGroundFramePass(ground, "shared-prop-ground"),
      {
        id: "shared-prop-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => scenery.drawOpaque(pass),
      },
      {
        id: "shared-prop-shadows",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => scenery.drawShadows(pass),
      },
    ],
  });
  ctx.status.innerHTML = reportTable({
    route: "shared-prop-models",
    gate: group.id,
    purpose: "isolated shared scenery prop model sheet",
    props: instances.length,
    renderer: "raw WebGPU shared scenery library meshes",
  });
  publish("shared-prop-models", true, {
    route: "shared-prop-models",
    gate: group.id,
    camera,
    props: instances.length,
    sceneryStats: scenery.stats(),
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    postCutoverScreenshots: "renderer-only",
  });
}
