import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import { bakeLocalAnimation } from "../../../packages/soldier-assets/src/localAnimation";
import { assertAppearancePresentation } from "../../../packages/soldier-assets/src/presentation";

/** Test admission only: no new gait, release or death art is authored here.
 * Distinct gait aliases exercise controller crossfades with the original tracks.
 * The rider action doubles as a synthetic full-body terminal transition target;
 * its held endpoint proves transport, not an authored falling/death animation.
 */
export function mountedTemporalFixture(source: AppearanceBundle): AppearanceBundle {
  if (source.manifest.name !== "mounted-diagnostic" || !source.manifest.mounted)
    throw new Error("Mounted temporal fixture requires the authored mounted diagnostic");
  const fixture = structuredClone(source);
  const gait = fixture.rig.clips.find((clip) => clip.name === "gait");
  const action = fixture.rig.clips.find((clip) => clip.name === "rider-action");
  if (!gait || !action) throw new Error("Mounted diagnostic lacks authored gait/action tracks");
  fixture.rig.clips.push(
    // Nominal fixture speeds of 1/2 m/s exercise cadence, not authored foot grounding.
    { ...structuredClone(gait), name: "fixture-walk", loop: true, strideMeters: gait.duration },
    { ...structuredClone(gait), name: "fixture-run", loop: true, strideMeters: 2 * gait.duration },
    // Synthetic marker leaves 200ms of the original one-second action to exit.
    { ...structuredClone(action), name: "fixture-release", loop: false, markers: { release: 0.8 } },
    { ...structuredClone(action), name: "fixture-fullbody-terminal", loop: false },
  );
  fixture.animation = bakeLocalAnimation(fixture.rig);
  fixture.manifest.presentation = {
    riderUpperBodyJoints: ["rider-spine", "rider-arm", "rider-head"],
    actions: {
      ready: { clip: "gait", layer: "fullBody" },
      atEase: { clip: "gait", layer: "fullBody" },
      walk: { clip: "fixture-walk", layer: "fullBody" },
      run: { clip: "fixture-run", layer: "fullBody" },
      release: { clip: "fixture-release", layer: "riderUpperBody" },
      hit: { clip: "fixture-fullbody-terminal", layer: "fullBody" },
      death: { clip: "fixture-fullbody-terminal", layer: "fullBody" },
      melee: null,
      pikeReady: null,
      guardedBackwardWalk: null,
      guardedLeftWalk: null,
      guardedRightWalk: null,
    },
  };
  assertAppearancePresentation(fixture.manifest.presentation, fixture.rig, fixture.animation, true);
  return fixture;
}
