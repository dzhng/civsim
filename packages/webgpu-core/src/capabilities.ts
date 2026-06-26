export interface WebGpuCapabilities {
  ok: boolean;
  adapter: string;
  format: string;
  reason: string;
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
