import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";
import { captureMediumTravel, mediumTravelSnapshots } from "./_medium-travel.mjs";

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
];

export const meta = {
  name: "medium-phalanx",
  kind: "visual",
  world: "medium-phalanx-candidate",
  tier: "full",
  snapshots: [...candidateSnapshots("medium-phalanx", [], cameras), ...mediumTravelSnapshots],
  describe:
    "Fitted medium armor, forward pike carry and ordinary upright-pike walk; manual row14 candidate only.",
};

export async function run(ctx) {
  await runCandidateSheet(ctx, {
    name: meta.name,
    asset: "medium-phalanx",
    label: "Medium phalanx candidate",
    folder: "medium-phalanx",
    classes: [14],
    baseCameras: cameras,
    afterSheets: captureMediumTravel,
  });
}
