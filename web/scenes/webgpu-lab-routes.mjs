import { readdir, readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import {
  WEBGPU_DEPTH_FORMAT,
  WEBGPU_WORLD_DEPTH_ATTACHMENT,
  hasFrameDepthPass,
  hasFramePass,
  hasFramePassRole,
  hasFramePhaseOrder,
} from './_webgpu-contract.mjs';

export const meta = {
  name: 'webgpu-lab-routes',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Fresh raw-WebGPU lab routes render and expose deterministic stats.',
};

const routes = [
  ['frame-shell', (s) => s?.ok
    && s.route === 'frame-shell'
    && s.stats.atmosphere === 'aegean-sky-haze'
    && s.stats.cameraContract === 'shared-world-camera-wgsl'
    && frameGraphContractFixturesRejected(s.stats.frameGraphContractFixtures)],
  ['assets', (s) => s?.ok && s.route === 'assets' && s.stats.badErrors > 0 && s.stats.importUi?.paste && s.stats.importUi?.file && s.stats.importUi?.drop],
  ['crowd-data?count=1000', (s) => s?.ok && s.route === 'crowd-data' && s.stats.stats.written === 1000],
  ['animation-state', (s) => s?.ok && s.route === 'animation-state'],
  ['skinned-soldier?phase=0.25', (s) => s?.ok && s.route === 'skinned-soldier' && s.stats.instances === 1 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['skinned-crowd?count=1200', (s) => s?.ok && s.route === 'skinned-crowd' && s.stats.count === 1200 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['skinned-depth', (s) => s?.ok
    && s.route === 'skinned-depth'
    && s.stats.instances === 2
    && s.stats.drawCalls === 2
    && s.stats.cameraContract === 'shared-world-camera-wgsl'
    && s.stats.depth?.allocated === true
    && hasFramePhaseOrder(s.stats.framePhases)
    && hasFrameDepthPass(s.stats.framePhases, 'skinned-depth-crowd', 'read-write')
    && hasFramePassRole(s.stats.framePhases, 'skinned-depth-crowd', 'world-opaque', 'world-depth')
    && s.stats.hostileDrawOrder === 'front-class-0-submitted-before-rear-class-14'
    && s.stats.sample],
  ['battle-ground-cue-depth', (s) => s?.ok
    && s.route === 'battle-ground-cue-depth'
    && s.stats.instances === 1
    && s.stats.groundCues?.lineSegments === 5
    && s.stats.depth?.allocated === true
    && s.stats.depth?.format === WEBGPU_DEPTH_FORMAT
    && hasFramePhaseOrder(s.stats.framePhases)
    && hasFrameDepthPass(s.stats.framePhases, 'battle-ground-cue-depth-crowd', 'read-write')
    && hasFrameDepthPass(s.stats.framePhases, 'battle-ground-cue-depth-cues', 'read')
    && hasFramePassRole(s.stats.framePhases, 'battle-ground-cue-depth-crowd', 'world-opaque', 'world-depth')
    && hasFramePassRole(s.stats.framePhases, 'battle-ground-cue-depth-cues', 'world-decal', 'world-depth')
    && s.stats.hostileDrawOrder === 'crowd-before-late-ground-cue'
    && s.stats.samples?.coveredCueUnderSoldier
    && s.stats.samples?.exposedCueControl],
  ['battle-effect-overlay', (s) => s?.ok
    && s.route === 'battle-effect-overlay'
    && s.stats.instances === 1
    && s.stats.effects?.lineSegments === 5
    && s.stats.depth?.allocated === true
    && s.stats.depth?.format === WEBGPU_DEPTH_FORMAT
    && hasFramePhaseOrder(s.stats.framePhases)
    && hasFrameDepthPass(s.stats.framePhases, 'battle-effect-overlay-crowd', 'read-write')
    && hasFramePassRole(s.stats.framePhases, 'battle-effect-overlay-crowd', 'world-opaque', 'world-depth')
    && hasFramePass(s.stats.framePhases, 'battle-effect-overlay-lines', 'overlay')
    && hasFramePassRole(s.stats.framePhases, 'battle-effect-overlay-lines', 'overlay-effect', 'overlay')
    && s.stats.samples?.effectOverSoldier
    && s.stats.samples?.exposedEffectControl],
  ['lod?zoom=5', (s) => s?.ok && s.route === 'lod' && (s.stats.counts.l1 + s.stats.counts.l2 + s.stats.counts.l3 + s.stats.counts.l0) === 1800],
  ['battle', (s) => s?.ok && s.route === 'battle' && s.stats.soldiers === 2400 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['perf?count=900', (s) => s?.ok
    && s.route === 'perf'
    && s.stats.kind === 'webgpu-full-game-perf'
    && s.stats.mode === 'headless-liveness'
    && s.stats.releaseBudget === 'not-set'
    && s.stats.scenes?.[0]?.id === 'lab-skinned-crowd'
    && s.stats.scenes[0].stats.count === 900
    && s.stats.scenes[0].frame.samples > 0],
  ['campaign', (s) => s?.ok && s.route === 'campaign' && s.stats.markers > 0],
  ['campaign-map?preset=whole', (s) => s?.ok && s.route === 'campaign-map' && s.stats.roads > 20 && s.stats.seaLanes > 0 && s.stats.cityMarkers > 20 && s.stats.visibleLabels > 5 && s.stats.labelVertices > 20 && s.stats.factions > 5 && s.stats.territoryPixels > 10000 && s.stats.borderSegments > 100 && s.stats.waterFeatures >= 5 && s.stats.cloudQuads === 1 && s.stats.cameraContract === 'shared-world-camera-wgsl' && s.stats.territoryLayer === 'raw-webgpu-texture' && s.stats.atmosphereLayer === 'raw-webgpu-cloud-water' && s.stats.labelLayer === 'raw-webgpu-glyph-atlas'],
  ['campaign-ui', (s) => s?.ok && s.route === 'campaign-ui' && s.stats.fixture === 'controlled' && s.stats.cityEntities === 2 && s.stats.armyEntities === 1 && s.stats.selections >= 2 && s.stats.depth?.allocated === true && s.stats.depth?.format === WEBGPU_DEPTH_FORMAT && hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases) && hasFrameDepthPass(s.stats.framePhases ?? s.stats.phases, 'campaign-ui-selection', 'read') && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'campaign-ui-selection', 'world-decal', 'world-depth') && hasFrameDepthPass(s.stats.framePhases ?? s.stats.phases, 'campaign-ui-entities', 'read-write') && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'campaign-ui-entities', 'world-opaque', 'world-depth') && s.stats.ui.armyPanel && s.stats.ui.cityPanel && s.stats.ui.autoReplenishToggle && s.stats.ui.classRows >= 8 && s.stats.ui.diplomacyRows >= 1 && s.stats.labelLayer === 'raw-webgpu-glyph-atlas' && s.stats.labelVertices > 0 && s.stats.postCutoverScreenshots === 'webgpu-only'],
  ['campaign-model-gates?gate=city', (s) => s?.ok
    && s.route === 'campaign-model-gates'
    && s.stats.gate === 'city'
    && s.stats.depth?.allocated === true
    && hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases)
    && s.stats.entityLayer === 'raw-webgpu-legacy-model-meshes'
    && s.stats.samples?.cityStandard?.hiddenLowerCloth
    && s.stats.samples?.cityStandard?.visibleUpperCloth],
  ['campaign-model-gates?gate=garrison-city', (s) => s?.ok
    && s.route === 'campaign-model-gates'
    && s.stats.gate === 'garrison-city'
    && s.stats.depth?.allocated === true
    && hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases)
    && s.stats.entityLayer === 'raw-webgpu-legacy-model-meshes'
    && s.stats.samples?.garrison?.hiddenShieldInsideWall
    && s.stats.samples?.garrison?.visibleStandardAboveRoofs],
  ['campaign-model-gates?gate=selected-city', (s) => s?.ok
    && s.route === 'campaign-model-gates'
    && s.stats.gate === 'selected-city'
    && s.stats.selections === 1
    && s.stats.depth?.allocated === true
    && hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases)
    && hasFrameDepthPass(s.stats.framePhases, 'model-gate-selection', 'read')
    && hasFrameDepthPass(s.stats.framePhases, 'model-gate-entities', 'read-write')
    && hasFramePassRole(s.stats.framePhases, 'model-gate-selection', 'world-decal', 'world-depth')
    && hasFramePassRole(s.stats.framePhases, 'model-gate-entities', 'world-opaque', 'world-depth')
    && s.stats.samples?.selectionDepth?.occludedByCityCore
    && s.stats.samples?.selectionDepth?.visibleOuterRing],
  ['campaign-model-gates?gate=army', (s) => s?.ok
    && s.route === 'campaign-model-gates'
    && s.stats.gate === 'army'
    && s.stats.selections === 1
    && s.stats.depth?.allocated === true
    && hasFramePhaseOrder(s.stats.framePhases ?? s.stats.phases)
    && hasFrameDepthPass(s.stats.framePhases, 'model-gate-selection', 'read')
    && hasFrameDepthPass(s.stats.framePhases, 'model-gate-entities', 'read-write')
    && hasFramePassRole(s.stats.framePhases, 'model-gate-selection', 'world-decal', 'world-depth')
    && hasFramePassRole(s.stats.framePhases, 'model-gate-entities', 'world-opaque', 'world-depth')
    && s.stats.samples?.selectionDepth?.occludedByArmyCore
    && s.stats.samples?.selectionDepth?.visibleOuterRing],
  ['campaign-model-gates?gate=hostile-depth-order', (s) => s?.ok
    && s.route === 'campaign-model-gates'
    && s.stats.gate === 'hostile-depth-order'
    && s.stats.hostileDrawOrder === 'entities-before-late-scenery'
    && s.stats.depth?.allocated === true
    && s.stats.depth?.format === WEBGPU_DEPTH_FORMAT
    && hasFrameDepthPass(s.stats.framePhases, 'model-gate-entities', 'read-write')
    && hasFrameDepthPass(s.stats.framePhases, 'model-gate-scenery', 'read-write')
    && s.stats.samples?.hostileDepthOrder?.flagOverLateTree
    && s.stats.samples?.hostileDepthOrder?.lateTreeControl],
  ['render-graph', (s) => s?.ok
    && s.route === 'render-graph'
    && s.stats.firstPass === 'camera'
    && s.stats.lastPass === 'present'
    && s.stats.passes >= 17
    && graphFramePhaseOrder(s.stats.graphFramePhases)
    && s.stats.depthPasses?.includes('worldDepthClear')
    && s.stats.depthPasses?.includes('battleTerrainProps')
    && s.stats.depthPasses?.includes('battleCrowd')
    && s.stats.depthPasses?.includes('battleGroundCues')
    && s.stats.depthPasses?.includes('campaignGroundSelection')
    && s.stats.depthPasses?.includes('campaignRoads')
    && s.stats.depthPasses?.includes('campaignSeaLanes')
    && s.stats.depthPasses?.includes('campaignScenery')
    && s.stats.depthPasses?.includes('campaignEntities')
    && hasGraphPassRole(s.stats.graphPassRoles, 'battleTerrain', 'background-underpaint', 'background')
    && hasGraphPassRole(s.stats.graphPassRoles, 'campaignMapUnderpaint', 'background-underpaint', 'background')
    && hasGraphPassRole(s.stats.graphPassRoles, 'worldDepthClear', 'world-depth-fill', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'battleTerrainProps', 'world-opaque', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'battleCrowd', 'world-opaque', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'battleGroundCues', 'world-decal', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'campaignGroundSelection', 'world-decal', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'campaignRoads', 'world-decal', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'campaignSeaLanes', 'world-decal', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'campaignScenery', 'world-opaque', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'campaignEntities', 'world-opaque', 'world-depth')
    && hasGraphPassRole(s.stats.graphPassRoles, 'atmosphereOverlays', 'overlay-effect', 'overlay')
    && hasGraphPassRole(s.stats.graphPassRoles, 'battleEffectLines', 'overlay-effect', 'overlay')
    && hasGraphPassRole(s.stats.graphPassRoles, 'battleDebugOverlays', 'overlay-debug', 'overlay')
    && hasGraphPassRole(s.stats.graphPassRoles, 'campaignMarkers', 'overlay-ui', 'overlay')
    && hasGraphPassRole(s.stats.graphPassRoles, 'labelsAndHudAnchors', 'overlay-ui', 'overlay')
    && hasGraphPassRole(s.stats.graphPassRoles, 'gameUi', 'overlay-ui', 'overlay')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'worldDepthClear', 'write')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'battleTerrainProps', 'read-write')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'battleCrowd', 'read-write')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'battleGroundCues', 'read')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'campaignGroundSelection', 'read')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'campaignRoads', 'read')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'campaignSeaLanes', 'read')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'campaignScenery', 'read-write')
    && hasGraphDepthPassMode(s.stats.depthPassModes, 'campaignEntities', 'read-write')
    && depthContractFixturesRejected(s.stats.depthContractFixtures)
    && bucketContractFixturesSatisfied(s.stats.bucketContractFixtures)
    && s.stats.backgroundDepthPasses?.length === 0
    && s.stats.overlayDepthPasses?.length === 0
    && s.stats.depth?.allocated === true
    && s.stats.depth?.format === WEBGPU_DEPTH_FORMAT
    && hasFramePhaseOrder(s.stats.framePhases)
    && hasFramePass(s.stats.framePhases, 'render-graph-nested-3d')
    && hasFrameDepthPass(s.stats.framePhases, 'render-graph-nested-3d', 'read-write')
    && hasFramePassRole(s.stats.framePhases, 'render-graph-nested-3d', 'world-opaque', 'world-depth')
    && s.stats.nested3d?.fixtures?.includes('flag-in-city')
    && s.stats.nested3d?.fixtures?.includes('garrison-in-city-stub')
    && s.stats.nested3d?.fixtures?.includes('rank-overlap')],
  ['world-camera', (s) => s?.ok
    && s.route === 'world-camera'
    && s.stats.cameraContract === 'shared-world-camera-wgsl'
    && s.stats.depth?.allocated === true
    && s.stats.depth?.format === WEBGPU_DEPTH_FORMAT
    && hasFramePhaseOrder(s.stats.framePhases)
    && hasFramePass(s.stats.framePhases, 'world-camera-nested-3d')
    && hasFrameDepthPass(s.stats.framePhases, 'world-camera-nested-3d', 'read-write')
    && hasFramePassRole(s.stats.framePhases, 'world-camera-nested-3d', 'world-opaque', 'world-depth')
    && s.stats.anchorAgreement?.maxDelta < 0.001
    && s.stats.nested3d?.fixtures?.includes('flag-in-city')
    && s.stats.nested3d?.fixtures?.includes('garrison-in-city-stub')
    && s.stats.nested3d?.fixtures?.includes('rank-overlap')],
  ['battle-terrain?fixture=coast', (s) => s?.ok && s.route === 'battle-terrain' && s.stats.fixture === 'coast' && s.stats.waterQuads >= 3 && s.stats.sceneryQuads >= 8 && s.stats.worldPropQuads >= 4 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-terrain?fixture=melee', (s) => s?.ok && s.route === 'battle-terrain' && s.stats.fixture === 'melee' && s.stats.waterQuads >= 3 && s.stats.sceneryQuads >= 8 && s.stats.worldPropQuads >= 4 && s.stats.selectionQuads === 0 && s.stats.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-live?mode=5v5&ticks=36', (s) => s?.ok && s.route === 'battle-live' && s.stats.written > 1000 && s.stats.units >= 10 && s.stats.player > 0 && s.stats.enemy > 0 && s.stats.drawCalls >= 1 && s.stats.drawCalls <= 15 && s.stats.groundCues.lineSegments >= 20 && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'battle-live-crowd', 'world-opaque', 'world-depth') && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'battle-live-ground-cues', 'world-decal', 'world-depth') && s.stats.cameraContract === 'shared-world-camera-wgsl' && s.stats.groundCues.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-ui?mode=5v5&ticks=36', (s) => s?.ok && s.route === 'battle-ui' && s.stats.written > 1000 && s.stats.units >= 10 && s.stats.drawCalls >= 1 && s.stats.drawCalls <= 15 && s.stats.groundCues.lineSegments >= 20 && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'battle-ui-crowd', 'world-opaque', 'world-depth') && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'battle-ui-ground-cues', 'world-decal', 'world-depth') && s.stats.ui.cards >= 8 && s.stats.ui.toolbarButtons >= 5 && s.stats.ui.postCutoverScreenshots === 'webgpu-only' && s.stats.cameraContract === 'shared-world-camera-wgsl' && s.stats.groundCues.cameraContract === 'shared-world-camera-wgsl'],
  ['battle-input?mode=5v5&ticks=36', (s) => s?.ok && s.route === 'battle-input' && s.stats.written > 1000 && s.stats.units >= 10 && s.stats.drawCalls >= 1 && s.stats.drawCalls <= 15 && s.stats.groundCues.lineSegments >= 20 && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'battle-input-crowd', 'world-opaque', 'world-depth') && hasFramePassRole(s.stats.framePhases ?? s.stats.phases, 'battle-input-ground-cues', 'world-decal', 'world-depth') && s.stats.selectedUnits.length === 1 && s.stats.ui.cards >= 8 && s.stats.cameraContract === 'shared-world-camera-wgsl' && s.stats.groundCues.cameraContract === 'shared-world-camera-wgsl'],
  ['cutover', (s) => s?.ok
    && s.route === 'cutover'
    && s.stats.kind === 'webgpu-cutover-report'
    && s.stats.renderer === 'raw-webgpu-production-default'
    && s.stats.routineScreenshots === 'webgpu-only'
    && s.stats.atmosphere === 'aegean-sky-haze'
    && s.stats.removed.includes('@babylonjs/core')
    && s.stats.retiredSwitches.includes('?gfx=legacy')
    && s.stats.complete >= 12
    && s.stats.releaseReady === true
    && s.stats.visualReport?.endsWith('webgpu-visual-report.html')
    && s.stats.perfReport?.endsWith('webgpu-performance-report.html')
    && s.stats.blockers.length === 0],
];

