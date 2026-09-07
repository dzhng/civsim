import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";

const details = [
  ["pronation", [-0.48, -0.018, 1.04]],
  ["bend-pronation", [-0.3, -0.2, 0.95]],
].map(([clip, target]) => ({
  name: `${clip}-detail`,
  pitch: 1.4,
  zoom: 950,
  target,
  views: [
    ["front", 0],
    ["rear", Math.PI],
    ["three-quarter", Math.PI / 4],
  ],
  poses: [
    ["without pronation", clip === "pronation" ? 0 : 0.5, "bend"],
    ...[0, 0.25, 0.5, 0.75, 1].map((phase) => [`${clip} ${phase}`, phase, clip]),
  ],
}));
details.push(
  {
    name: "power-grip",
    pitch: 1.4,
    zoom: 1900,
    target: [-0.5732, -0.051, 0.9024],
    poses: [["neutral", 0, "bend"]],
    views: [
      ["front", 0],
      ["right side", -Math.PI / 2],
      ["rear", Math.PI],
      ["right three-quarter", -Math.PI / 4],
    ],
  },
  {
    name: "bent-head-detail",
    pitch: 1.4,
    zoom: 1000,
    target: [0, -0.1, 1.57],
    poses: [["deep bend", 0.5]],
  },
);

export const meta = {
  name: "human-anatomy",
  kind: "visual",
  world: "human-anatomy-candidate",
  tier: "full",
  snapshots: candidateSnapshots("anatomy", details),
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
    details,
  });
}
