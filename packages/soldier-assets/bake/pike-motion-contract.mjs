import { heavyMotionBake } from "./heavy-motion-contract.mjs";

// The pike keeps the reviewed lower guarded cycles and forward walk. Its
// retained run support translates at 3.143269 m/s over the authored .8 s cycle,
// not the earlier 3.23 m/s prescribed comparison travel.
export const pikeMotionBake = {
  loopClips: [
    ...heavyMotionBake.loopClips.filter((clip) => clip !== "idle"),
    "pike-carry",
    "pike-ready",
    "at-ease",
  ],
  clipMetadata: {
    ...heavyMotionBake.clipMetadata,
    run: { strideMeters: 2.5146152 },
  },
};

export function pikeFamilyPresentation(state = "primary") {
  const sidearm = state === "sidearm";
  const full = (clip) => ({ clip, layer: "fullBody" });
  return {
    riderUpperBodyJoints: null,
    actions: {
      ready: full(sidearm ? "ready" : state === "atEase" ? "at-ease" : "pike-ready"),
      atEase: full(sidearm ? "idle" : "at-ease"),
      walk: full("walk"),
      run: full("run"),
      guardedBackwardWalk: full("guarded-backward-walk"),
      guardedLeftWalk: full("guarded-left-walk"),
      guardedRightWalk: full("guarded-right-walk"),
      melee: full(sidearm ? "sword-effort" : "pike-thrust"),
      release: null,
      hit: full("hit"),
      death: full("death"),
      pikeReady: sidearm ? null : full("pike-ready"),
    },
  };
}
