export type RenderGraphPhase = 'frame' | 'battle' | 'campaign' | 'ui' | 'post';

export interface RenderGraphPass {
  id: string;
  label: string;
  phase: RenderGraphPhase;
  reads?: string[];
  writes?: string[];
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
    label: 'Battle terrain, water, sky, haze, and shadows',
    phase: 'battle',
    reads: ['cameraUniforms', 'frameConstants'],
    writes: ['worldColor', 'worldDepth'],
  },
  {
    id: 'battleCrowd',
    label: 'Skinned battle crowd',
    phase: 'battle',
    reads: ['cameraUniforms', 'worldDepth', 'soldierVat', 'crowdInstances'],
    writes: ['worldColor', 'pickIds'],
  },
  {
    id: 'campaignMap',
    label: 'Campaign terrain, roads, water, borders, and labels',
    phase: 'campaign',
    reads: ['cameraUniforms', 'frameConstants', 'campaignState'],
    writes: ['worldColor', 'pickIds'],
  },
  {
    id: 'gameUi',
    label: 'Game anchored UI and compositor',
    phase: 'ui',
    reads: ['cameraUniforms', 'worldColor', 'pickIds'],
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
