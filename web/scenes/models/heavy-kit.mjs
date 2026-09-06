import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";

export const meta = {
  name: "heavy-kit",
  kind: "visual",
  world: "heavy-kit-candidate",
  tier: "full",
  snapshots: candidateSnapshots("heavy-kit"),
  describe:
    "Neutral-clay heavy equipment fitting on the shared provisional human rig; candidate-only.",
};

export async function run(ctx) {
  await runCandidateSheet(ctx, {
    name: meta.name,
    asset: "heavy-kit",
    label: "Heavy infantry candidate",
    folder: "heavy-kit",
    classes: [0],
  });
}
