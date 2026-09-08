import { runCandidateSheet, candidateSnapshots } from "./_candidate-sheet.mjs";
import { captureHeavyTravel, heavyTravelSnapshots } from "./_heavy-travel.mjs";
import { captureHeavyRest, heavyRestSnapshots } from "./_heavy-rest.mjs";
import { captureHeavyBackward, heavyBackwardSnapshots } from "./_heavy-backward.mjs";
import { snapshotSelected } from "../../snapshot.mjs";
import { heavyPresentation } from "../../../packages/soldier-assets/bake/heavy-motion-contract.mjs";
import { captureMeshLods, meshLodSnapshots } from "./_mesh-lod-sheet.mjs";

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
  {
    name: "death-fall",
    alive: false,
    pitch: 1.15,
    zoom: 220,
    target: [0.2, 0, 0.85],
    poses: [0, 6, 14, 24, 33, 42].map((frame) => [`death frame ${frame}`, frame / 42, "death"]),
    views: [
      ["left oblique", Math.PI / 4],
      ["opposing oblique", (-3 * Math.PI) / 4],
    ],
  },
  {
    name: "hit-motion",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: [
      ["ready lead", 0, "ready"],
      ...Array.from({ length: 19 }, (_, frame) => [`hit frame ${frame}`, frame / 18, "hit"]),
      ["ready tail", 0, "ready"],
    ],
    views: [
      ["right side", -Math.PI / 2],
      ["opposing oblique", (3 * Math.PI) / 4],
    ],
  },
  {
    name: "hit-side-smoke",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: [0, 1 / 3, 2 / 3, 1].map((phase) => [`hit phase ${phase}`, phase, "hit"]),
    views: [
      ["right side", -Math.PI / 2],
      ["opposing oblique", (3 * Math.PI) / 4],
    ],
  },
  {
    name: "hit-smoke",
    pitch: 1.4,
    zoom: 230,
    target: [0, 0, 0.95],
    poses: [0, 1 / 3, 2 / 3, 1].map((phase) => [`hit phase ${phase}`, phase, "hit"]),
    views: [
      ["actual front", 0],
      ["actual rear", Math.PI],
    ],
  },
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
    name: "guarded-right-hip-poses",
    pitch: 1.4,
    zoom: 220,
    target: [0, 0, 0.9],
    poses: [0, 0.25, 0.5, 0.75].map((phase) => [
      `right phase ${phase}`,
      phase,
      "guarded-right-walk",
    ]),
    views: [["scabbard side", -Math.PI / 3]],
  },
  {
    name: "sword-effort-poses",
    pitch: 1.4,
    zoom: 180,
    target: [0, 0, 1],
    poses: [0, 0.3, 11 / 30, 0.5, 0.7, 0.9, 1.2].map((seconds) => [
      `effort ${seconds.toFixed(3)} s`,
      seconds / 1.2,
      "sword-effort",
    ]),
    views: [
      ["front", 0],
      ["sword-side opposing", -Math.PI / 3],
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

const effortViews = [
  ["opposing", (Math.PI * 2) / 3],
  ["oblique", (Math.PI * 4) / 3],
];
const effortName = (view, frame) =>
  `shared/soldiers/heavy-kit/sword-effort-${view}-${String(frame).padStart(2, "0")}`;
const effortSnapshots = effortViews.flatMap(([view]) =>
  Array.from({ length: 48 }, (_, frame) => effortName(view, frame)),
);

/** One reviewed effort at 30fps with .2s ready lead/tail; no simulated strike. */
async function captureSwordEffort(ctx, page) {
  if (!effortSnapshots.some((name) => snapshotSelected(name))) return;
  const metadata = await page.evaluate(() =>
    window.__battleModels.world.soldierAssets[0].animation.clips.find(
      (c) => c.name === "sword-effort",
    ),
  );
  ctx.check(
    "Sword effort retains reviewed nonlooping duration",
    !metadata.loop && Math.abs(metadata.duration - 1.2) < 1e-6,
  );
  for (const [view, yaw] of effortViews)
    for (let frame = 0; frame < 48; frame++) {
      const name = effortName(view, frame);
      if (!snapshotSelected(name)) continue;
      const seconds = (frame - 6) / 30;
      const clip = seconds < 0 || seconds >= 1.2 ? "ready" : "sword-effort";
      const phase = clip === "ready" ? 0 : seconds / 1.2;
      const draw = async () => {
        await page.evaluate(
          ({ clip, phase, yaw, view, seconds }) => {
            const h = window.__battleModels;
            h.freeze();
            h.set({
              classId: 0,
              clip,
              phase,
              formation: false,
              yaw,
              pitch: 1.4,
              zoom: 180,
              target: [0, 0, 1],
            });
            const caption = document.querySelector("#candidate-caption");
            caption.style.display = "";
            caption.textContent = `Unpaired sword effort · ${view}\n${clip} · ${seconds.toFixed(3)} s`;
          },
          { clip, phase, yaw, view, seconds },
        );
        await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
        return {
          shot: await page.screenshot({ clip: { x: 128, y: 96, width: 1024, height: 640 } }),
          sampled: await page.evaluate(() => window.__battleModels.stats().sampled),
        };
      };
      const sample = await draw(),
        repeat = await draw();
      ctx.check(`${name}: exact repeated pose`, sample.shot.equals(repeat.shot));
      ctx.check(
        `${name}: authored phase reaches production`,
        sample.sampled.clip === clip && Math.abs(sample.sampled.phase - phase) < 1e-6,
      );
      await ctx.snap(null, name, { shot: sample.shot, threshold: 0, maxDiffRatio: 0 });
    }
}

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
    ...effortSnapshots,
    ...meshLodSnapshots("heavy-kit"),
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
    expectedPresentation: heavyPresentation,
    details,
    afterSheets: async (ctx, page) => {
      await captureMeshLods(ctx, page, {
        folder: "heavy-kit",
        classId: 0,
        ready: "ready",
        attack: "sword-effort",
        zoom: 180,
      });
      await captureHeavyRest(ctx, page);
      await captureHeavyTravel(ctx, page);
      await captureHeavyBackward(ctx, page);
      await captureSwordEffort(ctx, page);
    },
  });
}