function hasGraphDepthPassMode(passes, id, mode) {
  return Array.isArray(passes) && passes.some((pass) => pass?.id === id && pass?.mode === mode && pass?.attachment === WEBGPU_WORLD_DEPTH_ATTACHMENT);
}

function hasGraphPassRole(passes, id, role, framePhase) {
  return Array.isArray(passes) && passes.some((pass) => pass?.id === id && pass?.role === role && pass?.framePhase === framePhase);
}

function bucketContractFixturesSatisfied(fixtures) {
  const expected = new Set([
    'topLevelTypeBucketPass',
    'semanticPassWithTypeBatching',
  ]);
  return Array.isArray(fixtures)
    && fixtures.length === expected.size
    && fixtures.every((fixture) => expected.has(fixture?.id) && Array.isArray(fixture?.diagnostics))
    && fixtures.some((fixture) => fixture?.id === 'topLevelTypeBucketPass' && fixture?.rejected === true)
    && fixtures.some((fixture) => fixture?.id === 'semanticPassWithTypeBatching' && fixture?.accepted === true);
}

function depthContractFixturesRejected(fixtures) {
  const expected = new Set([
    'readModeWritesDepth',
    'writeModeReadsDepth',
    'unsupportedDepthAttachment',
    'unsupportedDepthMode',
    'missingSemanticRole',
    'mismatchedSemanticRole',
  ]);
  return Array.isArray(fixtures)
    && fixtures.length === expected.size
    && fixtures.every((fixture) =>
      expected.has(fixture?.id)
      && fixture?.rejected === true
      && Array.isArray(fixture?.diagnostics)
      && fixture.diagnostics.length > 0
    );
}

