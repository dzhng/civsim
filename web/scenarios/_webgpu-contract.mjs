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

export function hasFramePassRole(phases, id, role, kind = null) {
  return Array.isArray(phases) && phases.some((phase) =>
    (kind === null || phase?.kind === kind)
      && Array.isArray(phase?.passRoles)
      && phase.passRoles.some((pass) => pass?.id === id && pass?.role === role)
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

function hasSemanticPassRoles(phases) {
  return Array.isArray(phases) && phases.every((phase) => {
    const passIds = Array.isArray(phase?.passIds) ? phase.passIds : [];
    const passRoles = Array.isArray(phase?.passRoles) ? phase.passRoles : [];
    const roleById = new Map(passRoles.map((pass) => [pass?.id, pass?.role]));
    return passIds.every((id) => {
      const role = roleById.get(id);
      if (id === 'builtin-background') return role === 'background-underpaint';
      if (phase?.kind === 'background') return role === 'background-underpaint';
      if (phase?.kind === 'world-depth') return role === 'world-opaque' || role === 'world-decal' || role === 'world-depth-fill';
      if (phase?.kind === 'overlay') return role === 'overlay-ui' || role === 'overlay-effect' || role === 'overlay-debug';
      return false;
    });
  });
}

export function hasBattleWorldDepthContract(renderStats) {
  return renderStats?.cameraContract === 'shared-world-camera-wgsl'
    && renderStats?.skinnedCameraContract === 'shared-world-camera-wgsl'
    && renderStats?.depth?.allocated === true
    && renderStats?.depth?.format === 'depth24plus'
    && hasFramePhaseOrder(renderStats?.phases, { requireOverlay: true })
    && hasDepthPassPlacement(renderStats?.phases)
    && hasSemanticPassRoles(renderStats?.phases)
    && hasFramePass(renderStats?.phases, 'battle-terrain-underpaint', 'background')
    && hasFramePassRole(renderStats?.phases, 'battle-terrain-underpaint', 'background-underpaint', 'background')
    && hasFrameDepthPass(renderStats?.phases, 'battle-terrain-props', 'read-write')
    && hasFramePassRole(renderStats?.phases, 'battle-terrain-props', 'world-opaque', 'world-depth')
    && hasFrameDepthPass(renderStats?.phases, 'battle-skinned-crowd', 'read-write')
    && hasFramePassRole(renderStats?.phases, 'battle-skinned-crowd', 'world-opaque', 'world-depth')
    && hasFrameDepthPass(renderStats?.phases, 'battle-ground-cues', 'read')
    && hasFramePassRole(renderStats?.phases, 'battle-ground-cues', 'world-decal', 'world-depth')
    && hasFramePass(renderStats?.phases, 'battle-effect-lines', 'overlay')
    && hasFramePassRole(renderStats?.phases, 'battle-effect-lines', 'overlay-effect', 'overlay')
    && hasFramePass(renderStats?.phases, 'battle-debug-blocks', 'overlay')
    && hasFramePassRole(renderStats?.phases, 'battle-debug-blocks', 'overlay-debug', 'overlay')
    && hasFramePass(renderStats?.phases, 'battle-debug-triangles', 'overlay')
    && hasFramePassRole(renderStats?.phases, 'battle-debug-triangles', 'overlay-debug', 'overlay');
}

export function hasCampaignWorldDepthContract(stats) {
  return stats?.cameraContract === 'shared-world-camera-wgsl'
    && stats?.depth?.allocated === true
    && stats?.depth?.format === 'depth24plus'
    && hasFramePhaseOrder(stats?.phases, { requireOverlay: true })
    && hasDepthPassPlacement(stats?.phases)
    && hasSemanticPassRoles(stats?.phases)
    && hasFramePass(stats?.phases, 'campaign-map-underpaint', 'background')
    && hasFramePassRole(stats?.phases, 'campaign-map-underpaint', 'background-underpaint', 'background')
    && hasFramePass(stats?.phases, 'campaign-territory-wash', 'background')
    && hasFramePass(stats?.phases, 'campaign-water', 'background')
    && hasFrameDepthPass(stats?.phases, 'campaign-ground-selection', 'read')
    && hasFramePassRole(stats?.phases, 'campaign-ground-selection', 'world-decal', 'world-depth')
    && hasFrameDepthPass(stats?.phases, 'campaign-roads', 'read')
    && hasFramePassRole(stats?.phases, 'campaign-roads', 'world-decal', 'world-depth')
    && hasFrameDepthPass(stats?.phases, 'campaign-sea-lanes-depth', 'read')
    && hasFramePassRole(stats?.phases, 'campaign-sea-lanes-depth', 'world-decal', 'world-depth')
    && hasFrameDepthPass(stats?.phases, 'campaign-scenery', 'read-write')
    && hasFramePassRole(stats?.phases, 'campaign-scenery', 'world-opaque', 'world-depth')
    && hasFrameDepthPass(stats?.phases, 'campaign-entities', 'read-write')
    && hasFramePassRole(stats?.phases, 'campaign-entities', 'world-opaque', 'world-depth')
    && hasFramePass(stats?.phases, 'campaign-clouds', 'overlay')
    && hasFramePassRole(stats?.phases, 'campaign-clouds', 'overlay-effect', 'overlay')
    && hasFramePass(stats?.phases, 'campaign-markers', 'overlay')
    && hasFramePassRole(stats?.phases, 'campaign-markers', 'overlay-ui', 'overlay')
    && hasFramePass(stats?.phases, 'campaign-labels', 'overlay')
    && hasFramePassRole(stats?.phases, 'campaign-labels', 'overlay-ui', 'overlay');
}
