import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";
import { captureHeavyTravel, heavyTravelSnapshots } from "./_heavy-travel.mjs";
import { captureHeavyRest, heavyRestSnapshots } from "./_heavy-rest.mjs";
import { captureHeavyBackward, heavyBackwardSnapshots } from "./_heavy-backward.mjs";

const bearings = [
  ["front", 0],
  ["right side", -Math.PI / 2],
  ["rear", Math.PI],
  ["three-quarter", Math.PI / 4],
];
const fittingPoses = [
  ["ready", 0, "ready"],
  ["walk first contact", 0, "walk"],
  ["walk opposite contact", 0.5, "walk"],
  ["run first contact", 0, "run"],
  ["run opposite contact", 0.5, "run"],
  ["deep bend", 0.5, "bend"],
];

const details = [
  ...[
    ["formation", 0.9],
    ["formation-gameplay", 0.42],
  ].map(([name, pitch]) => ({
    name,
    pitch,
    zoom: 65,
    target: [0, 0, 0.95],
    formation: true,
    poses: [
      ["at ease", 0, "idle"],
      ["ready", 0, "ready"],
      ["walk", 0.25, "walk"],
      ["run", 0.25, "run"],
    ],
    views: bearings,
  })),
  {
    name: "sword-grip",
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
    name: "shield-grip",
    pitch: 1.4,
    zoom: 1900,
    target: [0.5732, -0.051, 0.9024],
    poses: [["neutral", 0, "bend"]],
    views: [
      ["front", 0],
      ["left side", Math.PI / 2],
      ["rear", Math.PI],
      ["left three-quarter", Math.PI / 4],
    ],
  },
  {
    name: "garment-poses",
    pitch: 1.4,
    zoom: 460,
    target: [0, 0, 1.32],
    poses: fittingPoses,
    views: bearings,
  },
  {
    name: "scabbard-poses",
    pitch: 1.4,
    zoom: 560,
    target: [-0.24, 0.045, 0.76],
    poses: fittingPoses,
    views: bearings,
  },
  { name: "ready", pitch: 1.4, zoom: 230, target: [0, 0, 0.95], poses: [["ready", 0, "ready"]] },
  { name: "idle", pitch: 1.4, zoom: 230, target: [0, 0, 0.95], poses: [["at ease", 0, "idle"]] },
  {
    name: "guarded-left-poses",
    pitch: 1.4,
    zoom: 180,
    target: [0, 0, 0.9],
    poses: [0, 0.25, 0.5, 0.75].map((phase) => [`left phase ${phase}`, phase, "guarded-left-walk"]),
    views: [
      ["actual front", 0],
      ["actual rear", Math.PI],
    ],
  },
  {
    name: "ready-feet",
    pitch: 1.2,
    zoom: 1000,
    target: [0, 0, 0.12],
    poses: [["ready", 0, "ready"]],
  },
  ...[
    ["walk", 27],
    ["run", 24],
  ].map(([clip, frames]) => ({
    name: `${clip}-frames`,
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: Array.from({ length: frames + 1 }, (_, i) => [`${clip} frame ${i}`, i / frames, clip]),
    views: bearings,
  })),
];

export const meta = {
  name: "heavy-kit",
  kind: "visual",
  world: "heavy-kit-candidate",
  tier: "full",
  snapshots: [
    ...candidateSnapshots("heavy-kit", details),
    ...heavyTravelSnapshots,
    ...heavyRestSnapshots,
    ...heavyBackwardSnapshots,
  ],
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
    afterSheets: async (ctx, page) => {
      await captureHeavyRest(ctx, page);
      await captureHeavyTravel(ctx, page);
      await captureHeavyBackward(ctx, page);
    },
  });
}
