export const VGPU_CANDIDATE = {
  backend: "vgpu",
  packageVersion: "0.5.0",
  releaseCommit: "1c36ab82fcb38dc23dd3a1665ea086accd1d4e79",
  inspectedCanaryCommit: "f94f1dd8c9949d3613f19ac15c49027cbff51a3d",
  eligibility: "unrankable — preflight only",
  missingParity: [
    "posed crowd",
    "impostors",
    "terrain",
    "scenery",
    "grass",
    "directional shadows",
    "depth-tested cues",
    "environment",
    "post output",
  ],
} as const;
