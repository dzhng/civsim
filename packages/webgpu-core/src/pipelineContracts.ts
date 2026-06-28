import { WEBGPU_DEPTH_FORMAT, type WebGpuDepthMode } from './depthContract';

const WEBGPU_ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
};

// MSAA sample count for a pipeline. Every pipeline rendering into a shell must
// declare the shell's sampleCount or the render-pass attachment rejects it; 1
// is the no-MSAA default.
export function webGpuMultisample(sampleCount: number): GPUMultisampleState {
  return { count: Math.max(1, Math.floor(sampleCount)) };
}

export function webGpuOpaqueColorTarget(format: GPUTextureFormat): GPUColorTargetState {
  return { format };
}

export function webGpuAlphaBlendColorTarget(format: GPUTextureFormat): GPUColorTargetState {
  return { format, blend: WEBGPU_ALPHA_BLEND };
}

export function webGpuWorldDepthStencil(
  mode: Extract<WebGpuDepthMode, 'read' | 'read-write' | 'write'>,
  compare: GPUCompareFunction = mode === 'read' ? 'less-equal' : 'less',
): GPUDepthStencilState {
  return {
    format: WEBGPU_DEPTH_FORMAT,
    depthWriteEnabled: mode === 'write' || mode === 'read-write',
    depthCompare: compare,
  };
}
