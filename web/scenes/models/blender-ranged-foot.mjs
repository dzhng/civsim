import { candidateSnapshots, runCandidateSheet } from "./_candidate-sheet.mjs";

const rows = [
  { id: 4, name: "archers", clip: "bow-release" },
  { id: 5, name: "skirmishers", clip: "throw-release" },
  { id: 8, name: "artillery-crew", clip: "crew-release" },
];
const cameras = (clip) => [
  {
    name: "equipment-release",
    pitch: 1.4,
    zoom: 190,
    target: [0, 0, 1.05],
    poses: [
      ["at ease", 0, "idle"],
      ["ready", 0, "ready"],
      ["release", 0, clip],
      ["recovery", 0.35, clip],
      ["recovered equipment", 1, clip],
      ["melee sidearm", 0.35, "sword-effort"],
    ],
  },
];

export const meta = {
  name: "blender-ranged-foot",
  kind: "visual",
  world: "production-model-workbench",
  tier: "full",
  snapshots: rows.flatMap(({ name, clip }) =>
    candidateSnapshots(`ranged-foot/${name}`, [], cameras(clip)),
  ),
  describe: "Fitted foot ranged and crew equipment with observed-release recovery.",
};

export async function run(ctx) {
  for (const { id, name, clip } of rows) {
    await runCandidateSheet(ctx, {
      name: meta.name,
      asset: name,
      label: name,
      folder: `ranged-foot/${name}`,
      classes: [id],
      baseCameras: cameras(clip),
    });
  }
}
