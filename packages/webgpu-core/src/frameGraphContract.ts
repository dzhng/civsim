import type { WebGpuDepthMode } from './depthContract';

export const FRAME_PHASE_KINDS = ['background', 'world-depth', 'overlay'] as const;

export type FramePhaseKind = typeof FRAME_PHASE_KINDS[number];

export const FRAME_GRAPH_PASS_ROLES = [
  'background-underpaint',
  'world-depth-fill',
  'world-opaque',
  'world-decal',
  'overlay-ui',
  'overlay-effect',
  'overlay-debug',
] as const;

export type FrameGraphPassRole = typeof FRAME_GRAPH_PASS_ROLES[number];

export const FRAME_GRAPH_ROLE_PHASES = {
  'background-underpaint': 'background',
  'world-depth-fill': 'world-depth',
  'world-opaque': 'world-depth',
  'world-decal': 'world-depth',
  'overlay-ui': 'overlay',
  'overlay-effect': 'overlay',
  'overlay-debug': 'overlay',
} as const satisfies Record<FrameGraphPassRole, FramePhaseKind>;

export const FRAME_GRAPH_DEPTH_ROLES = {
  write: 'world-depth-fill',
  'read-write': 'world-opaque',
  read: 'world-decal',
} as const satisfies Record<WebGpuDepthMode, Extract<FrameGraphPassRole, 'world-depth-fill' | 'world-opaque' | 'world-decal'>>;

export function isFramePhaseKind(value: unknown): value is FramePhaseKind {
  return FRAME_PHASE_KINDS.includes(value as FramePhaseKind);
}

export function frameGraphPhaseOrder(phase: FramePhaseKind): number {
  switch (phase) {
    case 'background': return 0;
    case 'world-depth': return 1;
    case 'overlay': return 2;
  }
}

export function isFrameGraphPassRole(value: unknown): value is FrameGraphPassRole {
  return FRAME_GRAPH_PASS_ROLES.includes(value as FrameGraphPassRole);
}

export function frameGraphRolePhase(role: FrameGraphPassRole): FramePhaseKind {
  return FRAME_GRAPH_ROLE_PHASES[role];
}

export function frameGraphDepthRole(depth: WebGpuDepthMode): Extract<FrameGraphPassRole, 'world-depth-fill' | 'world-opaque' | 'world-decal'> {
  return FRAME_GRAPH_DEPTH_ROLES[depth];
}
