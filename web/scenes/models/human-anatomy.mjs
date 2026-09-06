import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";

export const meta = {
  name: "human-anatomy",
  kind: "visual",
  world: "human-anatomy-candidate",
  tier: "full",
  snapshots: candidateSnapshots("anatomy"),
  describe:
    "Shared untextured Blender anatomy, neutral and deep-bend contact sheets through the production workbench. Candidate-only: no motion, LOD or art-budget acceptance.",
};

export async function run(ctx) {
  return runCandidateSheet(ctx, {
    name: meta.name,
    asset: "human-anatomy",
    label: "Shared human candidate",
    folder: "anatomy",
    classes: [0, 14],
  });
}
