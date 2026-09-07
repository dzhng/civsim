import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";

const details = [
  { name: "ready", pitch: 1.4, zoom: 230, target: [0, 0, 0.95],
    poses: [["ready", 0, "ready"]] },
  { name: "ready-feet", pitch: 1.2, zoom: 1000, target: [0, 0, 0.12],
    poses: [["ready", 0, "ready"]] },
  { name: "walk-frames", pitch: 1.4, zoom: 230, target: [0, 0, 0.95],
    poses: Array.from({ length: 31 }, (_, i) => [`walk frame ${i}`, i / 30, "walk"]),
    views: [["front", 0], ["right side", -Math.PI / 2],
      ["rear", Math.PI], ["three-quarter", Math.PI / 4]] },
];

export const meta = {
  name: "heavy-kit",
  kind: "visual",
  world: "heavy-kit-candidate",
  tier: "full",
  snapshots: candidateSnapshots("heavy-kit", details),
  describe:
    "Composed Blender heavy equipment, surfaces and ready stance on the shared provisional rig; candidate-only.",
};

export async function run(ctx) {
  await runCandidateSheet(ctx, {
    name: meta.name,
    asset: "heavy-kit",
    label: "Heavy infantry candidate",
    folder: "heavy-kit",
    classes: [0],
    details,
  });
}
