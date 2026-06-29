import { GPU_DEPTH_FORMAT, GPU_WORLD_DEPTH_ATTACHMENT, isGpuDepthMode, type GpuDepthMode } from '../../renderer-core/src/depthContract';
import {
  frameGraphDepthRole,
  frameGraphPhaseOrder,
  frameGraphRolePhase,
  isFrameGraphPassRole,
  isTopLevelTypeBucketPass,
  type FrameGraphBatching,
  type FrameGraphPassRole,
} from '../../renderer-core/src/frameGraphContract';

export type RenderGraphPhase = 'frame' | 'battle' | 'campaign' | 'ui' | 'post';
export type RenderGraphFramePhase = 'background' | 'world-depth' | 'overlay';

export interface RenderGraphPass {
  id: string;
  label: string;
  phase: RenderGraphPhase;
  framePhase?: RenderGraphFramePhase;
  role?: FrameGraphPassRole;
  batching?: FrameGraphBatching;
  reads?: string[];
  writes?: string[];
  depth?: {
    attachment: string;
    mode: GpuDepthMode;
    format: typeof GPU_DEPTH_FORMAT;
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
    batching: { strategy: 'domain-pass', buckets: ['terrain', 'water', 'sky', 'haze'] },
    reads: ['cameraUniforms', 'frameConstants'],
    writes: ['worldColor'],
  },
  {
    id: 'campaignMapUnderpaint',
    label: 'Campaign map texture, territory wash, water, borders, and underpaint',
    phase: 'campaign',
    framePhase: 'background',
    role: 'background-underpaint',
    batching: { strategy: 'domain-pass', buckets: ['map-texture', 'territory', 'water', 'borders'] },
    reads: ['cameraUniforms', 'frameConstants', 'campaignState'],
    writes: ['worldColor'],
  },
  {
    id: 'worldDepthClear',
    label: 'World depth attachment clear boundary',
    phase: 'frame',
    framePhase: 'world-depth',
    role: 'world-depth-fill',
    writes: [GPU_WORLD_DEPTH_ATTACHMENT],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'write', format: GPU_DEPTH_FORMAT, compare: 'less', store: 'discard' },
  },
  {
    id: 'battleTerrainProps',
    label: 'Battle trees, rocks, shrubs, and terrain props',
    phase: 'battle',
    framePhase: 'world-depth',
    role: 'world-opaque',
    batching: { strategy: 'instance-kind', buckets: ['trees', 'rocks', 'shrubs'] },
    reads: ['cameraUniforms', 'battleState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'battleCrowd',
    label: 'Skinned battle crowd',
    phase: 'battle',
    framePhase: 'world-depth',
    role: 'world-opaque',
    batching: { strategy: 'mesh-variant', buckets: ['class-meshes', 'lods'] },
    reads: ['cameraUniforms', GPU_WORLD_DEPTH_ATTACHMENT, 'soldierVat', 'crowdInstances'],
    writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT, 'pickIds'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignSceneryOpaque',
    label: 'Campaign trees, rocks, mountains, and terrain prop opaque meshes',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-opaque',
    batching: { strategy: 'instance-kind', buckets: ['trees', 'rocks', 'mountains'] },
    reads: ['cameraUniforms', 'campaignState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignEntitiesOpaque',
    label: 'Campaign city, army, standard, and garrison opaque meshes',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-opaque',
    batching: { strategy: 'mesh-variant', buckets: ['cities', 'armies', 'standards', 'garrisons'] },
    reads: ['cameraUniforms', 'campaignState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor', GPU_WORLD_DEPTH_ATTACHMENT, 'pickIds'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read-write', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'battleGroundCues',
    label: 'Battle selection rings, reform paths, and ground cues',
    phase: 'battle',
    framePhase: 'world-depth',
    role: 'world-decal',
    reads: ['cameraUniforms', 'battleState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignSceneryShadows',
    label: 'Campaign terrain prop contact shadows',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-decal',
    reads: ['cameraUniforms', 'campaignState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignEntityShadows',
    label: 'Campaign city and army contact shadows',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-decal',
    reads: ['cameraUniforms', 'campaignState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignRoads',
    label: 'Campaign raised road and corridor meshes',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-decal',
    reads: ['cameraUniforms', 'campaignState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignSeaLanes',
    label: 'Campaign sea-lane world-depth guide lines',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-decal',
    reads: ['cameraUniforms', 'campaignState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignGroundSelection',
    label: 'Campaign selected-city and selected-army ground decals',
    phase: 'campaign',
    framePhase: 'world-depth',
    role: 'world-decal',
    reads: ['cameraUniforms', 'campaignState', GPU_WORLD_DEPTH_ATTACHMENT],
    writes: ['worldColor'],
    depth: { attachment: GPU_WORLD_DEPTH_ATTACHMENT, mode: 'read', format: GPU_DEPTH_FORMAT, compare: 'less-equal', store: 'store' },
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
    id: 'battleEffectLines',
    label: 'Battle projectiles, order-progress effects, and transient lines',
    phase: 'battle',
    framePhase: 'overlay',
    role: 'overlay-effect',
    reads: ['cameraUniforms', 'compositedColor'],
    writes: ['compositedColor'],
  },
  {
    id: 'battleDebugOverlays',
    label: 'Battle debug blocks, triangles, and non-depth diagnostics',
    phase: 'battle',
    framePhase: 'overlay',
    role: 'overlay-debug',
    reads: ['cameraUniforms', 'compositedColor'],
    writes: ['compositedColor'],
  },
  {
    id: 'campaignMarkers',
    label: 'Campaign overview markers and screen-size pins',
    phase: 'ui',
    framePhase: 'overlay',
    role: 'overlay-ui',
    reads: ['cameraUniforms', 'compositedColor', 'campaignState'],
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
  let readOnlyWorldDepthStarted = false;

  for (const pass of passes) {
    if (seenPasses.has(pass.id)) {
      diagnostics.push(`duplicate pass id "${pass.id}"`);
    }
    seenPasses.add(pass.id);

    if (isTopLevelTypeBucketPass(pass.id)) {
      diagnostics.push(`pass "${pass.id}" is a type bucket, not a semantic render-graph pass`);
    }
    if (/\bbucket\b/i.test(pass.label)) {
      diagnostics.push(`pass "${pass.id}" label describes a bucket; use batching metadata under a semantic pass instead`);
    }
    if (pass.batching && (!pass.framePhase || !isFrameGraphPassRole(pass.role))) {
      diagnostics.push(`pass "${pass.id}" batching metadata must live under a semantic frame-phase role`);
    }
    for (const bucket of pass.batching?.buckets ?? []) {
      if (!bucket.trim()) {
        diagnostics.push(`pass "${pass.id}" declares an empty batching bucket`);
      }
    }

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

      const touchesDepth = (pass.reads?.includes(GPU_WORLD_DEPTH_ATTACHMENT) ?? false) || (pass.writes?.includes(GPU_WORLD_DEPTH_ATTACHMENT) ?? false);
      if (pass.framePhase === 'world-depth' && !pass.depth) {
        diagnostics.push(`world-depth pass "${pass.id}" must declare a depth attachment contract`);
      }
      if (pass.framePhase !== 'world-depth' && touchesDepth) {
        diagnostics.push(`non-world-depth pass "${pass.id}" must not touch ${GPU_WORLD_DEPTH_ATTACHMENT}`);
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
      if (!isGpuDepthMode(pass.depth.mode)) {
        diagnostics.push(`pass "${pass.id}" declares unsupported depth mode "${String(pass.depth.mode)}"`);
      }
      if (pass.depth.attachment !== GPU_WORLD_DEPTH_ATTACHMENT) {
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
      if (isGpuDepthMode(pass.depth.mode) && isFrameGraphPassRole(pass.role)) {
        const depthRole = frameGraphDepthRole(pass.depth.mode);
        if (pass.role !== depthRole) {
          diagnostics.push(`world-depth pass "${pass.id}" depth mode "${pass.depth.mode}" requires role "${depthRole}", not "${pass.role}"`);
        }
      }
      if (pass.framePhase === 'world-depth') {
        if (readOnlyWorldDepthStarted && pass.depth.mode !== 'read') {
          diagnostics.push(`world-depth pass "${pass.id}" writes depth after read-only world decals have started`);
        }
        if (pass.depth.mode === 'read') readOnlyWorldDepthStarted = true;
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
  return id === 'soldierVat' || id === 'crowdInstances' || id === 'campaignState' || id === 'battleState';
}
