export const WEBGPU_DEPTH_MODES = ['read', 'read-write', 'write'] as const;

export type WebGpuDepthMode = typeof WEBGPU_DEPTH_MODES[number];

export const WEBGPU_WORLD_DEPTH_ATTACHMENT = 'worldDepth' as const;
export const WEBGPU_DEPTH_FORMAT = 'depth24plus' as const;

export function isWebGpuDepthMode(value: unknown): value is WebGpuDepthMode {
  return typeof value === 'string' && (WEBGPU_DEPTH_MODES as readonly string[]).includes(value);
}
