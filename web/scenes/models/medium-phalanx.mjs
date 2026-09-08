import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";
import { captureMediumMotion, mediumMotionSnapshots } from "./_medium-motion.mjs";

const views = [
  ["front", 0],
  ["side", -Math.PI / 2],
  ["rear", Math.PI],
  ["oblique", Math.PI / 4],
];
const poses = [["two-hand carry", 0, "pike-carry"]];
const handViews = [
  ["front", 0],
  ["outer", -Math.PI / 2],
  ["rear", Math.PI],
  ["front-quarter", -Math.PI / 4],
];
const thrustPoses = [
  ["ready control", 0, "pike-ready"],
  ["preparation", 8 / 39, "pike-thrust"],
  ["extension", 15 / 39, "pike-thrust"],
  ["recovery", 28 / 39, "pike-thrust"],
];
const cameras = [
  { name: "complete-pike", pitch: 1.4, zoom: 85, target: [0, -0.8, 1.15], poses, views },
  { name: "whole-soldier", pitch: 1.4, zoom: 230, target: [0, 0, 0.95], poses, views },
  { name: "armor", pitch: 1.4, zoom: 460, target: [0, 0, 1.3], poses, views },
  {
    name: "rear-hand",
    pitch: 1.4,
    zoom: 1700,
    target: [-0.27, -0.02, 1.03],
    poses,
    views: handViews,
  },
  {
    name: "front-hand",
    pitch: 1.4,
    zoom: 1700,
    target: [-0.27, -0.36, 1.15],
    poses,
    views: handViews,
  },
  { name: "both-hands", pitch: 1.2, zoom: 700, target: [-0.27, -0.19, 1.09], poses, views },
  { name: "waist", pitch: 1.4, zoom: 800, target: [0, 0, 1.05], poses, views },
  {
    name: "formation-gameplay",
    pitch: 0.42,
    zoom: 44,
    target: [0, -0.4, 1.25],
    poses,
    views,
    formation: true,
  },
  {
    name: "run-whole",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: [
      ["run 0", 0, "run"],
      ["run 1/2", 0.5, "run"],
    ],
    views: [
      ["rear-left", Math.PI - 0.65],
      ["rear-right", Math.PI + 0.65],
    ],
  },
  {
    name: "run-front",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: [
      ["run 0", 0, "run"],
      ["run 1/2", 0.5, "run"],
    ],
    views: [
      ["front-left", -0.65],
      ["front-right", 0.65],
    ],
  },
  {
    name: "run-pike",
    pitch: 1.4,
    zoom: 85,
    target: [0, 0, 2.1],
    poses: [
      ["run 0", 0, "run"],
      ["run 1/2", 0.5, "run"],
    ],
    views: [
      ["left", -Math.PI / 2],
      ["right", Math.PI / 2],
    ],
  },
  {
    name: "pike-ready-whole",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: [
      ["forward control", 0, "pike-carry"],
      ["loaded ready", 0, "pike-ready"],
    ],
    views: [
      ["front-left", -0.65],
      ["front-right", 0.65],
    ],
  },
  {
    name: "pike-ready-complete",
    pitch: 1.4,
    zoom: 85,
    target: [0, -0.8, 1.15],
    poses: [
      ["forward control", 0, "pike-carry"],
      ["loaded ready", 0, "pike-ready"],
    ],
    views: [
      ["left", -Math.PI / 2],
      ["right", Math.PI / 2],
    ],
  },
  {
    name: "pike-thrust-poses",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: thrustPoses,
    views: [
      ["front-left", -0.65],
      ["front-right", 0.65],
    ],
  },
  {
    name: "pike-thrust-complete",
    pitch: 1.4,
    zoom: 85,
    target: [0, -0.8, 1.15],
    poses: thrustPoses,
    views: [
      ["left", -Math.PI / 2],
      ["right", Math.PI / 2],
    ],
  },
];

export const meta = {
  name: "medium-phalanx",
  kind: "visual",
  world: "medium-phalanx-candidate",
  tier: "full",
  snapshots: [...candidateSnapshots("medium-phalanx", [], cameras), ...mediumMotionSnapshots],
  describe:
    "Fitted medium armor, pike posture, upright-pike travel and stationary thrust; manual row14 candidate only.",
};

export async function run(ctx) {
  await runCandidateSheet(ctx, {
    name: meta.name,
    asset: "medium-phalanx",
    label: "Medium phalanx candidate",
    folder: "medium-phalanx",
    classes: [14],
    baseCameras: cameras,
    afterSheets: captureMediumMotion,
  });
}
