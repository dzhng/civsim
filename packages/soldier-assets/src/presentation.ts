import type { ImportedRig } from "./rig";
import { assertClipMetadata } from "./schema.ts";
import type { LocalAnimation } from "./localAnimation";

export const ACTION_ROLES = [
  "ready",
  "atEase",
  "walk",
  "run",
  "guardedBackwardWalk",
  "guardedLeftWalk",
  "guardedRightWalk",
  "melee",
  "release",
  "hit",
  "death",
  "pikeReady",
] as const;
export type ActionRole = (typeof ACTION_ROLES)[number];
export function isGaitRole(role: ActionRole): boolean {
  return (
    role === "walk" ||
    role === "run" ||
    role === "guardedBackwardWalk" ||
    role === "guardedLeftWalk" ||
    role === "guardedRightWalk"
  );
}
export type ActionBinding = { clip: string; layer: "fullBody" | "riderUpperBody" } | null;
export interface AppearancePresentation {
  actions: Record<ActionRole, ActionBinding>;
  riderUpperBodyJoints: string[] | null;
}

/** Null is an explicit manual-only asset, not an incomplete battle presentation. */
export function assertAppearancePresentation(
  presentation: AppearancePresentation | null,
  rig: ImportedRig,
  animation: Pick<LocalAnimation, "clips">,
  mounted: boolean,
): void {
  for (const clip of animation.clips) {
    assertClipMetadata(clip);
    if (clip.strideMeters !== undefined && (!clip.loop || clip.duration <= 0))
      throw new Error("stride calibration requires a positive-duration looping clip");
  }
  if (presentation === null) return;
  if (!presentation || !presentation.actions)
    throw new Error("appearance requires explicit presentation or null");
  const mask = presentation.riderUpperBodyJoints;
  if (
    mask !== null &&
    (!mounted ||
      !Array.isArray(mask) ||
      !mask.length ||
      new Set(mask).size !== mask.length ||
      mask.some(
        (name) => typeof name !== "string" || !rig.bones.some((bone) => bone.name === name),
      ))
  ) {
    throw new Error(
      "rider upper-body mask requires unique existing joint names on a mounted appearance",
    );
  }
  for (const role of ACTION_ROLES) {
    const binding = presentation.actions[role];
    if (binding === null) {
      if (["ready", "atEase", "walk", "run", "hit", "death"].includes(role))
        throw new Error(`presentation ${role} is required`);
      continue;
    }
    const clip = animation.clips.find((clip) => clip.name === binding?.clip);
    if (!binding || !clip)
      throw new Error(
        `presentation ${role} references a missing clip: ${binding?.clip ?? "undeclared"}`,
      );
    if (
      !["fullBody", "riderUpperBody"].includes(binding.layer) ||
      (binding.layer === "riderUpperBody" && (!mask || !["melee", "release"].includes(role)))
    ) {
      throw new Error(`presentation ${role} has an invalid action layer`);
    }
    const repeating = isGaitRole(role) || ["ready", "atEase", "pikeReady"].includes(role);
    if (clip.loop !== repeating)
      throw new Error(`presentation ${role} has incompatible clip looping`);
    if (isGaitRole(role) !== (clip.strideMeters !== undefined))
      throw new Error(`presentation ${role} has incompatible stride calibration`);
    if (!repeating && (clip.duration <= 0 || clip.times.length < 2))
      throw new Error(`presentation ${role} requires sampled motion`);
    if (role === "release" && clip.markers?.release === undefined)
      throw new Error("release action requires an authored clip release marker");
  }
  const nominal = (role: "walk" | "run") => {
    const clip = animation.clips.find((clip) => clip.name === presentation.actions[role]!.clip)!;
    return clip.strideMeters! / clip.duration;
  };
  const walk = nominal("walk"),
    run = nominal("run");
  if (!Number.isFinite(walk) || !Number.isFinite(run) || run <= walk)
    throw new Error("run nominal speed must be finite and greater than walk nominal speed");
}
