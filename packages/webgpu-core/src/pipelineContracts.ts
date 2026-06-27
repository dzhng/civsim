import { WEBGPU_DEPTH_FORMAT } from './depthContract';

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

export function webGpuWorldDepthStencil(write: boolean, compare: GPUCompareFunction = write ? 'less' : 'less-equal'): GPUDepthStencilState {
  return {
    format: WEBGPU_DEPTH_FORMAT,
    depthWriteEnabled: write,
    depthCompare: compare,
  };
}
