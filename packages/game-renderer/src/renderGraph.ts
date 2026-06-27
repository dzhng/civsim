export type RenderGraphPhase = 'frame' | 'battle' | 'campaign' | 'ui' | 'post';
export type RenderGraphFramePhase = 'background' | 'world-depth' | 'overlay';

export interface RenderGraphPass {
  id: string;
  label: string;
  phase: RenderGraphPhase;
  framePhase?: RenderGraphFramePhase;
  reads?: string[];
  writes?: string[];
  depth?: {
    attachment: string;
    mode: 'read' | 'write' | 'read-write';
    format: 'depth24plus';
    compare?: 'less' | 'less-equal' | 'always';
    store?: 'discard' | 'store';
  };
  overlay?: boolean;
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
    reads: ['cameraUniforms', 'frameConstants'],
    writes: ['worldColor'],
  },
  {
    id: 'campaignMapUnderpaint',
    label: 'Campaign map texture, territory wash, water, borders, and underpaint',
    phase: 'campaign',
    framePhase: 'background',
    reads: ['cameraUniforms', 'frameConstants', 'campaignState'],
    writes: ['worldColor'],
  },
  {
    id: 'worldDepthClear',
    label: 'World depth attachment clear boundary',
    phase: 'frame',
    framePhase: 'world-depth',
    writes: ['worldDepth'],
    depth: { attachment: 'worldDepth', mode: 'write', format: 'depth24plus', compare: 'less', store: 'discard' },
  },
  {
    id: 'battleCrowd',
    label: 'Skinned battle crowd',
    phase: 'battle',
    framePhase: 'world-depth',
    reads: ['cameraUniforms', 'worldDepth', 'soldierVat', 'crowdInstances'],
    writes: ['worldColor', 'worldDepth', 'pickIds'],
    depth: { attachment: 'worldDepth', mode: 'read-write', format: 'depth24plus', compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignGroundDecals',
    label: 'Campaign roads and ground selection decals',
    phase: 'campaign',
    framePhase: 'world-depth',
    reads: ['cameraUniforms', 'campaignState', 'worldDepth'],
    writes: ['worldColor'],
    depth: { attachment: 'worldDepth', mode: 'read', format: 'depth24plus', compare: 'less-equal', store: 'store' },
  },
  {
    id: 'campaignOpaque3d',
    label: 'Campaign city, army, scenery, standards, and garrison meshes',
    phase: 'campaign',
    framePhase: 'world-depth',
    reads: ['cameraUniforms', 'campaignState', 'worldDepth'],
    writes: ['worldColor', 'worldDepth', 'pickIds'],
    depth: { attachment: 'worldDepth', mode: 'read-write', format: 'depth24plus', compare: 'less-equal', store: 'store' },
  },
  {
    id: 'labelsAndAtmosphere',
    label: 'Transparent atmosphere, labels, HUD anchors, and non-depth overlays',
    phase: 'ui',
    framePhase: 'overlay',
    reads: ['cameraUniforms', 'worldColor', 'pickIds'],
    writes: ['compositedColor'],
    overlay: true,
  },
  {
    id: 'gameUi',
    label: 'Game anchored UI and compositor',
    phase: 'ui',
    framePhase: 'overlay',
    reads: ['cameraUniforms', 'compositedColor', 'pickIds'],
    writes: ['compositedColor'],
    overlay: true,
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

    if (pass.overlay && (pass.depth?.mode === 'write' || pass.depth?.mode === 'read-write')) {
      diagnostics.push(`overlay pass "${pass.id}" must not write depth attachment "${pass.depth.attachment}"`);
    }
    if (pass.overlay && pass.framePhase !== 'overlay') {
      diagnostics.push(`overlay pass "${pass.id}" must use the overlay frame phase`);
    }

    if (pass.framePhase) {
      const order = framePhaseOrder(pass.framePhase);
      if (order < lastFramePhaseOrder) {
        diagnostics.push(`pass "${pass.id}" moves frame phase order backward to "${pass.framePhase}"`);
      }
      lastFramePhaseOrder = Math.max(lastFramePhaseOrder, order);

      const touchesDepth = (pass.reads?.includes('worldDepth') ?? false) || (pass.writes?.includes('worldDepth') ?? false);
      if (pass.framePhase === 'world-depth' && !pass.depth) {
        diagnostics.push(`world-depth pass "${pass.id}" must declare a depth attachment contract`);
      }
      if (pass.framePhase !== 'world-depth' && touchesDepth) {
        diagnostics.push(`non-world-depth pass "${pass.id}" must not touch worldDepth`);
      }
    }

    if (pass.depth && pass.framePhase !== 'world-depth') {
      diagnostics.push(`pass "${pass.id}" declares depth outside the world-depth frame phase`);
    }

    if (pass.depth) {
      const readsDepth = pass.reads?.includes(pass.depth.attachment) ?? false;
      const writesDepth = pass.writes?.includes(pass.depth.attachment) ?? false;
      if ((pass.depth.mode === 'read' || pass.depth.mode === 'read-write') && !readsDepth) {
        diagnostics.push(`pass "${pass.id}" declares depth ${pass.depth.mode} but does not read "${pass.depth.attachment}"`);
      }
      if ((pass.depth.mode === 'write' || pass.depth.mode === 'read-write') && !writesDepth) {
        diagnostics.push(`pass "${pass.id}" declares depth ${pass.depth.mode} but does not write "${pass.depth.attachment}"`);
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
  switch (phase) {
    case 'background': return 0;
    case 'world-depth': return 1;
    case 'overlay': return 2;
  }
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
