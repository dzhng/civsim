import { WEBGPU_DEPTH_FORMAT, WEBGPU_WORLD_DEPTH_ATTACHMENT, isWebGpuDepthMode, type WebGpuDepthMode } from '../../webgpu-core/src/depthContract';
import {
  frameGraphDepthRole,
  frameGraphPhaseOrder,
  frameGraphRolePhase,
  isFrameGraphPassRole,
  type FrameGraphPassRole,
} from '../../webgpu-core/src/frameGraphContract';

export type RenderGraphPhase = 'frame' | 'battle' | 'campaign' | 'ui' | 'post';
export type RenderGraphFramePhase = 'background' | 'world-depth' | 'overlay';

export interface RenderGraphPass {
  id: string;
  label: string;
  phase: RenderGraphPhase;
  framePhase?: RenderGraphFramePhase;
  role?: FrameGraphPassRole;
  reads?: string[];
  writes?: string[];
  depth?: {
    attachment: string;
    mode: WebGpuDepthMode;
    format: typeof WEBGPU_DEPTH_FORMAT;
    compare?: 'less' | 'less-equal' | 'always';
    store?: 'discard' | 'store';
  };
}

export interface RenderGraphResource {
  id: string;
  firstWriter: string | null;
  readers: string[];
  lastUsePass: string | null;
}

export interface RenderGraphReport {
  ok: boolean;
  passes: RenderGraphPass[];
  resources: RenderGraphResource[];
  diagnostics: string[];
}

