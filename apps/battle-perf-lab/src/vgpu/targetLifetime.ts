import type { Target } from "vgpu";

/** vgpu0.5.0 OffscreenTarget exposes destroy() at runtime but omits it from Target's type.
 * Borrowed-device context disposal does not release these attachments. */
export function destroyVgpuTarget(value: Target): void {
  if (!("destroy" in value) || typeof value.destroy !== "function")
    throw new Error("vgpu offscreen target lacks its required destroy() lifetime method");
  value.destroy();
}
