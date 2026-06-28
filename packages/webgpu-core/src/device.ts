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

export interface DeviceLostReport {
  reason: 'destroyed' | 'unknown';
  message: string;
}

export interface UncapturedErrorReport {
  message: string;
}

export interface WebGpuDeviceCallbacks {
  /** Fires when the GPU device is lost (driver reset, eviction, or destroy()). */
  onDeviceLost?: (report: DeviceLostReport) => void;
  /** Fires on an uncaptured validation/out-of-memory error the renderer did not guard. */
  onUncapturedError?: (report: UncapturedErrorReport) => void;
}

export interface RequestWebGpuDeviceOptions extends GPURequestAdapterOptions {
  callbacks?: WebGpuDeviceCallbacks;
}

export async function requestWebGpuDevice(options: RequestWebGpuDeviceOptions = {}): Promise<WebGpuDeviceInfo> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is required: navigator.gpu is not available in this browser.');
  }
  const { callbacks, ...adapterOptions } = options;
  let adapter: GPUAdapter | null;
  try {
    adapter = await navigator.gpu.requestAdapter(adapterOptions);
  } catch (error) {
    throw new Error(`WebGPU adapter request failed: ${messageOf(error)}`);
  }
  if (!adapter) {
    throw new Error('WebGPU is required: requestAdapter returned no adapter.');
  }
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (error) {
    throw new Error(`WebGPU device request failed: ${messageOf(error)}`);
  }
  attachDeviceErrorHandlers(device, callbacks);
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

/** Wire `device.lost` and `onuncapturederror` so no GPU fault is silent. */
export function attachDeviceErrorHandlers(device: GPUDevice, callbacks?: WebGpuDeviceCallbacks): void {
  const lost = (device as { lost?: Promise<GPUDeviceLostInfo> }).lost;
  if (lost && typeof lost.then === 'function') {
    void lost.then((info) => {
      const report: DeviceLostReport = { reason: info.reason ?? 'unknown', message: info.message ?? '' };
      console.error(`WebGPU device lost (${report.reason}): ${report.message}`);
      callbacks?.onDeviceLost?.(report);
    });
  }
  const errorCapable = device as { onuncapturederror?: ((event: GPUUncapturedErrorEvent) => void) | null };
  if ('onuncapturederror' in errorCapable) {
    errorCapable.onuncapturederror = (event) => {
      const report: UncapturedErrorReport = { message: event.error?.message ?? 'unknown WebGPU error' };
      console.error(`WebGPU uncaptured error: ${report.message}`);
      callbacks?.onUncapturedError?.(report);
    };
  }
}

export function webGpuFailureMessage(error: unknown): string {
  const msg = messageOf(error);
  return `${msg} Enable WebGPU or use a browser/GPU combination that exposes navigator.gpu.`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