function frameGraphContractFixturesRejected(fixtures) {
  const expected = new Set([
    'backgroundDepthMode',
    'worldMissingDepthMode',
    'worldUnsupportedDepthMode',
    'unsupportedPhase',
    'missingSemanticRole',
    'mismatchedSemanticRole',
    'mismatchedDepthRole',
  ]);
  return Array.isArray(fixtures)
    && fixtures.length === expected.size
    && fixtures.every((fixture) =>
      expected.has(fixture?.id)
      && fixture?.rejected === true
      && Array.isArray(fixture?.diagnostics)
      && fixture.diagnostics.length > 0
    );
}

function graphFramePhaseOrder(phases) {
  return Array.isArray(phases) && phases.join(' -> ') === 'background -> world-depth -> overlay';
}

async function findPrivateCameraStructs() {
  const roots = [
    new URL('../../packages/webgpu-core/src/', import.meta.url),
    new URL('../../packages/game-renderer/src/', import.meta.url),
    new URL('../src/', import.meta.url),
  ];
  const allowed = new Set([
    new URL('../../packages/webgpu-core/src/cameraWgsl.ts', import.meta.url).pathname,
  ]);
  const matches = [];
  for (const root of roots) {
    for (const file of await tsFiles(root)) {
      if (allowed.has(file.pathname)) continue;
      const source = await readFile(file, 'utf8');
      if (/\bstruct\s+Camera\s*\{/.test(source)) {
        matches.push(file.pathname.replace(new URL('../../', import.meta.url).pathname, ''));
      }
    }
  }
  return matches.sort();
}

async function tsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name, dir);
    if (entry.isDirectory()) {
      files.push(...await tsFiles(new URL(`${entry.name}/`, dir)));
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
}

async function findCampaignDepthOnlyFootguns() {
  const files = [
    new URL('../../packages/game-renderer/src/campaign/entityPass.ts', import.meta.url),
    new URL('../../packages/game-renderer/src/campaign/sceneryPass.ts', import.meta.url),
    new URL('../../packages/game-renderer/src/campaign/selectionPass.ts', import.meta.url),
    new URL('../../packages/game-renderer/src/campaign/mapPass.ts', import.meta.url),
    new URL('../../web/src/campaign/rendererWebGPU.ts', import.meta.url),
    new URL('../../apps/webgpu-lab/src/router.ts', import.meta.url),
  ];
  const root = new URL('../../', import.meta.url).pathname;
  const checks = [
    ['drawDepth method', /\bdrawDepth\s*\(/],
    ['parallel depth pipeline field', /\bprivate\s+depthPipeline\b/],
    ['phase-selected line class', /\blines\s*=\s*new\s+CampaignLinePass\b/],
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const [label, pattern] of checks) {
      if (pattern.test(source)) matches.push(`${file.pathname.replace(root, '')}: ${label}`);
    }
  }
  return matches.sort();
}

