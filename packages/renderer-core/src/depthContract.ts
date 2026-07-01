export const GPU_DEPTH_MODES = ['read', 'read-write', 'write'] as const;

export type GpuDepthMode = typeof GPU_DEPTH_MODES[number];

export const GPU_WORLD_DEPTH_ATTACHMENT = 'worldDepth' as const;
export const GPU_DEPTH_FORMAT = 'depth24plus' as const;
export const GPU_DEPTH_FORMAT_FALLBACK = 'depth32float' as const;

// Reverse-Z depth: near → 1, far → 0, so 32-bit float depth spends its precision
// where it matters (the far plane is exactly 0). The precision-optimal convention,
// opt-in per shell (frameShell `reverseZ`) — the water route adopts it in slice 02;
// battle/campaign stay on the legacy painter path until the seam flip (04/05).
export const GPU_DEPTH_FORMAT_REVERSE = 'depth32float' as const;

// Depth-buffer clear per Z direction: legacy painter/real-Z clears far = 1;
// reverse-Z clears far = 0.
export const GPU_DEPTH_CLEAR = 1;
export const GPU_REVERSE_Z_DEPTH_CLEAR = 0;

export type GpuDepthFormat = typeof GPU_DEPTH_FORMAT | typeof GPU_DEPTH_FORMAT_FALLBACK;

export interface DepthFormatChoice {
  format: GpuDepthFormat;
  downgrade: string | null;
}

// Single source for the depth-format downgrade decision. depth24plus is
// mandatory in WebGPU core, so the fallback only fires on a non-conformant
// adapter (or the capability probe's forced test path).
export function chooseDepthFormat(depth24plusAvailable: boolean): DepthFormatChoice {
  if (depth24plusAvailable) return { format: GPU_DEPTH_FORMAT, downgrade: null };
  return {
    format: GPU_DEPTH_FORMAT_FALLBACK,
    downgrade: `${GPU_DEPTH_FORMAT} unavailable — using ${GPU_DEPTH_FORMAT_FALLBACK}`,
  };
}

export function isGpuDepthMode(value: unknown): value is GpuDepthMode {
  return typeof value === 'string' && (GPU_DEPTH_MODES as readonly string[]).includes(value);
}
