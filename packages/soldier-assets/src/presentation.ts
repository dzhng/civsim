import type { ImportedRig } from "./rig";
import { assertClipMarkers, type VatBake } from "./schema.ts";

export const ACTION_ROLES = [
  "ready",
  "atEase",
  "walk",
  "run",
  "melee",
  "release",
  "hit",
  "death",
  "pikeReady",
] as const;
export type ActionRole = (typeof ACTION_ROLES)[number];
export type ActionBinding = { clip: string; layer: "fullBody" | "riderUpperBody" } | null;
export interface AppearancePresentation {
  actions: Record<ActionRole, ActionBinding>;
  riderUpperBodyJoints: string[] | null;
}

/** Null is an explicit manual-only asset, not an incomplete battle presentation. */
export function assertAppearancePresentation(
  presentation: AppearancePresentation | null,
  rig: ImportedRig,
  animation: VatBake,
  mounted: boolean,
): void {
  for (const clip of animation.clips) assertClipMarkers(clip.markers);
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
    const repeating = ["ready", "atEase", "walk", "run", "pikeReady"].includes(role);
    if (clip.loop !== repeating)
      throw new Error(`presentation ${role} has incompatible clip looping`);
    if (!repeating && (clip.duration <= 0 || clip.frames < 2))
      throw new Error(`presentation ${role} requires sampled motion`);
    if (role === "release" && clip.markers?.release === undefined)
      throw new Error("release action requires an authored clip release marker");
  }
}
