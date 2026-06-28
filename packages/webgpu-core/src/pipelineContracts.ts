import { WEBGPU_DEPTH_FORMAT, type WebGpuDepthMode } from './depthContract';

const WEBGPU_ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
};

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
