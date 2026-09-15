/** Package identity only: which vgpu build a report observed. Every scope or
 * eligibility claim belongs to the report that made the observation. */
export const VGPU_CANDIDATE = {
  backend: "vgpu",
  packageVersion: "0.5.0",
  releaseCommit: "1c36ab82fcb38dc23dd3a1665ea086accd1d4e79",
  inspectedCanaryCommit: "f94f1dd8c9949d3613f19ac15c49027cbff51a3d",
} as const;
