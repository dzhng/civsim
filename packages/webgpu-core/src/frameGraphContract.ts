import type { WebGpuDepthMode } from './depthContract';

export type FramePhaseKind = 'background' | 'world-depth' | 'overlay';

export type FrameGraphPassRole =
  | 'background-underpaint'
  | 'world-depth-fill'
  | 'world-opaque'
  | 'world-decal'
  | 'overlay-ui'
  | 'overlay-effect'
  | 'overlay-debug';

export function isFramePhaseKind(value: unknown): value is FramePhaseKind {
  return value === 'background' || value === 'world-depth' || value === 'overlay';
}

export function frameGraphPhaseOrder(phase: FramePhaseKind): number {
  switch (phase) {
    case 'background': return 0;
    case 'world-depth': return 1;
    case 'overlay': return 2;
  }
}

export function isFrameGraphPassRole(value: unknown): value is FrameGraphPassRole {
  return value === 'background-underpaint'
    || value === 'world-depth-fill'
    || value === 'world-opaque'
    || value === 'world-decal'
    || value === 'overlay-ui'
    || value === 'overlay-effect'
    || value === 'overlay-debug';
}

export function frameGraphRolePhase(role: FrameGraphPassRole): FramePhaseKind {
  switch (role) {
    case 'background-underpaint': return 'background';
    case 'world-depth-fill':
    case 'world-opaque':
    case 'world-decal': return 'world-depth';
    case 'overlay-ui':
    case 'overlay-effect':
    case 'overlay-debug': return 'overlay';
  }
}

export function frameGraphDepthRole(depth: WebGpuDepthMode): Extract<FrameGraphPassRole, 'world-depth-fill' | 'world-opaque' | 'world-decal'> {
  switch (depth) {
    case 'write': return 'world-depth-fill';
    case 'read-write': return 'world-opaque';
    case 'read': return 'world-decal';
  }
}