export const FULL_GAME_GRAPH_SKELETON: RenderGraphPass[] = [
  {
    id: 'camera',
    label: 'Camera and frame uniforms',
    phase: 'frame',
    writes: ['cameraUniforms', 'frameConstants'],
  },
  {
    id: 'battleTerrain',
    label: 'Battle terrain, water, sky, haze, and underpaint',
    phase: 'battle',
    framePhase: 'background',
    role: 'background-underpaint',
    reads: ['cameraUniforms', 'frameConstants'],
    writes: ['worldColor'],
  },
  {
    id: 'campaignMapUnderpaint',
    label: 'Campaign map texture, territory wash, water, borders, and underpaint',
    phase: 'campaign',
    framePhase: 'background',
    role: 'background-underpaint',
    reads: ['cameraUniforms', 'frameConstants', 'campaignState'],
    writes: ['worldColor'],
  },
  {
    id: 'worldDepthClear',
    label: 'World depth attachment clear boundary',
    phase: 'frame',
    framePhase: 'world-depth',
    role: 'world-depth-fill',
    writes: [WEBGPU_WORLD_DEPTH_ATTACHMENT],
    depth: { attachment: WEBGPU_WORLD_DEPTH_ATTACHMENT, mode: 'write', format: WEBGPU_DEPTH_FORMAT, compare: 'less', store: 'discard' },
  },
  {
    id: 'battleCrowd',
    label: 'Skinned battle crowd',
    phase: 'battle',
    framePhase: 'world-depth',
    role: 'world-opaque',
    reads: ['cameraUniforms', WEBGPU_WORLD_DEPTH_ATTACHMENT, 'soldierVat', 'crowdInstances'],
    writes: ['worldColor', WEBGPU_WORLD_DEPTH_ATTACHMENT, 'pickIds'],
    depth: { attachment: WEBGPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: WEBGPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignGroundDecals',
    label: 'Campaign roads and ground selection decals',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-decal',
    reads: ['cameraUniforms', 'campaignState', WEBGPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor'],
    depth: { attachment: WEBGPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: WEBGPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignOpaque3d',
    label: 'Campaign city, army, scenery, standards, and garrison meshes',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-opaque',
    reads: ['cameraUniforms', 'campaignState', WEBGPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor', WEBGPU_WORLD_DEPTH_ATTACHMENT, 'pickIds'],
    depth: { attachment: WEBGPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: WEBGPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'atmosphereOverlays',
    label: 'Transparent atmosphere and non-depth visual overlays',
    phase: 'ui',
    framePhase: 'overlay',
    role: 'overlay-effect',
    reads: ['cameraUniforms', 'worldColor'],
    writes: ['compositedColor'],
  },
  {
    id: 'labelsAndHudAnchors',
    label: 'Labels, HUD anchors, and non-depth UI overlays',
    phase: 'ui',
    framePhase: 'overlay',
    role: 'overlay-ui',
    reads: ['cameraUniforms', 'compositedColor', 'pickIds'],
    writes: ['compositedColor'],
  },
  {
    id: 'gameUi',
    label: 'Game anchored UI and compositor',
    phase: 'ui',
    framePhase: 'overlay',
    role: 'overlay-ui',
    reads: ['cameraUniforms', 'compositedColor', 'pickIds'],
    writes: ['compositedColor'],
  },
  {
    id: 'present',
    label: 'Present and screenshot readback boundary',
    phase: 'post',
    reads: ['compositedColor'],
    writes: ['swapchain'],
  },
];

export function compileRenderGraph(passes: readonly RenderGraphPass[]): RenderGraphReport {
  const diagnostics: string[] = [];
  const seenPasses = new Set<string>();
  const resources = new Map<string, RenderGraphResource>();
  let lastFramePhaseOrder = -1;

  for (const pass of passes) {
    if (seenPasses.has(pass.id)) {
      diagnostics.push(`duplicate pass id "${pass.id}"`);
    }
    seenPasses.add(pass.id);

    for (const read of pass.reads ?? []) {
      const resource = ensureResource(resources, read);
      if (!resource.firstWriter && !isExternalResource(read)) {
        diagnostics.push(`pass "${pass.id}" reads "${read}" before any graph pass writes it`);
      }
      resource.readers.push(pass.id);
      resource.lastUsePass = pass.id;
    }

    for (const write of pass.writes ?? []) {
      const resource = ensureResource(resources, write);
      if (!resource.firstWriter) resource.firstWriter = pass.id;
      resource.lastUsePass = pass.id;
    }

    if (pass.framePhase) {
      const order = framePhaseOrder(pass.framePhase);
      if (order < lastFramePhaseOrder) {
        diagnostics.push(`pass "${pass.id}" moves frame phase order backward to "${pass.framePhase}"`);
      }
      lastFramePhaseOrder = Math.max(lastFramePhaseOrder, order);

      const touchesDepth = (pass.reads?.includes(WEBGPU_WORLD_DEPTH_ATTACHMENT) ?? false) || (pass.writes?.includes(WEBGPU_WORLD_DEPTH_ATTACHMENT) ?? false);
      if (pass.framePhase === 'world-depth' && !pass.depth) {
        diagnostics.push(`world-depth pass "${pass.id}" must declare a depth attachment contract`);
      }
      if (pass.framePhase !== 'world-depth' && touchesDepth) {
        diagnostics.push(`non-world-depth pass "${pass.id}" must not touch ${WEBGPU_WORLD_DEPTH_ATTACHMENT}`);
      }
      if (!isFrameGraphPassRole(pass.role)) {
        diagnostics.push(`frame-phase pass "${pass.id}" must declare a semantic role`);
      } else {
        const rolePhase = frameGraphRolePhase(pass.role);
        if (rolePhase !== pass.framePhase) {
          diagnostics.push(`frame-phase pass "${pass.id}" role "${pass.role}" is incompatible with frame phase "${pass.framePhase}"`);
        }
      }
    } else if (pass.role) {
      diagnostics.push(`non-frame pass "${pass.id}" must not declare semantic role "${pass.role}"`);
    }

    if (pass.depth && pass.framePhase !== 'world-depth') {
      diagnostics.push(`pass "${pass.id}" declares depth outside the world-depth frame phase`);
    }

    if (pass.depth) {
      if (!isWebGpuDepthMode(pass.depth.mode)) {
        diagnostics.push(`pass "${pass.id}" declares unsupported depth mode "${String(pass.depth.mode)}"`);
      }
      if (pass.depth.attachment !== WEBGPU_WORLD_DEPTH_ATTACHMENT) {
        diagnostics.push(`pass "${pass.id}" declares unsupported depth attachment "${pass.depth.attachment}"`);
      }
      const readsDepth = pass.reads?.includes(pass.depth.attachment) ?? false;
      const writesDepth = pass.writes?.includes(pass.depth.attachment) ?? false;
      if ((pass.depth.mode === 'read' || pass.depth.mode === 'read-write') && !readsDepth) {
        diagnostics.push(`pass "${pass.id}" declares depth ${pass.depth.mode} but does not read "${pass.depth.attachment}"`);
      }
      if ((pass.depth.mode === 'write' || pass.depth.mode === 'read-write') && !writesDepth) {
        diagnostics.push(`pass "${pass.id}" declares depth ${pass.depth.mode} but does not write "${pass.depth.attachment}"`);
      }
      if (pass.depth.mode === 'read' && writesDepth) {
        diagnostics.push(`pass "${pass.id}" declares read-only depth but writes "${pass.depth.attachment}"`);
      }
      if (pass.depth.mode === 'write' && readsDepth) {
        diagnostics.push(`pass "${pass.id}" declares write-only depth but reads "${pass.depth.attachment}"`);
      }
      if (isWebGpuDepthMode(pass.depth.mode) && isFrameGraphPassRole(pass.role)) {
        const depthRole = frameGraphDepthRole(pass.depth.mode);
        if (pass.role !== depthRole) {
          diagnostics.push(`world-depth pass "${pass.id}" depth mode "${pass.depth.mode}" requires role "${depthRole}", not "${pass.role}"`);
        }
      }
    }
  }

  return {
    ok: diagnostics.length === 0,
    passes: passes.map((pass) => ({
      ...pass,
      reads: [...(pass.reads ?? [])],
      writes: [...(pass.writes ?? [])],
    })),
    resources: Array.from(resources.values()).sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics,
  };
}

function framePhaseOrder(phase: RenderGraphFramePhase): number {
  return frameGraphPhaseOrder(phase);
}

export function fullGameRenderGraphReport(): RenderGraphReport {
  return compileRenderGraph(FULL_GAME_GRAPH_SKELETON);
}

function ensureResource(resources: Map<string, RenderGraphResource>, id: string): RenderGraphResource {
  let resource = resources.get(id);
  if (!resource) {
    resource = { id, firstWriter: null, readers: [], lastUsePass: null };
    resources.set(id, resource);
  }
  return resource;
}

function isExternalResource(id: string): boolean {
  return id === 'soldierVat' || id === 'crowdInstances' || id === 'campaignState';
}
