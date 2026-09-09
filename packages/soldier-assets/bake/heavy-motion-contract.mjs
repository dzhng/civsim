// Applies to the saved heavy actions and equipment variants that preserve them.
// Directional distances are authored stride_distance_m properties in that Blend;
// forward distances are the retained measured support/recovery calibration.
export const heavyMotionBake = {
  loopClips: [
    "idle",
    "ready",
    "walk",
    "run",
    "guarded-backward-walk",
    "guarded-left-walk",
    "guarded-right-walk",
  ],
  clipMetadata: {
    walk: { strideMeters: 1.53 },
    run: { strideMeters: 2.584 },
    "guarded-backward-walk": { strideMeters: 0.9161101579666129 },
    "guarded-left-walk": { strideMeters: 0.45646570563188277 },
    "guarded-right-walk": { strideMeters: 0.5551884194414423 },
  },
};

export const heavyPresentation = {
  actions: {
    atEase: { clip: "idle", layer: "fullBody" },
    ready: { clip: "ready", layer: "fullBody" },
    walk: { clip: "walk", layer: "fullBody" },
    run: { clip: "run", layer: "fullBody" },
    guardedBackwardWalk: { clip: "guarded-backward-walk", layer: "fullBody" },
    guardedLeftWalk: { clip: "guarded-left-walk", layer: "fullBody" },
    guardedRightWalk: { clip: "guarded-right-walk", layer: "fullBody" },
    melee: { clip: "sword-effort", layer: "fullBody" },
    hit: { clip: "hit", layer: "fullBody" },
    death: { clip: "death", layer: "fullBody" },
    release: null,
    pikeReady: null,
  },
  riderUpperBodyJoints: null,
};
