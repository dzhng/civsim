import { probeWebGpuCapabilities, type WebGpuCapabilityOptions } from '../../webgpu-core/src/capabilities';

export interface WebGpuSupportState {
  checked: boolean;
  ok: boolean;
  adapter: string;
  reason: string;
  message: string;
}

export type WebGpuSupportOptions = WebGpuCapabilityOptions;

export async function checkWebGpuSupport(options: WebGpuSupportOptions = {}): Promise<WebGpuSupportState> {
  const capabilities = await probeWebGpuCapabilities(options);
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
