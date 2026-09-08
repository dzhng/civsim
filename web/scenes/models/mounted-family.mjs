import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";
import { snapshotSelected } from "../../snapshot.mjs";
import { mountedPresentation } from "../../../packages/soldier-assets/bake/mounted-motion-contract.mjs";

const families = [
  [6, "shock-cavalry"],
  [15, "shock-cavalry-sidearm"],
  [7, "horse-archer"],
];
const familyCameras = (id) => [
  {
    name: "equipment-actions",
    pitch: 1.35,
    zoom: 100,
    target: [0, 0, 1.15],
    poses: [
      ["ready", 0, "ready"],
      ["melee effort", 0.5, "melee"],
      ...(id === 7 ? [["drawn release", 0.5, "release"]] : []),
    ],
    views: [
      ["left side", Math.PI / 2],
      ["opposing oblique", -Math.PI / 4],
    ],
  },
  {
    name: "fallen",
    alive: false,
    pitch: 1.35,
    zoom: 100,
    target: [0, 0, 0.65],
    poses: [["fallen hold", 1, "death"]],
    views: [
      ["left side", Math.PI / 2],
      ["opposing oblique", -Math.PI / 4],
    ],
  },
];
const motionCameras = (id) =>
  (id === 6 ? ["walk", "run", "hit", "death", "melee"] : id === 15 ? ["melee"] : ["release"]).map(
    (clip) => ({
      name: `motion-${clip}`,
      alive: clip !== "death",
      pitch: 1.35,
      zoom: 100,
      target: [0, 0, clip === "death" ? 0.85 : 1.15],
      poses: [
        ...Array.from({ length: 8 }, (_, i) => [
          `${clip} sample ${i}`,
          i / (clip === "walk" || clip === "run" ? 8 : 7),
          clip,
        ]),
        ...(clip === "death" ? [["settled terminal hold", 1, "death"]] : []),
      ],
      views: [
        ["left side", Math.PI / 2],
        ["opposing oblique", -Math.PI / 4],
      ],
    }),
  );
export const meta = {
  name: "mounted-family",
  kind: "visual",
  world: "mounted-family-candidate",
  tier: "full",
  snapshots: families.flatMap(([id, name]) =>
    candidateSnapshots(name, motionCameras(id), familyCameras(id)),
  ),
  describe:
    "Original mounted families, rider actions and genuine horse motion on the production poser.",
};
export async function run(ctx) {
  for (const [id, name] of families) {
    const baseCameras = familyCameras(id),
      details = motionCameras(id);
    if (!candidateSnapshots(name, details, baseCameras).some((name) => snapshotSelected(name)))
      continue;
    await runCandidateSheet(ctx, {
      name: meta.name,
      asset: name,
      label: name,
      folder: name,
      classes: [id],
      baseCameras,
      details,
      expectedPresentation: mountedPresentation(id === 7),
      inspectionClip: { name: "ready", loop: true },
    });
  }
}
