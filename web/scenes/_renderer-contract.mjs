import { readFileSync } from "node:fs";

const DEPTH_CONTRACT_SOURCE = readFileSync(
  new URL("../../packages/renderer-core/src/depthContract.ts", import.meta.url),
  "utf8",
);
const FRAME_GRAPH_CONTRACT_SOURCE = readFileSync(
  new URL("../../packages/renderer-core/src/frameGraphContract.ts", import.meta.url),
  "utf8",
);
const CAMERA_UNIFORM_SOURCE = readFileSync(
  new URL("../../packages/renderer-core/src/cameraUniform.ts", import.meta.url),
  "utf8",
);
const PHOTOREAL_STATS_SOURCE = readFileSync(
  new URL("../../packages/photoreal-renderer/src/stats.ts", import.meta.url),
  "utf8",
);

// The ONE engine-wide depth format is reverse-Z depth32float.
export const GPU_DEPTH_FORMAT = readDepthConst("GPU_DEPTH_FORMAT");
export const GPU_WORLD_DEPTH_ATTACHMENT = readDepthConst("GPU_WORLD_DEPTH_ATTACHMENT");
// The single projection/depth identity every renderer surface must report.
export const PROJECTION_IDENTITY = readSourceStringConst(
  CAMERA_UNIFORM_SOURCE,
  "PROJECTION_IDENTITY",
  "shared camera uniform contract",
);
// Retained photoreal lab routes declare their own ownership identity.
export const PHOTOREAL_SUBSTRATE = readSourceStringConst(
  PHOTOREAL_STATS_SOURCE,
  "PHOTOREAL_SUBSTRATE",
  "photoreal stats seam",
);
export const PHOTOREAL_PROJECTION = readSourceStringConst(
  PHOTOREAL_STATS_SOURCE,
  "PHOTOREAL_PROJECTION",
  "photoreal stats seam",
);
export const GPU_DEPTH_MODES = readDepthModes();
export const FRAME_PHASE_KINDS = readStringArrayConst(
  FRAME_GRAPH_CONTRACT_SOURCE,
  "FRAME_PHASE_KINDS",
);
export const FRAME_GRAPH_PASS_ROLES = readStringArrayConst(
  FRAME_GRAPH_CONTRACT_SOURCE,
  "FRAME_GRAPH_PASS_ROLES",
);
export const FRAME_GRAPH_ROLE_PHASES = readStringObjectConst(
  FRAME_GRAPH_CONTRACT_SOURCE,
  "FRAME_GRAPH_ROLE_PHASES",
);
export const FRAME_GRAPH_DEPTH_ROLES = readStringObjectConst(
  FRAME_GRAPH_CONTRACT_SOURCE,
  "FRAME_GRAPH_DEPTH_ROLES",
);

function readDepthConst(name) {
  return readSourceStringConst(DEPTH_CONTRACT_SOURCE, name, "shared WebGPU depth contract");
}

function readSourceStringConst(source, name, label) {
  const match = source.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*['"]([^'"]+)['"]`));
  if (!match) throw new Error(`Unable to read ${name} from ${label}`);
  return match[1];
}

function readDepthModes() {
  const match = DEPTH_CONTRACT_SOURCE.match(
    /export\s+const\s+GPU_DEPTH_MODES\s*=\s*\[([^\]]+)\]\s+as\s+const/,
  );
  if (!match) throw new Error("Unable to read GPU_DEPTH_MODES from shared WebGPU depth contract");
  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g), (mode) => mode[1]);
}

function readStringArrayConst(source, name) {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`),
  );
  if (!match) throw new Error(`Unable to read ${name} from shared WebGPU frame graph contract`);
  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g), (item) => item[1]);
}

