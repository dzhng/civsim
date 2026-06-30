import { GPU_DEPTH_FORMAT, type GpuDepthMode } from './depthContract';

const GPU_ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
};

// MSAA sample count for a pipeline. Every pipeline rendering into a shell must
// declare the shell's sampleCount or the render-pass attachment rejects it; 1
// is the no-MSAA default.
export function gpuMultisample(sampleCount: number): GPUMultisampleState {
  return { count: Math.max(1, Math.floor(sampleCount)) };
}

export function gpuOpaqueColorTarget(format: GPUTextureFormat): GPUColorTargetState {
  return { format };
}

export function gpuAlphaBlendColorTarget(format: GPUTextureFormat): GPUColorTargetState {
  return { format, blend: GPU_ALPHA_BLEND };
}

export function gpuWorldDepthStencil(
  mode: Extract<GpuDepthMode, 'read' | 'read-write' | 'write'>,
  compare: GPUCompareFunction = mode === 'read' ? 'less-equal' : 'less',
): GPUDepthStencilState {
  return {
    format: GPU_DEPTH_FORMAT,
    depthWriteEnabled: mode === 'write' || mode === 'read-write',
    depthCompare: compare,
  };
}
