export interface WebGpuDeviceInfo {
  adapter: GPUAdapter;
  device: GPUDevice;
  format: GPUTextureFormat;
  vendor: string;
  architecture: string;
  description: string;
  features: string[];
  limits: Record<string, number>;
}

export async function requestWebGpuDevice(options: GPURequestAdapterOptions = {}): Promise<WebGpuDeviceInfo> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is required: navigator.gpu is not available in this browser.');
  }
  const adapter = await navigator.gpu.requestAdapter(options);
  if (!adapter) {
    throw new Error('WebGPU is required: requestAdapter returned no adapter.');
  }
  const device = await adapter.requestDevice();
  const info = adapter.info ?? {};
  return {
    adapter,
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    vendor: info.vendor ?? 'unknown',
    architecture: info.architecture ?? 'unknown',
    description: info.description ?? '',
    features: Array.from(adapter.features).sort(),
    limits: Object.fromEntries(Object.entries(adapter.limits).filter(([, v]) => typeof v === 'number')) as Record<string, number>,
  };
}

export function webGpuFailureMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return `${msg} Enable WebGPU or use a browser/GPU combination that exposes navigator.gpu.`;
}