function readStringObjectConst(source, name) {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s+as\\s+const`),
  );
  if (!match) throw new Error(`Unable to read ${name} from shared WebGPU frame graph contract`);
  const out = {};
  for (const item of match[1].matchAll(/['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g)) {
    out[item[1]] = item[2];
  }
  return out;
}

export function hasFramePhaseOrder(phases, options = {}) {
  const kinds = Array.isArray(phases) ? phases.map((phase) => phase?.kind) : [];
  const background = kinds.indexOf("background");
  const world = kinds.indexOf("world-depth");
  const overlay = kinds.indexOf("overlay");
  return (
    background === 0 &&
    world > background &&
    (overlay >= 0 ? overlay > world : options.requireOverlay !== true)
  );
}

export function hasFramePass(phases, id, kind = null) {
  return (
    Array.isArray(phases) &&
    phases.some(
      (phase) =>
        (kind === null || phase?.kind === kind) &&
        Array.isArray(phase?.passIds) &&
        phase.passIds.includes(id),
    )
  );
}

export function hasFramePassRole(phases, id, role, kind = null) {
  return (
    Array.isArray(phases) &&
    phases.some(
      (phase) =>
        (kind === null || phase?.kind === kind) &&
        Array.isArray(phase?.passRoles) &&
        phase.passRoles.some((pass) => pass?.id === id && pass?.role === role),
    )
  );
}

export function hasFrameDepthPass(phases, id, mode) {
  return (
    Array.isArray(phases) &&
    phases.some(
      (phase) =>
        phase?.kind === "world-depth" &&
        Array.isArray(phase?.depthPasses) &&
        phase.depthPasses.some((pass) => pass?.id === id && pass?.mode === mode),
    )
  );
}

// Production battle reports installed TypeGPU ownership and the last presented
// frame. Seating is an explicit inspection; routine stats never scan the army.
export function hasBattleWorldDepthContract(renderStats) {
  return (
    renderStats?.ready === true &&
    renderStats?.substrate === "typegpu" &&
    renderStats?.projection === "camera3d" &&
    typeof renderStats?.environment === "string" &&
    renderStats.environment.length > 0 &&
    renderStats?.depth?.owner === "typegpu-battle-frame" &&
    renderStats.depth.installed === true &&
    renderStats.depth.format === GPU_DEPTH_FORMAT &&
    renderStats.depth.reversed === true &&
    renderStats.depth.width > 0 &&
    renderStats.depth.height > 0 &&
    renderStats.depth.requestedBytes > 0 &&
    renderStats?.presentedFrameId > 0 &&
    renderStats?.camera?.camera3d != null &&
    renderStats?.tacticalLines?.groundCues != null &&
    renderStats?.tacticalLines?.effects != null &&
    Number.isFinite(renderStats?.drawCalls) &&
    renderStats.drawCalls > 0 &&
    renderStats.drawCallsUnavailable === null
  );
}

/** A whole-population measurement belongs to the frame that presented this
 * admitted pose and terrain, not to whichever frame happens to be latest. */
export function hasBattleSeatingInspection(inspection) {
  const measurement = inspection?.measurement;
  const identity = inspection?.presented;
  return (
    inspection?.unavailable === null &&
    inspection.presentedFrameId > 0 &&
    inspection.expectedSoldiers > 0 &&
    measurement?.checked === inspection.expectedSoldiers &&
    measurement.matches === true &&
    measurement.nonFinite === 0 &&
    Number.isFinite(measurement.worstDelta) &&
    measurement.worstDelta <= measurement.tolerance &&
    identity != null &&
    ["crowdGeneration", "submission", "terrainGeneration"].every(
      (key) => Number.isInteger(identity[key]) && identity[key] === inspection.installed?.[key],
    )
  );
}

export function hasCampaignWorldDepthContract(stats) {
  return (
    stats?.ready === true &&
    stats?.substrate === PHOTOREAL_SUBSTRATE &&
    stats?.projection === PHOTOREAL_PROJECTION &&
    stats?.depth?.owner === "three-webgpu" &&
    stats?.depth?.reversed === true &&
    stats?.physicalWorld?.terrain?.allocationBytes > 0 &&
    stats?.physicalWorld?.geography != null &&
    stats?.drawCalls > 0
  );
}
