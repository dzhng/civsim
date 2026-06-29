import { probeGpuCapabilities, type GpuCapabilityOptions } from '../../renderer-core/src/capabilities';

export interface GpuSupportState {
  checked: boolean;
  ok: boolean;
  adapter: string;
  reason: string;
  message: string;
}

export type GpuSupportOptions = GpuCapabilityOptions;

export async function checkGpuSupport(options: GpuSupportOptions = {}): Promise<GpuSupportState> {
  const capabilities = await probeGpuCapabilities(options);
  if (capabilities.ok) {
    return {
      checked: true,
      ok: true,
      adapter: capabilities.adapter,
      reason: '',
      message: `WebGPU ready: ${capabilities.adapter}`,
    };
  }
  return {
    checked: true,
    ok: false,
    adapter: '',
    reason: capabilities.reason,
    message: `${capabilities.reason} The WebGPU build requires a browser and GPU adapter that expose WebGPU.`,
  };
}