async function findPhaseBrandFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const files = [
    {
      file: new URL('../../packages/webgpu-core/src/frameShell.ts', import.meta.url),
      checks: [
        ['frame shell imports shared depth contract', /import\s*\{[^}]*WEBGPU_DEPTH_FORMAT[^}]*type\s+WebGpuDepthMode[^}]*\}\s*from\s*['"]\.\/depthContract['"]/],
        ['frame graph command list is phase-branded', /export type FrameGraphPass[\s\S]*?phase:\s*'background'[\s\S]*?BackgroundRenderPass[\s\S]*?phase:\s*'world-depth'[\s\S]*?WorldRenderPass[\s\S]*?phase:\s*'overlay'[\s\S]*?OverlayRenderPass/],
        ['frame graph command list declares semantic roles', /export type FrameGraphPass[\s\S]*?role:\s*'background-underpaint'[\s\S]*?role:\s*'world-depth-fill'\s*\|\s*'world-opaque'\s*\|\s*'world-decal'[\s\S]*?role:\s*'overlay-ui'\s*\|\s*'overlay-effect'\s*\|\s*'overlay-debug'/],
        ['frame commands accept graph passes', /passes\?:\s*FrameGraphPass\[\]/],
        ['phase stats publish graph pass ids', /passIds:\s*string\[\]/],
        ['phase stats publish semantic roles', /passRoles:\s*Array<\{\s*id:\s*string;\s*role:\s*FrameGraphPassRole\s*\}>/],
        ['world-depth graph passes use shared depth mode', /export type FrameGraphDepthMode\s*=\s*WebGpuDepthMode[\s\S]*?phase:\s*'world-depth';[\s\S]*?depth:\s*FrameGraphDepthMode/],
        ['phase stats publish depth pass modes', /depthPasses:\s*Array<\{\s*id:\s*string;\s*mode:\s*FrameGraphDepthMode\s*\}>/],
      ],
    },
    {
      file: new URL('../../packages/game-renderer/src/renderGraph.ts', import.meta.url),
      checks: [
        ['render graph imports shared depth contract', /import\s*\{[^}]*WEBGPU_DEPTH_FORMAT[^}]*WEBGPU_WORLD_DEPTH_ATTACHMENT[^}]*type\s+WebGpuDepthMode[^}]*\}\s*from\s*['"]\.\.\/\.\.\/webgpu-core\/src\/depthContract['"]/],
        ['render graph imports shared frame role contract', /import\s*\{[\s\S]*?frameGraphDepthRole[\s\S]*?frameGraphRolePhase[\s\S]*?isFrameGraphPassRole[\s\S]*?type\s+FrameGraphPassRole[\s\S]*?\}\s*from\s*['"]\.\.\/\.\.\/webgpu-core\/src\/frameGraphContract['"]/],
        ['render graph pass declares semantic role', /role\?:\s*FrameGraphPassRole/],
        ['render graph validates semantic roles', /frame-phase pass "\$\{pass\.id\}" must declare a semantic role[\s\S]*?frameGraphRolePhase\(pass\.role\)/],
        ['render graph validates role-depth compatibility', /frameGraphDepthRole\(pass\.depth\.mode\)[\s\S]*?requires role/],
        ['render graph pass depth uses shared mode type', /mode:\s*WebGpuDepthMode/],
        ['render graph pass depth uses shared format type', /format:\s*typeof\s+WEBGPU_DEPTH_FORMAT/],
        ['render graph validates shared world depth attachment', /pass\.depth\.attachment\s*!==\s*WEBGPU_WORLD_DEPTH_ATTACHMENT/],
      ],
    },
    {
      file: new URL('../../packages/webgpu-core/src/skinnedPipeline.ts', import.meta.url),
      checks: [['skinned crowd draw requires world pass', /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/]],
    },
    {
      file: new URL('../../packages/game-renderer/src/battle/terrainPass.ts', import.meta.url),
      checks: [
        ['battle terrain underpaint draw requires background pass', /\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/],
        ['battle terrain prop draw requires world pass', /\bdrawProps\s*\(\s*pass:\s*WorldRenderPass\s*\)/],
        ['battle terrain uses shared battle world depth helper', /civsimBattleWorldDepth3d\s*\(/],
      ],
    },
    {
      file: new URL('../../packages/game-renderer/src/battle/groundCuePass.ts', import.meta.url),
      checks: [
        ['battle ground cue draw requires world pass', /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/],
        ['battle ground cue uses shared battle world depth helper', /civsimBattleWorldDepth3d\s*\(/],
        ['battle ground cue uses depth-read material contract', /webGpuWorldDepthStencil\s*\(\s*false\s*\)/],
        ['selected unit cue helper uses ground-cue naming', /selectedUnitGroundCueVertices/],
      ],
    },
    {
      file: new URL('../../packages/game-renderer/src/battle/effectLinePass.ts', import.meta.url),
      checks: [
        ['battle effect line draw requires overlay pass', /\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/],
        ['battle effect line does not use world depth stencil', v => !/webGpuWorldDepthStencil|depthStencil/.test(v)],
      ],
    },
    {
      file: new URL('../../packages/game-renderer/src/battle/minimapPass.ts', import.meta.url),
      checks: [['battle minimap draw requires overlay pass', /\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/]],
    },
    {
      file: new URL('../../web/src/battle/rendererWebGPU.ts', import.meta.url),
      checks: [['battle debug triangles draw requires overlay pass', /class BattleTrianglePass[\s\S]*?\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/]],
    },
    {
      file: new URL('../../packages/game-renderer/src/fixtures/nested3d.ts', import.meta.url),
      checks: [['nested fixture draw requires world pass', /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/]],
    },
    {
      file: new URL('../../packages/game-renderer/src/campaign/territoryPass.ts', import.meta.url),
      checks: [['campaign territory draw requires background pass', /\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/]],
    },
    {
      file: new URL('../../packages/game-renderer/src/campaign/atmospherePass.ts', import.meta.url),
      checks: [
        ['campaign clouds draw requires overlay pass', /export class CampaignCloudPass[\s\S]*?\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/],
        ['campaign water draw requires background pass', /export class CampaignWaterPass[\s\S]*?\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/],
      ],
    },
    {
      file: new URL('../../packages/game-renderer/src/campaign/entityPass.ts', import.meta.url),
      checks: [['campaign entities draw requires world pass', /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/]],
    },
    {
      file: new URL('../../packages/game-renderer/src/campaign/sceneryPass.ts', import.meta.url),
      checks: [['campaign scenery draw requires world pass', /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/]],
    },
    {
      file: new URL('../../packages/game-renderer/src/campaign/selectionPass.ts', import.meta.url),
      checks: [['campaign selection draw requires world pass', /\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/]],
    },
    {
      file: new URL('../../packages/game-renderer/src/campaign/mapPass.ts', import.meta.url),
      checks: [
        ['campaign map draw requires background pass', /export class CampaignMapPass[\s\S]*?\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/],
        ['campaign flat lines draw requires background pass', /export class CampaignLinePass[\s\S]*?\bdraw\s*\(\s*pass:\s*BackgroundRenderPass\s*\)/],
        ['campaign world lines draw requires world pass', /export class CampaignWorldLinePass[\s\S]*?\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/],
        ['campaign road draw requires world pass', /export class CampaignRoadPass[\s\S]*?\bdraw\s*\(\s*pass:\s*WorldRenderPass\s*\)/],
        ['campaign markers draw requires overlay pass', /export class CampaignMarkerPass[\s\S]*?\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/],
        ['campaign labels draw requires overlay pass', /export class CampaignLabelPass[\s\S]*?\bdraw\s*\(\s*pass:\s*OverlayRenderPass\s*\)/],
      ],
    },
  ];
  const matches = [];
  for (const { file, checks } of files) {
    const source = await readFile(file, 'utf8');
    for (const [label, pattern] of checks) {
      const ok = typeof pattern === 'function' ? pattern(source) : pattern.test(source);
      if (!ok) matches.push(`${file.pathname.replace(root, '')}: missing ${label}`);
    }
  }
  return matches.sort();
}

async function findRawRenderPassEncoderFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const sourceRoots = [
    new URL('../../packages/game-renderer/src/', import.meta.url),
    new URL('../src/', import.meta.url),
  ];
  const matches = [];
  for (const sourceRoot of sourceRoots) {
    for (const file of await tsFiles(sourceRoot)) {
      const source = await readFile(file, 'utf8');
      const rawPassParams = source.match(/\b\w+\s*\([^)]*:\s*GPURenderPassEncoder\b/g) ?? [];
      if (rawPassParams.length > 0) {
        matches.push(`${file.pathname.replace(root, '')}: raw GPURenderPassEncoder parameter bypasses frame phase branding`);
      }
    }
  }
  return matches.sort();
}

async function findAdHocFrameCallbackFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const files = [
    new URL('../../packages/webgpu-core/src/frameShell.ts', import.meta.url),
    new URL('../../apps/webgpu-lab/src/router.ts', import.meta.url),
    new URL('../../web/src/battle/rendererWebGPU.ts', import.meta.url),
    new URL('../../web/src/campaign/rendererWebGPU.ts', import.meta.url),
  ];
  const matches = [];
  const callbackPattern = /\b(?:background|world|overlay)\s*:\s*\(\s*pass\b/;
  const legacyFrameCommandPattern = /\b(?:background|world|overlay)\?:\s*\(pass:/;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (callbackPattern.test(source)) matches.push(`${file.pathname.replace(root, '')}: callback-shaped drawFrame pass`);
    if (legacyFrameCommandPattern.test(source)) matches.push(`${file.pathname.replace(root, '')}: legacy FrameCommands callback field`);
  }
  return matches.sort();
}

async function findWorldDepthPassMetadataFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const files = [
    new URL('../../apps/webgpu-lab/src/router.ts', import.meta.url),
    new URL('../../web/src/battle/rendererWebGPU.ts', import.meta.url),
    new URL('../../web/src/campaign/rendererWebGPU.ts', import.meta.url),
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const passObjects = source.match(/\{[^{}]*phase:\s*'world-depth'[^{}]*\}/g) ?? [];
    for (const passObject of passObjects) {
      if (file.pathname.endsWith('/apps/webgpu-lab/src/router.ts') && /\bid:\s*'bad-/.test(passObject)) continue;
      if (!/\bdepth:\s*'(?:read|read-write|write)'/.test(passObject)) {
        const id = passObject.match(/\bid:\s*'([^']+)'/)?.[1] ?? 'unknown pass';
        matches.push(`${file.pathname.replace(root, '')}: ${id} missing world-depth depth mode`);
      }
    }
  }
  return matches.sort();
}

async function findFrameGraphRoleFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const files = [
    new URL('../../apps/webgpu-lab/src/router.ts', import.meta.url),
    new URL('../../web/src/battle/rendererWebGPU.ts', import.meta.url),
    new URL('../../web/src/campaign/rendererWebGPU.ts', import.meta.url),
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const passObjects = source.match(/\{[^{}]*id:\s*'[^']+'[^{}]*phase:\s*'[^']+'[^{}]*\}/g) ?? [];
    for (const passObject of passObjects) {
      if (file.pathname.endsWith('/apps/webgpu-lab/src/router.ts') && /\bid:\s*'bad-/.test(passObject)) continue;
      const phase = passObject.match(/\bphase:\s*'([^']+)'/)?.[1] ?? '';
      if (phase !== 'background' && phase !== 'world-depth' && phase !== 'overlay') continue;
      if (!/\brole:\s*'(?:background-underpaint|world-depth-fill|world-opaque|world-decal|overlay-ui|overlay-effect|overlay-debug)'/.test(passObject)) {
        const id = passObject.match(/\bid:\s*'([^']+)'/)?.[1] ?? 'unknown pass';
        matches.push(`${file.pathname.replace(root, '')}: ${id} missing semantic frame-graph role`);
      }
    }
  }
  return matches.sort();
}

