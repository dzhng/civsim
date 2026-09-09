export const mountedLoopClips = ["idle", "ready", "walk", "run"];
export const mountedClipMetadata = (archer) => ({
  walk: { strideMeters: strides.walk },
  run: { strideMeters: strides.run },
  ...(archer ? { release: { markers: { release: 0.6 } } } : {}),
});

/** Existing action roles; the horse and seated lower body never enter the upper mask. */
export function mountedPresentation(archer) {
  const full = (clip) => ({ clip, layer: "fullBody" });
  const upper = (clip) => ({ clip, layer: "riderUpperBody" });
  return {
    actions: {
      ready: full("ready"),
      atEase: full("idle"),
      walk: full("walk"),
      run: full("run"),
      guardedBackwardWalk: null,
      guardedLeftWalk: null,
      guardedRightWalk: null,
      melee: upper("melee"),
      release: archer ? upper("release") : null,
      hit: full("hit"),
      death: full("death"),
      pikeReady: null,
    },
    riderUpperBodyJoints: [
      "spine",
      "chest",
      "neck",
      "head",
      ...["L", "R"].flatMap((side) =>
        ["clavicle", "upper-arm", "forearm", "hand", "elbow-volume"].map(
          (name) => `${name}.${side}`,
        ),
      ),
      ...(archer ? ["bow-string", "held-sword"] : []),
    ],
  };
}
import strides from "./mounted-strides.json" with { type: "json" };
