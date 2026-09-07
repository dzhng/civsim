import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";

const details = [
  { name: "ready", poses: [["ready", 0, "ready"]] },
  {
    name: "walk-frames",
    poses: Array.from({ length: 28 }, (_, i) => [`walk frame ${i}`, i / 27, "walk"]),
  },
  {
    name: "run-frames",
    poses: Array.from({ length: 25 }, (_, i) => [`run frame ${i}`, i / 24, "run"]),
  },
].map((camera) => ({
  ...camera,
  pitch: 1.4,
  zoom: 230,
  target: [0, 0, 0.95],
  views: [
    ["front", 0],
    ["right side", -Math.PI / 2],
    ["rear", Math.PI],
    ["three-quarter", Math.PI / 4],
  ],
}));

export const meta = {
  name: "heavy-motion",
  kind: "visual",
  world: "heavy-motion-candidate",
  tier: "full",
  snapshots: candidateSnapshots("heavy-motion", details),
  describe:
    "Frozen equipped heavy ready/walk/run studies; inspection clips and static geometry remain unchanged.",
};

export async function run(ctx) {
  await runCandidateSheet(ctx, {
    name: meta.name,
    asset: "heavy-motion",
    label: "Heavy motion candidate",
    folder: "heavy-motion",
    classes: [0],
    details,
  });
}
