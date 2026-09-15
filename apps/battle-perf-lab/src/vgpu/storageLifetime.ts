import type { StorageBuffer } from "vgpu";
/** vgpu0.5.0's public storage object has destroy(), omitted from StorageBuffer's declaration. */
export function destroyVgpuStorage(value: StorageBuffer): void {
  if (!("destroy" in value) || typeof value.destroy !== "function")
    throw Error("vgpu storage lacks its required destroy() lifetime method");
  value.destroy();
}

type OffsetWrite = (data: BufferSource, byteOffset: number) => void;

/** vgpu0.5.0's write() takes a destination byte offset, omitted from the same
 *  declaration. Bounded record publication needs it: without an offset every
 *  partial write would have to resend the whole capacity buffer. */
export function writeVgpuStorageAt(
  value: StorageBuffer,
  byteOffset: number,
  data: BufferSource,
): void {
  if (value.write.length < 2)
    throw Error("vgpu storage write() lacks its required destination offset");
  (value.write as OffsetWrite).call(value, data, byteOffset);
}
