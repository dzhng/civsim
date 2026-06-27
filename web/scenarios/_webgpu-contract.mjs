function hasFramePhaseOrder(phases) {
  const kinds = Array.isArray(phases) ? phases.map((phase) => phase?.kind) : [];
  const background = kinds.indexOf('background');
  const world = kinds.indexOf('world-depth');
  const overlay = kinds.includes('overlay') ? kinds.indexOf('overlay') : kinds.length;
  return background === 0 && world > background && overlay > world;
}

function hasFramePass(phases, id) {
  return Array.isArray(phases) && phases.some((phase) => Array.isArray(phase?.passIds) && phase.passIds.includes(id));
}

function hasFrameDepthPass(phases, id, mode) {
  return Array.isArray(phases) && phases.some((phase) =>
    phase?.kind === 'world-depth'
      && Array.isArray(phase?.depthPasses)
      && phase.depthPasses.some((pass) => pass?.id === id && pass?.mode === mode),
  );
}

export function hasBattleWorldDepthContract(renderStats) {
  return renderStats?.cameraContract === 'shared-world-camera-wgsl'
    && renderStats?.skinnedCameraContract === 'shared-world-camera-wgsl'
    && renderStats?.depth?.allocated === true
    && renderStats?.depth?.format === 'depth24plus'
    && hasFramePhaseOrder(renderStats?.phases)
    && hasFramePass(renderStats?.phases, 'battle-terrain-features')
    && hasFrameDepthPass(renderStats?.phases, 'battle-skinned-crowd', 'read-write');
}

export function hasCampaignWorldDepthContract(stats) {
  return stats?.cameraContract === 'shared-world-camera-wgsl'
    && stats?.depth?.allocated === true
    && stats?.depth?.format === 'depth24plus'
    && hasFramePhaseOrder(stats?.phases)
    && hasFrameDepthPass(stats?.phases, 'campaign-ground-selection', 'read')
    && hasFrameDepthPass(stats?.phases, 'campaign-roads', 'read')
    && hasFrameDepthPass(stats?.phases, 'campaign-sea-lanes-depth', 'read')
    && hasFrameDepthPass(stats?.phases, 'campaign-scenery', 'read-write')
    && hasFrameDepthPass(stats?.phases, 'campaign-entities', 'read-write');
}
