import { candidateSnapshots, runCandidateSheet } from "./_candidate-sheet.mjs";
import { APPEARANCE_DESCRIPTORS } from "../../../packages/soldier-assets/src/appearance.ts";
import { pikeFamilyPresentation } from "../../../packages/soldier-assets/bake/pike-motion-contract.mjs";

const rows = [3, 14, 16, 17, 18, 19].map((id) => ({ id, ...APPEARANCE_DESCRIPTORS[id] }));
const cameras = (sidearm) => {
  const poses = [
    ["ordinary carry", 0, sidearm ? "idle" : "at-ease"],
    ["weapon ready", 0, sidearm ? "ready" : "pike-ready"],
    ["effort", 0.38, sidearm ? "sword-effort" : "pike-thrust"],
    ["fallen hold", 1, "death"],
  ];
  return [
    {
      name: "equipment",
      pitch: 1.4,
      zoom: 200,
      target: [0, 0, 0.8],
      poses,
      views: [
        ["front-left", -0.65],
        ["front-right", 0.65],
      ],
    },
    {
      name: "complete-weapon",
      pitch: 1.4,
      zoom: sidearm ? 150 : 75,
      target: [0, sidearm ? 0 : -0.8, sidearm ? 0.95 : 2.55],
      poses,
      views: [
        ["left", Math.PI / 2],
        ["right", -Math.PI / 2],
      ],
    },
  ];
};

export const meta = {
  name: "blender-pike-roster",
  kind: "visual",
  world: "production-model-workbench",
  tier: "full",
  snapshots: rows.flatMap(({ name, selection }) =>
    candidateSnapshots(`pike-roster/${name}`, [], cameras(selection.state === "sidearm")),
  ),
  describe: "Fitted heavy and medium pike, upright carry and sword-sidearm equipment states.",
};

export async function run(ctx) {
  for (const { id, name, selection } of rows) {
    await runCandidateSheet(ctx, {
      name: meta.name,
      asset: name,
      label: name,
      folder: `pike-roster/${name}`,
      classes: [id],
      expectedPresentation: pikeFamilyPresentation(selection.state),
      baseCameras: cameras(selection.state === "sidearm"),
    });
  }
}