async function findProductionScenarioContractFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const files = [
    { file: new URL('./battle-webgpu-default.mjs', import.meta.url), requires: ['hasBattleWorldDepthContract'] },
    { file: new URL('./battle-webgpu-input.mjs', import.meta.url), requires: ['hasBattleWorldDepthContract'] },
    { file: new URL('./campaign-webgpu-production.mjs', import.meta.url), requires: ['hasCampaignWorldDepthContract'] },
    { file: new URL('./campaign-webgpu-handoff.mjs', import.meta.url), requires: ['hasBattleWorldDepthContract', 'hasCampaignWorldDepthContract'] },
    { file: new URL('./campaign-webgpu-reinforcements.mjs', import.meta.url), requires: ['hasBattleWorldDepthContract'] },
    { file: new URL('./campaign-webgpu-save-load.mjs', import.meta.url), requires: ['hasCampaignWorldDepthContract'] },
    { file: new URL('./campaign-webgpu-conquest.mjs', import.meta.url), requires: ['hasCampaignWorldDepthContract'] },
    { file: new URL('./menu-webgpu-shell.mjs', import.meta.url), requires: ['hasBattleWorldDepthContract', 'hasCampaignWorldDepthContract'] },
    { file: new URL('./full-game-webgpu-performance.mjs', import.meta.url), requires: ['hasBattleWorldDepthContract', 'hasCampaignWorldDepthContract'] },
  ];
  const matches = [];
  for (const { file, requires } of files) {
    const source = await readFile(file, 'utf8');
    const label = file.pathname.replace(root, '');
    if (!/from\s+['"]\.\/_webgpu-contract\.mjs['"]/.test(source)) {
      matches.push(`${label}: production scenario must import the shared WebGPU contract helper`);
    }
    for (const name of requires) {
      const uses = source.match(new RegExp(`\\b${name}\\b`, 'g')) ?? [];
      if (uses.length < 2) matches.push(`${label}: missing ${name} assertion`);
    }
    if (/\bfunction\s+hasFramePhaseOrder\s*\(/.test(source)) {
      matches.push(`${label}: local phase-order helper is weaker than the shared depth-pass contract`);
    }
  }
  return matches.sort();
}

async function findFrameGraphVerifierFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const file = new URL('./_webgpu-contract.mjs', import.meta.url);
  const source = await readFile(file, 'utf8');
  const label = file.pathname.replace(root, '');
  const checks = [
    ['reads shared frame graph contract source', /packages\/webgpu-core\/src\/frameGraphContract\.ts/],
    ['exports shared frame phase kinds', /export\s+const\s+FRAME_PHASE_KINDS\s*=\s*readStringArrayConst\(FRAME_GRAPH_CONTRACT_SOURCE,\s*'FRAME_PHASE_KINDS'\)/],
    ['exports shared frame graph roles', /export\s+const\s+FRAME_GRAPH_PASS_ROLES\s*=\s*readStringArrayConst\(FRAME_GRAPH_CONTRACT_SOURCE,\s*'FRAME_GRAPH_PASS_ROLES'\)/],
    ['exports shared role phase map', /export\s+const\s+FRAME_GRAPH_ROLE_PHASES\s*=\s*readStringObjectConst\(FRAME_GRAPH_CONTRACT_SOURCE,\s*'FRAME_GRAPH_ROLE_PHASES'\)/],
    ['semantic role helper uses shared role phase map', /FRAME_GRAPH_ROLE_PHASES\[role\]\s*===\s*phase\.kind/],
  ];
  const matches = [];
  for (const [name, pattern] of checks) {
    if (!pattern.test(source)) matches.push(`${label}: missing ${name}`);
  }
  if (/role\s*===\s*['"]world-opaque['"]\s*\|\|/.test(source)) {
    matches.push(`${label}: hard-coded per-phase role union in scenario helper`);
  }
  return matches.sort();
}

async function findDepthContractFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const sourceRoots = [
    new URL('../../packages/webgpu-core/src/', import.meta.url),
    new URL('../../packages/game-renderer/src/', import.meta.url),
    new URL('../../apps/webgpu-lab/src/', import.meta.url),
  ];
  const allowed = new Set([
    new URL('../../packages/webgpu-core/src/depthContract.ts', import.meta.url).pathname,
  ]);
  const matches = [];
  for (const sourceRoot of sourceRoots) {
    for (const file of await tsFiles(sourceRoot)) {
      if (allowed.has(file.pathname)) continue;
      const source = await readFile(file, 'utf8');
      if (/['"]depth24plus['"]/.test(source)) {
        matches.push(`${file.pathname.replace(root, '')}: hard-coded depth24plus format`);
      }
      if (/export\s+type\s+\w*DepthMode\s*=\s*(?=[^;]*'read')(?=[^;]*'read-write')(?=[^;]*'write')[^;]*;/.test(source)) {
        matches.push(`${file.pathname.replace(root, '')}: redeclared depth mode union`);
      }
      if (/['"]worldDepth['"]/.test(source)) {
        matches.push(`${file.pathname.replace(root, '')}: hard-coded worldDepth attachment`);
      }
    }
  }
  return matches.sort();
}

async function findWorldMaterialContractFootguns() {
  const root = new URL('../../', import.meta.url).pathname;
  const files = [
    new URL('../../packages/webgpu-core/src/skinnedPipeline.ts', import.meta.url),
    new URL('../../packages/game-renderer/src/fixtures/nested3d.ts', import.meta.url),
    new URL('../../packages/game-renderer/src/campaign/entityPass.ts', import.meta.url),
    new URL('../../packages/game-renderer/src/campaign/sceneryPass.ts', import.meta.url),
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const label = file.pathname.replace(root, '');
    if (!/\bwebGpuOpaqueColorTarget\b/.test(source) || !/\bwebGpuWorldDepthStencil\b/.test(source)) {
      matches.push(`${label}: depth-writing world geometry must use the opaque world material contract`);
    }
    if (/\bdepthWriteEnabled:\s*true\b/.test(source)) {
      matches.push(`${label}: inline depth-write pipeline state bypasses the world material contract`);
    }
    if (/\bblend:\s*\{/.test(source)) {
      matches.push(`${label}: inline alpha blending is not allowed in depth-writing world geometry`);
    }
  }

  for (const file of [
    new URL('../../packages/game-renderer/src/campaign/entityPass.ts', import.meta.url),
    new URL('../../packages/game-renderer/src/campaign/sceneryPass.ts', import.meta.url),
  ]) {
    const source = await readFile(file, 'utf8');
    const label = file.pathname.replace(root, '');
    if (!/\bwebGpuAlphaBlendColorTarget\b/.test(source) || !/materialClasses:\s*\['opaque-depth-write',\s*'shadow-depth-read'\]/.test(source)) {
      matches.push(`${label}: shadows must be a named alpha depth-read material class, not part of opaque depth writes`);
    }
  }

  return matches.sort();
}

function countPixels(png) {
  let warmGround = 0;
  let blue = 0;
  let red = 0;
  let water = 0;
  let sky = 0;
  let gold = 0;
  let green = 0;
  let cloud = 0;
  let minimapDark = 0;
  let minimapBlue = 0;
  let minimapRed = 0;
  let minimapGold = 0;
  let nonBlank = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
      if (r + g + b > 60) nonBlank++;
      if (r > 100 && g > 90 && g < 190 && b < 150) warmGround++;
      if (b > 110 && r < 120 && g < 165) blue++;
      if (r > 130 && g < 125 && b < 125) red++;
      if (b > 115 && g > 110 && r < 150) water++;
      if (b > 170 && g > 160 && r > 130) sky++;
      if (r > 160 && g > 120 && b < 90) gold++;
      if (g > 145 && r < 130 && b < 130) green++;
      if (r > 170 && g > 175 && b > 165 && Math.abs(r - g) < 36 && Math.abs(g - b) < 44) cloud++;
      if (r < 45 && g < 45 && b < 40) minimapDark++;
      if (x < 240 && y > png.height - 210 && y < png.height - 8) {
        if (r < 45 && g < 45 && b < 40) minimapDark++;
        if (b > 130 && r < 130 && g > 80) minimapBlue++;
        if (r > 130 && g < 100 && b < 100) minimapRed++;
        if (r > 160 && g > 120 && b < 90) minimapGold++;
      }
    }
  }
  return { warmGround, blue, red, water, sky, gold, green, cloud, minimapDark, minimapBlue, minimapRed, minimapGold, nonBlank };
}

function pixelByteDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
  return diff;
}

