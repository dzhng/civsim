export const WEBGPU_DEPTH_MODES = ['read', 'read-write', 'write'] as const;

export type WebGpuDepthMode = typeof WEBGPU_DEPTH_MODES[number];

export const WEBGPU_WORLD_DEPTH_ATTACHMENT = 'worldDepth' as const;
export const WEBGPU_DEPTH_FORMAT = 'depth24plus' as const;
export const WEBGPU_DEPTH_FORMAT_FALLBACK = 'depth32float' as const;

export type WebGpuDepthFormat = typeof WEBGPU_DEPTH_FORMAT | typeof WEBGPU_DEPTH_FORMAT_FALLBACK;

export interface DepthFormatChoice {
  format: WebGpuDepthFormat;
  downgrade: string | null;
}

// Single source for the depth-format downgrade decision. depth24plus is
// mandatory in WebGPU core, so the fallback only fires on a non-conformant
// adapter (or the capability probe's forced test path).
export function chooseDepthFormat(depth24plusAvailable: boolean): DepthFormatChoice {
  if (depth24plusAvailable) return { format: WEBGPU_DEPTH_FORMAT, downgrade: null };
  return {
    format: WEBGPU_DEPTH_FORMAT_FALLBACK,
    downgrade: `${WEBGPU_DEPTH_FORMAT} unavailable — using ${WEBGPU_DEPTH_FORMAT_FALLBACK}`,
  };
}

export function isWebGpuDepthMode(value: unknown): value is WebGpuDepthMode {
  return typeof value === 'string' && (WEBGPU_DEPTH_MODES as readonly string[]).includes(value);
}
