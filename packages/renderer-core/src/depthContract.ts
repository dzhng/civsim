export const GPU_DEPTH_MODES = ['read', 'read-write', 'write'] as const;

export type GpuDepthMode = typeof GPU_DEPTH_MODES[number];

export const GPU_WORLD_DEPTH_ATTACHMENT = 'worldDepth' as const;

// The ONE depth convention engine-wide: reverse-Z (near → 1, far → 0) in a
// depth32float buffer cleared to 0, compared `greater`/`greater-equal`.
// Reverse-Z spends 32-bit float precision where it matters (the far plane is
// exactly 0) and pairs with camera3d's infinite-far projection. depth32float
// is WebGPU-core mandatory, so there is no format fallback.
export const GPU_DEPTH_FORMAT = 'depth32float' as const;
export const GPU_DEPTH_CLEAR = 0;

export function isGpuDepthMode(value: unknown): value is GpuDepthMode {
  return typeof value === 'string' && (GPU_DEPTH_MODES as readonly string[]).includes(value);
}