function patchStats(png, sample, radius = 4) {
  const cx = Math.max(0, Math.min(png.width - 1, Math.round(sample.x)));
  const cy = Math.max(0, Math.min(png.height - 1, Math.round(sample.y)));
  let red = 0;
  let blue = 0;
  let tan = 0;
  let green = 0;
  let selectionGreen = 0;
  let gold = 0;
  let white = 0;
  let count = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(png.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(png.width - 1, cx + radius); x++) {
      const o = (y * png.width + x) * 4;
      const r = png.data[o], g = png.data[o + 1], b = png.data[o + 2];
      if (r > 135 && g < 95 && b < 95) red++;
      if (b > 120 && r < 110 && g < 140) blue++;
      if (r > 120 && g > 95 && g < 175 && b < 125) tan++;
      if (g > 135 && r < 120 && b < 120) green++;
      if (g > 135 && g > r + 20 && g > b + 45) selectionGreen++;
      if (r > 160 && g > 120 && b < 90) gold++;
      if (r > 190 && g > 190 && b > 165) white++;
      count++;
    }
  }
  return { x: cx, y: cy, count, red, blue, tan, green, selectionGreen, gold, white };
}

export async function run(ctx) {
  const privateCameraStructs = await findPrivateCameraStructs();
  ctx.check(
    'source: camera WGSL is single-sourced',
    privateCameraStructs.length === 0,
    JSON.stringify({ privateCameraStructs }),
  );
  const campaignDepthOnlyFootguns = await findCampaignDepthOnlyFootguns();
  ctx.check(
    'source: campaign model/decal/line passes expose one phase-specific draw path',
    campaignDepthOnlyFootguns.length === 0,
    JSON.stringify({ campaignDepthOnlyFootguns }),
  );
  const phaseBrandFootguns = await findPhaseBrandFootguns();
  ctx.check(
    'source: renderer draw methods require branded frame phases',
    phaseBrandFootguns.length === 0,
    JSON.stringify({ phaseBrandFootguns }),
  );
  const rawRenderPassEncoderFootguns = await findRawRenderPassEncoderFootguns();
  ctx.check(
    'source: renderer pass helpers avoid raw render-pass parameters',
    rawRenderPassEncoderFootguns.length === 0,
    JSON.stringify({ rawRenderPassEncoderFootguns }),
  );
  const adHocFrameCallbackFootguns = await findAdHocFrameCallbackFootguns();
  ctx.check(
    'source: live frame submission uses graph pass lists',
    adHocFrameCallbackFootguns.length === 0,
    JSON.stringify({ adHocFrameCallbackFootguns }),
  );
  const worldDepthPassMetadataFootguns = await findWorldDepthPassMetadataFootguns();
  ctx.check(
    'source: world-depth frame passes declare depth modes',
    worldDepthPassMetadataFootguns.length === 0,
    JSON.stringify({ worldDepthPassMetadataFootguns }),
  );
  const frameGraphRoleFootguns = await findFrameGraphRoleFootguns();
  ctx.check(
    'source: live frame passes declare semantic roles',
    frameGraphRoleFootguns.length === 0,
    JSON.stringify({ frameGraphRoleFootguns }),
  );
  const productionScenarioContractFootguns = await findProductionScenarioContractFootguns();
  ctx.check(
    'source: production scenarios assert shared WebGPU depth contracts',
    productionScenarioContractFootguns.length === 0,
    JSON.stringify({ productionScenarioContractFootguns }),
  );
  const frameGraphVerifierFootguns = await findFrameGraphVerifierFootguns();
  ctx.check(
    'source: scenario helpers derive frame roles from the shared contract',
    frameGraphVerifierFootguns.length === 0,
    JSON.stringify({ frameGraphVerifierFootguns }),
  );
  const depthContractFootguns = await findDepthContractFootguns();
  ctx.check(
    'source: WebGPU depth format and attachment are single-sourced',
    depthContractFootguns.length === 0,
    JSON.stringify({ depthContractFootguns }),
  );
  const worldMaterialContractFootguns = await findWorldMaterialContractFootguns();
  ctx.check(
    'source: depth-writing world geometry uses opaque material contracts',
    worldMaterialContractFootguns.length === 0,
    JSON.stringify({ worldMaterialContractFootguns }),
  );

  for (const [route, predicate] of routes) {
    const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, errorPrefix: `webgpu-${route}` });
    await page.goto(`${ctx.target}/webgpu/${route}`);
    const expectedRoute = route.split('?')[0];
    await page.waitForFunction((expected) =>
      window.__webgpuLabReady === true
      && window.__webgpuLabStats?.ok === true
      && window.__webgpuLabStats?.route === expected,
    expectedRoute, { timeout: 18000 });
    await page.waitForTimeout(280);
    const stats = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(`${route}: route stats satisfy contract`, predicate(stats), JSON.stringify(stats));
    const pixels = countPixels(PNG.sync.read(await page.screenshot()));
    ctx.check(`${route}: route rendered nonblank raw-WebGPU frame`, pixels.nonBlank > 200000 && pixels.warmGround > 8000, JSON.stringify(pixels));
    if (route === 'render-graph' || route === 'world-camera') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples;
      const lower = patchStats(canvasPng, samples.occludedLowerStandard);
      const upper = patchStats(canvasPng, samples.visibleUpperFlag);
      const frontRank = patchStats(canvasPng, samples.frontRankOverlap);
      ctx.check(
        `${route}: city volume occludes the lower planted standard`,
        lower.red <= 8 && lower.tan > 8,
        JSON.stringify({ lower, sample: samples.occludedLowerStandard }),
      );
      ctx.check(
        `${route}: inserted standard remains visible above the city`,
        upper.red > 12,
        JSON.stringify({ upper, sample: samples.visibleUpperFlag }),
      );
      ctx.check(
        `${route}: front battle rank wins overlapping depth`,
        frontRank.blue > 12 && frontRank.red <= 10,
        JSON.stringify({ frontRank, sample: samples.frontRankOverlap }),
      );
    }
    if (route === 'skinned-depth') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const front = patchStats(canvasPng, stats.stats.sample, 7);
      ctx.check(
        `${route}: front skinned soldier wins hostile cross-bucket draw order`,
        front.blue > 12 && front.red <= 10,
        JSON.stringify({ front, sample: stats.stats.sample, hostileDrawOrder: stats.stats.hostileDrawOrder }),
      );
    }
    if (route === 'battle-ground-cue-depth') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples;
      const covered = patchStats(canvasPng, samples.coveredCueUnderSoldier, 6);
      const exposed = patchStats(canvasPng, samples.exposedCueControl, 5);
      ctx.check(
        `${route}: skinned soldier occludes later-submitted ground cue`,
        covered.blue > 12 && covered.gold <= 8,
        JSON.stringify({ covered, sample: samples.coveredCueUnderSoldier, hostileDrawOrder: stats.stats.hostileDrawOrder }),
      );
      ctx.check(
        `${route}: late-submitted ground cue remains visible off the soldier`,
        exposed.gold > 12,
        JSON.stringify({ exposed, sample: samples.exposedCueControl }),
      );
    }
    if (route === 'battle-effect-overlay') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples;
      const overSoldier = patchStats(canvasPng, samples.effectOverSoldier, 5);
      const exposed = patchStats(canvasPng, samples.exposedEffectControl, 5);
      ctx.check(
        `${route}: overlay effect line remains visible over skinned soldier`,
        overSoldier.white > 12,
        JSON.stringify({ overSoldier, sample: samples.effectOverSoldier }),
      );
      ctx.check(
        `${route}: overlay effect control remains visible off the soldier`,
        exposed.white > 12,
        JSON.stringify({ exposed, sample: samples.exposedEffectControl }),
      );
    }
    if (route === 'campaign-model-gates?gate=city') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples.cityStandard;
      const lower = patchStats(canvasPng, samples.hiddenLowerCloth, 5);
      const upper = patchStats(canvasPng, samples.visibleUpperCloth, 6);
      ctx.check(
        `${route}: production city hides the lower embedded flag cloth`,
        lower.red <= 8 && lower.tan > 8,
        JSON.stringify({ lower, sample: samples.hiddenLowerCloth }),
      );
      ctx.check(
        `${route}: production city standard remains visible above the core`,
        upper.red > 12,
        JSON.stringify({ upper, sample: samples.visibleUpperCloth }),
      );
    }
    if (route === 'campaign-model-gates?gate=garrison-city') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples.garrison;
      const hidden = patchStats(canvasPng, samples.hiddenShieldInsideWall, 6);
      const visible = patchStats(canvasPng, samples.visibleStandardAboveRoofs, 6);
      ctx.check(
        `${route}: production city material occludes the garrisoned army body`,
        hidden.blue <= 8 && (hidden.tan + hidden.red) > 80,
        JSON.stringify({ hidden, sample: samples.hiddenShieldInsideWall }),
      );
      ctx.check(
        `${route}: garrisoned army standard remains visible above the city`,
        visible.blue > 12,
        JSON.stringify({ visible, sample: samples.visibleStandardAboveRoofs }),
      );
    }
    if (route === 'campaign-model-gates?gate=selected-city') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples.selectionDepth;
      const core = patchStats(canvasPng, samples.occludedByCityCore, 7);
      const ring = patchStats(canvasPng, samples.visibleOuterRing, 7);
      ctx.check(
        `${route}: city geometry occludes the ground selection marker`,
        core.selectionGreen <= 8 && (core.tan + core.red) > 120,
        JSON.stringify({ core, sample: samples.occludedByCityCore }),
      );
      ctx.check(
        `${route}: selected city marker remains visible outside the city volume`,
        ring.selectionGreen > 80,
        JSON.stringify({ ring, sample: samples.visibleOuterRing }),
      );
    }
    if (route === 'campaign-model-gates?gate=army') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples.selectionDepth;
      const core = patchStats(canvasPng, samples.occludedByArmyCore, 6);
      const ring = patchStats(canvasPng, samples.visibleOuterRing, 6);
      ctx.check(
        `${route}: army geometry occludes the ground selection marker`,
        core.selectionGreen <= 8 && (core.red + core.tan + core.blue) > 80,
        JSON.stringify({ core, sample: samples.occludedByArmyCore }),
      );
      ctx.check(
        `${route}: selected army marker remains visible outside the formation`,
        ring.selectionGreen > 80,
        JSON.stringify({ ring, sample: samples.visibleOuterRing }),
      );
    }
    if (route === 'campaign-model-gates?gate=hostile-depth-order') {
      const canvasPng = PNG.sync.read(await page.locator('#webgpu-canvas').screenshot());
      const samples = stats.stats.samples.hostileDepthOrder;
      const flag = patchStats(canvasPng, samples.flagOverLateTree, 6);
      const tree = patchStats(canvasPng, samples.lateTreeControl, 7);
      ctx.check(
        `${route}: nearer city flag survives later-submitted scenery bucket`,
        flag.red > 12 && flag.green <= 8,
        JSON.stringify({ flag, sample: samples.flagOverLateTree, hostileDrawOrder: stats.stats.hostileDrawOrder }),
      );
      ctx.check(
        `${route}: late-submitted scenery bucket is visible elsewhere`,
        tree.green >= 16,
        JSON.stringify({ tree, sample: samples.lateTreeControl }),
      );
    }
    if (route === 'assets') {
      await page.click('#asset-validate-json');
      await page.waitForFunction(() => window.__webgpuLabStats?.stats?.imported !== null, undefined, { timeout: 5000 });
      const imported = await page.evaluate(() => window.__webgpuLabStats);
      ctx.check(
        `${route}: imported manifest validates through the workbench UI`,
        imported.stats.imported?.ok === false && imported.stats.imported.errors > 0,
        JSON.stringify(imported.stats.imported),
      );
    }
    if (route.includes('crowd') || route === 'battle' || route.startsWith('battle-live') || route.startsWith('battle-ui') || route.startsWith('battle-input')) {
      ctx.check(`${route}: player and enemy accents visible`, pixels.blue > 10 && pixels.red > 10, JSON.stringify(pixels));
    }
    if (route.startsWith('battle-terrain')) {
      ctx.check(`${route}: Aegean water and nonblack sky visible`, pixels.water > 1200 && pixels.sky > 1200, JSON.stringify(pixels));
      ctx.check(`${route}: warm ground and terrain highlights visible`, pixels.warmGround > 8000 && pixels.gold > 250, JSON.stringify(pixels));
    }
    if (route.startsWith('campaign-map')) {
      ctx.check(
        `${route}: parchment map, territory, atmosphere, roads, and city pins are visible`,
        pixels.warmGround > 45000 && pixels.water > 4000 && pixels.cloud > 1500 && pixels.red > 1000 && pixels.minimapDark > 10000 && stats.stats.borderSegments > 100,
        JSON.stringify(pixels),
      );
      const domLabelCount = await page.locator('.webgpu-campaign-label').count();
      ctx.check(
        `${route}: campaign labels are rendered by the WebGPU glyph atlas`,
        stats.stats.labelLayer === 'raw-webgpu-glyph-atlas'
          && stats.stats.visibleLabels >= 8
          && stats.stats.labelVertices >= stats.stats.visibleLabels * 6
          && domLabelCount === 0,
        JSON.stringify({ labelLayer: stats.stats.labelLayer, visibleLabels: stats.stats.visibleLabels, labelVertices: stats.stats.labelVertices, labelAtlas: stats.stats.labelAtlas, domLabelCount }),
      );
    }
    if (route.startsWith('campaign-ui')) {
      const ui = await page.evaluate(() => ({
        armyPanel: document.querySelector('.webgpu-campaign-panel.army')?.textContent ?? '',
        cityPanel: document.querySelector('.webgpu-campaign-panel.city')?.textContent ?? '',
        diplomacyRows: document.querySelectorAll('.webgpu-campaign-panel.diplomacy .cmp-diplo-row').length,
        classRows: document.querySelectorAll('.webgpu-campaign-panel.classes .cmp-class-row').length,
        replenish: document.querySelector('#cmp-auto-replenish') !== null,
      }));
      ctx.check(
        `${route}: WebGPU campaign entities and selection colors are visible`,
        pixels.warmGround > 45000 && pixels.red > 700 && pixels.green > 250 && pixels.gold > 600,
        JSON.stringify(pixels),
      );
      ctx.check(
        `${route}: retained campaign panels are visible over WebGPU`,
        ui.armyPanel.includes('Army 0') && ui.cityPanel.includes('Roma') && ui.diplomacyRows >= 1 && ui.classRows >= 8 && ui.replenish && stats.stats.labelLayer === 'raw-webgpu-glyph-atlas' && stats.stats.visibleLabels >= 1,
        JSON.stringify({ ui, labels: { layer: stats.stats.labelLayer, visible: stats.stats.visibleLabels, vertices: stats.stats.labelVertices } }),
      );
      const armyTarget = await page.evaluate(() => {
        const debug = window.__webgpuCampaignUi;
        const army = debug.armies.find((a) => a.mine);
        if (!army) throw new Error('campaign-ui army missing');
        return debug.project(army.x, army.y);
      });
      await page.mouse.click(armyTarget.x, armyTarget.y);
      await page.waitForTimeout(120);
      const armyClicked = await page.evaluate(() => window.__webgpuLabStats);
      ctx.check(
        `${route}: canvas click selects the rendered army marker`,
        armyClicked.stats.selectedArmy === 0 && armyClicked.stats.lastPick.kind === 'army',
        JSON.stringify({ target: armyTarget, stats: armyClicked.stats.lastPick, selectedArmy: armyClicked.stats.selectedArmy }),
      );
      const cityTarget = await page.evaluate(() => window.__webgpuCampaignUi.project(-28, 450));
      await page.mouse.click(cityTarget.x, cityTarget.y);
      await page.waitForTimeout(120);
      const cityClicked = await page.evaluate(() => window.__webgpuLabStats);
      ctx.check(
        `${route}: canvas click opens the rendered city panel`,
        cityClicked.stats.selectedArmy === -1 && cityClicked.stats.selectedCity === 0 && cityClicked.stats.lastPick.kind === 'city',
        JSON.stringify({ target: cityTarget, stats: cityClicked.stats.lastPick, selectedCity: cityClicked.stats.selectedCity }),
      );
    }
    if (route.startsWith('battle-live') || route.startsWith('battle-ui') || route.startsWith('battle-input')) {
      ctx.check(`${route}: WebGPU ground cue visible`, pixels.gold > 250, JSON.stringify(pixels));
      ctx.check(
        `${route}: WebGPU minimap compositor visible`,
        stats.stats.minimap.units >= 10
          && pixels.minimapDark > 500
          && pixels.minimapBlue > 5
          && pixels.minimapRed > 5
          && pixels.minimapGold > 0,
        JSON.stringify({ stats: stats.stats.minimap, pixels }),
      );
    }
    if (route.startsWith('battle-ui')) {
      const ui = await page.evaluate(() => ({
        cards: document.querySelectorAll('.webgpu-unitcards .ucard').length,
        selectedCards: document.querySelectorAll('.webgpu-unitcards .ucard.sel').length,
        toolbarButtons: document.querySelectorAll('.webgpu-toolbar button').length,
        hudText: document.querySelector('.webgpu-battle-hud')?.textContent ?? '',
      }));
      ctx.check(
        `${route}: retained battle UI layer is visible over WebGPU`,
        ui.cards >= 8 && ui.selectedCards === 1 && ui.toolbarButtons >= 5 && ui.hudText.includes('raw WebGPU'),
        JSON.stringify(ui),
      );
    }
    await page.close();
  }

  for (const dpr of [1, 2]) {
    const route = 'battle-input?mode=5v5&ticks=36';
    const page = await ctx.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: dpr, errorPrefix: `webgpu-battle-input-dpr${dpr}` });
    await page.goto(`${ctx.target}/webgpu/${route}`);
    await page.waitForFunction(() => window.__webgpuLabReady === true && window.__webgpuBattleInput, undefined, { timeout: 18000 });
    await page.waitForTimeout(280);
    const unit = await frameBattleInputUnit(page);
    const target = await trueRenderedUnitScreen(page, unit);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(120);
    const clicked = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: left-click selects the rendered unit pixel`,
      clicked.stats.selectedUnits.includes(unit) && clicked.stats.lastPick.kind === 'click',
      JSON.stringify({ target, stats: clicked.stats.lastPick, selected: clicked.stats.selectedUnits }),
    );

    const target2 = await trueRenderedUnitScreen(page, unit);
    await page.mouse.move(target2.x - 60, target2.y - 38);
    await page.mouse.down();
    await page.mouse.move(target2.x + 60, target2.y + 38, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const boxed = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: drag-box selects the rendered unit pixel`,
      boxed.stats.selectedUnits.includes(unit) && boxed.stats.lastPick.kind === 'box' && boxed.stats.lastPick.boxUnits > 0,
      JSON.stringify({ target: target2, stats: boxed.stats.lastPick, selected: boxed.stats.selectedUnits }),
    );

    const orderTarget = await renderedWorldPoint(page, unit, -36, 18);
    await page.mouse.click(orderTarget.x, orderTarget.y, { button: 'right' });
    await page.waitForTimeout(120);
    const ordered = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: right-click issues a wasm move order`,
      ordered.stats.selectedOrder?.hasTarget
        && ordered.stats.lastOrder.kind === 'move'
        && ordered.stats.lastOrder.unit === unit
        && Math.hypot(ordered.stats.selectedOrder.targetX - orderTarget.worldX, ordered.stats.selectedOrder.targetY - orderTarget.worldY) < 1.5,
      JSON.stringify({ target: orderTarget, selectedOrder: ordered.stats.selectedOrder, lastOrder: ordered.stats.lastOrder }),
    );

    const zoomBefore = ordered.stats.camera.zoom;
    await page.mouse.move(orderTarget.x, orderTarget.y);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(120);
    const zoomed = await page.evaluate(() => window.__webgpuLabStats);
    ctx.check(
      `battle-input dpr${dpr}: wheel zoom updates the WebGPU camera`,
      zoomed.stats.camera.zoom > zoomBefore,
      JSON.stringify({ before: zoomBefore, after: zoomed.stats.camera.zoom }),
    );

    await page.evaluate(() => window.__webgpuBattleInput.freezeAtTick(72));
    const canvas = page.locator('#webgpu-canvas');
    const frozenA = await canvas.screenshot();
    await page.evaluate(() => window.__webgpuBattleInput.freezeAtTick(72));
    const frozenB = await canvas.screenshot();
    const frozenStats = await page.evaluate(() => window.__webgpuLabStats);
    const frozenPixelDiff = pixelByteDiff(PNG.sync.read(frozenA), PNG.sync.read(frozenB));
    ctx.check(
      `battle-input dpr${dpr}: freezeAtTick pins tick and pixels`,
      frozenStats.stats.ticks === 72 && frozenStats.stats.frozen === true && frozenPixelDiff === 0,
      JSON.stringify({ ticks: frozenStats.stats.ticks, frozen: frozenStats.stats.frozen, bytesA: frozenA.length, bytesB: frozenB.length, cmp: Buffer.compare(frozenA, frozenB), pixelByteDiff: frozenPixelDiff }),
    );
    await page.close();
  }
}

async function frameBattleInputUnit(page) {
  return page.evaluate(() => {
    const debug = window.__webgpuBattleInput;
    const unit = debug.units.find((u) => u.team === 0) ?? debug.units[0];
    if (!unit) throw new Error('battle-input has no units to frame');
    debug.setCamera({
      x: unit.x,
      y: unit.y,
      zoom: Math.max(debug.camera.zoom, 2.6),
    });
    return unit.unit;
  });
}

async function trueRenderedUnitScreen(page, unitId = null) {
  return page.evaluate((requestedUnit) => {
    const debug = window.__webgpuBattleInput;
    const c = debug.camera;
    const cv = document.getElementById('webgpu-canvas');
    const rect = cv.getBoundingClientRect();
    const project = (target) => {
      const cosP = Math.max(0.2, Math.cos(c.pitch || 0));
      const yawC = Math.cos(c.yaw || 0);
      const yawS = Math.sin(c.yaw || 0);
      const dx = target.x - c.x;
      const dy = target.y - c.y;
      const rx = dx * yawC + dy * yawS;
      const ry = -dx * yawS + dy * yawC;
      const canvasX = rx * c.zoom + c.width / 2;
      const canvasY = -ry * c.zoom * cosP + c.height / 2;
      return {
        unit: target.unit,
        team: target.team,
        x: rect.left + canvasX * (cv.clientWidth / cv.width),
        y: rect.top + canvasY * (cv.clientHeight / cv.height),
        canvasX,
        canvasY,
        dprWidth: cv.width,
        cssWidth: cv.clientWidth,
      };
    };
    let target = requestedUnit == null ? null : debug.units.find((u) => u.unit === requestedUnit);
    if (!target) {
      const margin = 80;
      const projected = debug.units.filter((u) => u.team === 0).map(project);
      const visible = projected.filter((p) =>
        p.x >= rect.left + margin
          && p.x <= rect.right - margin
          && p.y >= rect.top + margin
          && p.y <= rect.bottom - margin,
      );
      if (visible.length > 0) {
        return visible.sort((a, b) =>
          Math.hypot(a.x - (rect.left + rect.width / 2), a.y - (rect.top + rect.height / 2))
          - Math.hypot(b.x - (rect.left + rect.width / 2), b.y - (rect.top + rect.height / 2)),
        )[0];
      }
      target = debug.units
        .filter((u) => u.team === 0)
        .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    }
    if (!target) throw new Error(`unit ${requestedUnit ?? 'visible player'} missing`);
    return project(target);
  }, unitId);
}

async function renderedWorldPoint(page, unitId, dxWorld, dyWorld) {
  return page.evaluate(({ unit, dx, dy }) => {
    const debug = window.__webgpuBattleInput;
    const base = debug.units.find((u) => u.unit === unit);
    if (!base) throw new Error(`unit ${unit} missing`);
    const c = debug.camera;
    const cv = document.getElementById('webgpu-canvas');
    const rect = cv.getBoundingClientRect();
    const worldX = base.x + dx;
    const worldY = base.y + dy;
    const cosP = Math.max(0.2, Math.cos(c.pitch || 0));
    const yawC = Math.cos(c.yaw || 0);
    const yawS = Math.sin(c.yaw || 0);
    const relX = worldX - c.x;
    const relY = worldY - c.y;
    const rx = relX * yawC + relY * yawS;
    const ry = -relX * yawS + relY * yawC;
    const canvasX = rx * c.zoom + c.width / 2;
    const canvasY = -ry * c.zoom * cosP + c.height / 2;
    return {
      unit,
      worldX,
      worldY,
      x: rect.left + canvasX * (cv.clientWidth / cv.width),
      y: rect.top + canvasY * (cv.clientHeight / cv.height),
      canvasX,
      canvasY,
    };
  }, { unit: unitId, dx: dxWorld, dy: dyWorld });
}
