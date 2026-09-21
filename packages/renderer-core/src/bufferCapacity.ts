/** Shared byte allocation policy; resource creation remains with each renderer. */
export function alignedBufferBytes(byteLength: number): number {
  return Math.max(4, Math.ceil(byteLength / 4) * 4);
}
export function growableBufferCapacity(currentBytes: number, requiredBytes: number): number {
  const required = alignedBufferBytes(requiredBytes);
  return required > currentBytes ? Math.max(required, currentBytes * 2, 128) : currentBytes;
}
