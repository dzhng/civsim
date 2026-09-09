import { candidateSnapshots, runCandidateSheet } from "./_candidate-sheet.mjs";
import { APPEARANCE_DESCRIPTORS } from "../../../packages/soldier-assets/src/appearance.ts";
import { meleeFootPresentation } from "../../../packages/soldier-assets/bake/melee-foot-contract.mjs";

const rows = [1, 2, 11, 13].map((id) => ({ id, ...APPEARANCE_DESCRIPTORS[id] }));
const cameras = (name) => {
  const { actions } = meleeFootPresentation(name);
  return [
    {
      name: "equipment-actions",
      pitch: 1.4,
      zoom: 145,
      target: [0, -0.2, 1.25],
      views: [
        ["front-left", -0.65],
        ["front-right", 0.65],
      ],
      poses: [
        ["ordinary carry", 0, actions.atEase.clip],
        ["ready", 0, actions.ready.clip],
        ["run", 0.3, actions.run.clip],
        ["effort preparation", 0.18, actions.melee.clip],
        ["effort drive", 0.46, actions.melee.clip],
        ["fallen hold", 1, actions.death.clip, false],
      ],
    },
  ];
};

export const meta = {
  name: "blender-melee-foot",
  kind: "visual",
  world: "production-model-workbench",
  tier: "full",
  snapshots: rows.flatMap(({ name }) =>
    candidateSnapshots(`melee-foot/${name}`, [], cameras(name)),
  ),
  describe:
    "Fitted one-hand spear and two-hand sword equipment with actual carry, effort and fall.",
};

export async function run(ctx) {
  for (const { id, name } of rows) {
    await runCandidateSheet(ctx, {
      name: meta.name,
      asset: name,
      label: name,
      folder: `melee-foot/${name}`,
      classes: [id],
      expectedPresentation: meleeFootPresentation(name),
      baseCameras: cameras(name),
    });
  }
}
