export interface GpuCapabilities {
  ok: boolean;
  adapter: string;
  format: string;
  reason: string;
}

import { chooseDepthFormat } from './depthContract';

export type GpuPowerPreference = 'high-performance' | 'low-power' | 'default';

// The single source of truth for what the granted device can do and every
// deliberate downgrade we make from it. Computed once at device creation from
// the adapter limits + granted device features; passes read it, they never
// re-probe the adapter.
export interface GpuDeviceCaps {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  msaaSampleCount: number;
  msaaSupported: boolean;
  timestampQuery: boolean;
  /** Can this device run the compute-IFFT ocean field? (Compute workgroup
   *  headroom + storage-buffer headroom for the spectrum bake.) When false the
   *  water factory degrades the IFFT route to the analytic Gerstner fallback. */
  computeOceanSupported: boolean;
  depthFormat: GPUTextureFormat;
  depthDowngrade: string | null;
  powerPreference: GpuPowerPreference;
}

// 4x is the sample count WebGPU core guarantees for every renderable format, so
// it is the one MSAA tier we rely on without a per-format query.
export const GPU_MSAA_SAMPLE_COUNT = 4 as const;

// The storage-buffer headroom the IFFT ocean's spectrum bake needs to be worth
// running; any real adapter clears this by orders of magnitude, so the probe is
// really a "is this a capable compute device" gate plus the per-allocation
// assertStorageBufferFits guard at bake time. Sized to the default 256² bake.
export const COMPUTE_OCEAN_MIN_STORAGE_BYTES = 1 << 22; // 4 MiB
// One workgroup must fit a 16×16 ocean tile (256 invocations).
export const COMPUTE_OCEAN_MIN_WORKGROUP_INVOCATIONS = 256;

export interface ResolveDeviceCapsInput {
  adapterLimits: Record<string, number>;
  deviceFeatures: Iterable<string>;
  powerPreference: GpuPowerPreference;
  /** Test hook: pretend depth24plus is unavailable to exercise the fallback. */
  forceNoDepth24?: boolean;
  /** Test hook: pretend the compute-IFFT ocean is unsupported to exercise the
   *  Gerstner fallback path, mirroring forceNoDepth24/forceUnsupported. */
  forceNoComputeOcean?: boolean;
}

export function resolveDeviceCaps(input: ResolveDeviceCapsInput): GpuDeviceCaps {
  const features = new Set(input.deviceFeatures);
  const depth = chooseDepthFormat(!input.forceNoDepth24);
  if (depth.downgrade) console.warn(`WebGPU downgrade: ${depth.downgrade}`);
  const maxStorageBufferBindingSize = input.adapterLimits.maxStorageBufferBindingSize ?? 0;
  const maxComputeInvocations = input.adapterLimits.maxComputeInvocationsPerWorkgroup ?? 0;
  const computeOceanSupported = !input.forceNoComputeOcean
    && maxStorageBufferBindingSize >= COMPUTE_OCEAN_MIN_STORAGE_BYTES
    && maxComputeInvocations >= COMPUTE_OCEAN_MIN_WORKGROUP_INVOCATIONS;
  return {
    maxStorageBufferBindingSize,
    maxBufferSize: input.adapterLimits.maxBufferSize ?? 0,
    msaaSampleCount: GPU_MSAA_SAMPLE_COUNT,
    msaaSupported: true,
    timestampQuery: features.has('timestamp-query'),
    computeOceanSupported,
    depthFormat: depth.format,
    depthDowngrade: depth.downgrade,
    powerPreference: input.powerPreference,
  };
}

/** Guard a storage-buffer allocation against the granted binding-size limit. */
export function assertStorageBufferFits(byteLength: number, caps: GpuDeviceCaps, label: string): void {
  if (byteLength > caps.maxStorageBufferBindingSize) {
    throw new Error(
      `${label} storage buffer is ${byteLength} bytes but the device grants only `
      + `${caps.maxStorageBufferBindingSize} (maxStorageBufferBindingSize). `
      + 'Reduce the bake size or split the buffer.',
    );
  }
}

export interface GpuCapabilityOptions {
  forceUnsupported?: boolean;
}

export async function probeGpuCapabilities(options: GpuCapabilityOptions = {}): Promise<GpuCapabilities> {
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
