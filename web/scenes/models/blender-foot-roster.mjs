import { candidateSnapshots, runCandidateSheet } from "./_candidate-sheet.mjs";

const cameras = [
  {
    name: "equipment",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: [
      ["at ease", 0, "idle"],
      ["battle ready", 0, "ready"],
    ],
  },
  {
    name: "gameplay",
    pitch: 0.42,
    zoom: 190,
    target: [0, 0, 0.95],
    poses: [["battle ready", 0, "ready"]],
  },
];
const rows = [
  { id: 9, name: "peasant", label: "Peasant infantry" },
  { id: 10, name: "light-sword", label: "Light sword infantry" },
  { id: 12, name: "medium-infantry", label: "Medium sword infantry" },
];

export const meta = {
  name: "blender-foot-roster",
  kind: "visual",
  world: "production-model-workbench",
  tier: "full",
  snapshots: rows.flatMap(({ name }) => candidateSnapshots(`foot-roster/${name}`, [], cameras)),
  describe: "Authored foot equipment through the shared weighted production renderer.",
};

export async function run(ctx) {
  for (const { id, name, label } of rows) {
    await runCandidateSheet(ctx, {
      name: meta.name,
      asset: name,
      label,
      folder: `foot-roster/${name}`,
      classes: [id],
      baseCameras: cameras,
    });
  }
}
