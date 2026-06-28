export interface WebGpuCapabilities {
  ok: boolean;
  adapter: string;
  format: string;
  reason: string;
}

import { chooseDepthFormat } from './depthContract';

export type WebGpuPowerPreference = 'high-performance' | 'low-power' | 'default';

// The single source of truth for what the granted device can do and every
// deliberate downgrade we make from it. Computed once at device creation from
// the adapter limits + granted device features; passes read it, they never
// re-probe the adapter.
export interface WebGpuDeviceCaps {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  msaaSampleCount: number;
  msaaSupported: boolean;
  timestampQuery: boolean;
  depthFormat: GPUTextureFormat;
  depthDowngrade: string | null;
  powerPreference: WebGpuPowerPreference;
}

// 4x is the sample count WebGPU core guarantees for every renderable format, so
// it is the one MSAA tier we rely on without a per-format query.
export const WEBGPU_MSAA_SAMPLE_COUNT = 4 as const;

export interface ResolveDeviceCapsInput {
  adapterLimits: Record<string, number>;
  deviceFeatures: Iterable<string>;
  powerPreference: WebGpuPowerPreference;
  /** Test hook: pretend depth24plus is unavailable to exercise the fallback. */
  forceNoDepth24?: boolean;
}

export function resolveDeviceCaps(input: ResolveDeviceCapsInput): WebGpuDeviceCaps {
  const features = new Set(input.deviceFeatures);
  const depth = chooseDepthFormat(!input.forceNoDepth24);
  if (depth.downgrade) console.warn(`WebGPU downgrade: ${depth.downgrade}`);
  return {
    maxStorageBufferBindingSize: input.adapterLimits.maxStorageBufferBindingSize ?? 0,
    maxBufferSize: input.adapterLimits.maxBufferSize ?? 0,
    msaaSampleCount: WEBGPU_MSAA_SAMPLE_COUNT,
    msaaSupported: true,
    timestampQuery: features.has('timestamp-query'),
    depthFormat: depth.format,
    depthDowngrade: depth.downgrade,
    powerPreference: input.powerPreference,
  };
}

/** Guard a storage-buffer allocation against the granted binding-size limit. */
export function assertStorageBufferFits(byteLength: number, caps: WebGpuDeviceCaps, label: string): void {
  if (byteLength > caps.maxStorageBufferBindingSize) {
    throw new Error(
      `${label} storage buffer is ${byteLength} bytes but the device grants only `
      + `${caps.maxStorageBufferBindingSize} (maxStorageBufferBindingSize). `
      + 'Reduce the bake size or split the buffer.',
    );
  }
}

export interface WebGpuCapabilityOptions {
  forceUnsupported?: boolean;
}

export async function probeWebGpuCapabilities(options: WebGpuCapabilityOptions = {}): Promise<WebGpuCapabilities> {
  try {
    if (options.forceUnsupported) {
      throw new Error('WebGPU support was disabled for this verification run.');
    }
    if (!navigator.gpu) {
      throw new Error('navigator.gpu is not available in this browser.');
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('requestAdapter returned no WebGPU adapter.');
    }
    const info = adapter.info ?? {};
    return {
      ok: true,
      adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(' / ') || 'available adapter',
      format: navigator.gpu.getPreferredCanvasFormat(),
      reason: '',
    };
  } catch (error) {
    return {
      ok: false,
      adapter: '',
      format: '',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
