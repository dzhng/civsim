const DEPTH_MODES = new Set(['read', 'read-write', 'write']);

export function hasFramePhaseOrder(phases, options = {}) {
  const kinds = Array.isArray(phases) ? phases.map((phase) => phase?.kind) : [];
  const background = kinds.indexOf('background');
  const world = kinds.indexOf('world-depth');
  const overlay = kinds.indexOf('overlay');
  return background === 0
    && world > background
    && (overlay >= 0 ? overlay > world : options.requireOverlay !== true);
}

export function hasFramePass(phases, id, kind = null) {
  return Array.isArray(phases) && phases.some((phase) =>
    (kind === null || phase?.kind === kind)
      && Array.isArray(phase?.passIds)
      && phase.passIds.includes(id)
  );
}

export function hasFrameDepthPass(phases, id, mode) {
  return Array.isArray(phases) && phases.some((phase) =>
    phase?.kind === 'world-depth'
      && Array.isArray(phase?.depthPasses)
      && phase.depthPasses.some((pass) => pass?.id === id && pass?.mode === mode),
  );
}

function hasDepthPassPlacement(phases) {
  return Array.isArray(phases) && phases.every((phase) => {
    const depthPasses = Array.isArray(phase?.depthPasses) ? phase.depthPasses : [];
    if (phase?.kind !== 'world-depth') return depthPasses.length === 0;
    return depthPasses.every((pass) => typeof pass?.id === 'string' && DEPTH_MODES.has(pass?.mode));
  });
}

export function hasBattleWorldDepthContract(renderStats) {
  return renderStats?.cameraContract === 'shared-world-camera-wgsl'
    && renderStats?.skinnedCameraContract === 'shared-world-camera-wgsl'
    && renderStats?.depth?.allocated === true
    && renderStats?.depth?.format === 'depth24plus'
    && hasFramePhaseOrder(renderStats?.phases, { requireOverlay: true })
    && hasDepthPassPlacement(renderStats?.phases)
    && hasFramePass(renderStats?.phases, 'battle-terrain-underpaint', 'background')
    && hasFrameDepthPass(renderStats?.phases, 'battle-terrain-props', 'read-write')
    && hasFrameDepthPass(renderStats?.phases, 'battle-skinned-crowd', 'read-write')
    && hasFrameDepthPass(renderStats?.phases, 'battle-ground-cues', 'read')
    && hasFramePass(renderStats?.phases, 'battle-debug-blocks', 'overlay')
    && hasFramePass(renderStats?.phases, 'battle-debug-triangles', 'overlay');
}

export function hasCampaignWorldDepthContract(stats) {
  return stats?.cameraContract === 'shared-world-camera-wgsl'
    && stats?.depth?.allocated === true
    && stats?.depth?.format === 'depth24plus'
    && hasFramePhaseOrder(stats?.phases, { requireOverlay: true })
    && hasDepthPassPlacement(stats?.phases)
    && hasFramePass(stats?.phases, 'campaign-map-underpaint', 'background')
    && hasFramePass(stats?.phases, 'campaign-territory-wash', 'background')
    && hasFramePass(stats?.phases, 'campaign-water', 'background')
    && hasFrameDepthPass(stats?.phases, 'campaign-ground-selection', 'read')
    && hasFrameDepthPass(stats?.phases, 'campaign-roads', 'read')
    && hasFrameDepthPass(stats?.phases, 'campaign-sea-lanes-depth', 'read')
    && hasFrameDepthPass(stats?.phases, 'campaign-scenery', 'read-write')
    && hasFrameDepthPass(stats?.phases, 'campaign-entities', 'read-write')
    && hasFramePass(stats?.phases, 'campaign-clouds', 'overlay')
    && hasFramePass(stats?.phases, 'campaign-markers', 'overlay')
    && hasFramePass(stats?.phases, 'campaign-labels', 'overlay');
}
