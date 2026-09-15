import type { StorageBuffer } from "vgpu";
/** vgpu0.5.0's public storage object has destroy(), omitted from StorageBuffer's declaration. */
export function destroyVgpuStorage(value: StorageBuffer): void {
  if (!("destroy" in value) || typeof value.destroy !== "function")
    throw Error("vgpu storage lacks its required destroy() lifetime method");
  value.destroy();
}
