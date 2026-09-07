import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";

const bearings = [["front", 0], ["right side", -Math.PI / 2],
  ["rear", Math.PI], ["three-quarter", Math.PI / 4]];
const fittingPoses = [["ready", 0, "ready"], ["walk first contact", 0, "walk"],
  ["walk opposite contact", .5, "walk"], ["run first contact", 0, "run"],
  ["run opposite contact", .5, "run"], ["deep bend", .5, "bend"]];

const details = [
  { name: "garment-poses", pitch: 1.4, zoom: 460, target: [0, 0, 1.32],
    poses: fittingPoses, views: bearings },
  { name: "scabbard-poses", pitch: 1.4, zoom: 560, target: [-.24, .045, .76],
    poses: fittingPoses, views: bearings },
  { name: "ready", pitch: 1.4, zoom: 230, target: [0, 0, 0.95],
    poses: [["ready", 0, "ready"]] },
  { name: "ready-feet", pitch: 1.2, zoom: 1000, target: [0, 0, 0.12],
    poses: [["ready", 0, "ready"]] },
  ...[["walk", 27], ["run", 24]].map(([clip, frames]) => ({
    name: `${clip}-frames`, pitch: 1.4, zoom: 230, target: [0, 0, 0.95],
    poses: Array.from({ length: frames + 1 }, (_, i) => [`${clip} frame ${i}`, i / frames, clip]),
    views: bearings })),
];

export const meta = {
  name: "heavy-kit",
  kind: "visual",
  world: "heavy-kit-candidate",
  tier: "full",
  snapshots: candidateSnapshots("heavy-kit", details),
  describe:
    "Composed Blender heavy equipment, surfaces and locomotion on the shared provisional rig; candidate-only.",
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
