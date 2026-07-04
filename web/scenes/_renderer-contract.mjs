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

// The ONE engine-wide depth format (reverse-Z depth32float since slice 05b).
export const GPU_DEPTH_FORMAT = readDepthConst("GPU_DEPTH_FORMAT");
export const GPU_WORLD_DEPTH_ATTACHMENT = readDepthConst("GPU_WORLD_DEPTH_ATTACHMENT");
// The single projection/depth identity every renderer surface must report.
export const PROJECTION_IDENTITY = readSourceStringConst(
  CAMERA_UNIFORM_SOURCE,
  "PROJECTION_IDENTITY",
  "shared camera uniform contract",
);
// The photoreal ownership identity (battle production since slice 08b).
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

const DEPTH_MODES = new Set(GPU_DEPTH_MODES);
const FRAME_PHASES = new Set(FRAME_PHASE_KINDS);
const FRAME_ROLES = new Set(FRAME_GRAPH_PASS_ROLES);

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

function hasDepthPassPlacement(phases) {
  return (
    Array.isArray(phases) &&
    phases.every((phase) => {
      const depthPasses = Array.isArray(phase?.depthPasses) ? phase.depthPasses : [];
      if (phase?.kind !== "world-depth") return depthPasses.length === 0;
      return depthPasses.every(
        (pass) => typeof pass?.id === "string" && DEPTH_MODES.has(pass?.mode),
      );
    })
  );
}

function hasSemanticPassRoles(phases) {
  return (
    Array.isArray(phases) &&
    phases.every((phase) => {
      if (!FRAME_PHASES.has(phase?.kind)) return false;
      const passIds = Array.isArray(phase?.passIds) ? phase.passIds : [];
      const passRoles = Array.isArray(phase?.passRoles) ? phase.passRoles : [];
      const roleById = new Map(passRoles.map((pass) => [pass?.id, pass?.role]));
      return passIds.every((id) => {
        const role = roleById.get(id);
        return FRAME_ROLES.has(role) && FRAME_GRAPH_ROLE_PHASES[role] === phase.kind;
      });
    })
  );
}

// Since slice 08b the production battle world renders on the photoreal
// substrate (three.js WebGPU + TSL behind BattleRenderer): depth is a real
// reverse-Z buffer owned by three, posed by camera3d through cameraBridge, and
// the bespoke frame-graph phase stats no longer exist for battle. The contract
// asserts the ownership identity fields (single owners, README "Photoreal
// ladder invariants"), the reverse-Z depth convention read off the live
// renderer, the heightfield seating firewall, and the tactical-line overlay
// seams. The bespoke phase-graph contract lives on for campaign
// (hasCampaignWorldDepthContract) until slice 16a.
export function hasBattleWorldDepthContract(renderStats) {
  return (
    renderStats?.ready === true &&
    renderStats?.substrate === PHOTOREAL_SUBSTRATE &&
    renderStats?.projection === PHOTOREAL_PROJECTION &&
    typeof renderStats?.environment === "string" &&
    renderStats.environment.length > 0 &&
    renderStats?.depth?.owner === "three-webgpu" &&
    renderStats?.depth?.reversed === true &&
    renderStats?.seating?.matches === true &&
    renderStats?.tacticalLines?.groundCues != null &&
    renderStats?.tacticalLines?.effects != null &&
    renderStats?.drawCalls > 0
  );
}

export function hasCampaignWorldDepthContract(stats) {
  return (
    stats?.cameraContract === "shared-world-camera-wgsl" &&
    stats?.depth?.allocated === true &&
    stats?.depth?.format === GPU_DEPTH_FORMAT &&
    hasFramePhaseOrder(stats?.phases, { requireOverlay: true }) &&
    hasDepthPassPlacement(stats?.phases) &&
    hasSemanticPassRoles(stats?.phases) &&
    hasFrameDepthPass(stats?.phases, "campaign-map-surface", "write") &&
    hasFramePassRole(stats?.phases, "campaign-map-surface", "world-depth-fill", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-territory-wash", "read") &&
    hasFramePassRole(stats?.phases, "campaign-territory-wash", "world-decal", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-scenery-opaque", "read-write") &&
    hasFramePassRole(stats?.phases, "campaign-scenery-opaque", "world-opaque", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-entities-opaque", "read-write") &&
    hasFramePassRole(stats?.phases, "campaign-entities-opaque", "world-opaque", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-standards-opaque", "read-write") &&
    hasFramePassRole(stats?.phases, "campaign-standards-opaque", "world-opaque", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-soldier-crowd", "read-write") &&
    hasFramePassRole(stats?.phases, "campaign-soldier-crowd", "world-opaque", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-scenery-shadows", "read") &&
    hasFramePassRole(stats?.phases, "campaign-scenery-shadows", "world-decal", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-entity-shadows", "read") &&
    hasFramePassRole(stats?.phases, "campaign-entity-shadows", "world-decal", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-standard-shadows", "read") &&
    hasFramePassRole(stats?.phases, "campaign-standard-shadows", "world-decal", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-soldier-shadows", "read") &&
    hasFramePassRole(stats?.phases, "campaign-soldier-shadows", "world-decal", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-roads", "read") &&
    hasFramePassRole(stats?.phases, "campaign-roads", "world-decal", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-sea-lanes-depth", "read") &&
    hasFramePassRole(stats?.phases, "campaign-sea-lanes-depth", "world-decal", "world-depth") &&
    hasFrameDepthPass(stats?.phases, "campaign-ground-selection", "read") &&
    hasFramePassRole(stats?.phases, "campaign-ground-selection", "world-decal", "world-depth") &&
    hasFramePass(stats?.phases, "campaign-clouds", "overlay") &&
    hasFramePassRole(stats?.phases, "campaign-clouds", "overlay-effect", "overlay") &&
    hasFramePass(stats?.phases, "campaign-markers", "overlay") &&
    hasFramePassRole(stats?.phases, "campaign-markers", "overlay-ui", "overlay") &&
    hasFramePass(stats?.phases, "campaign-labels", "overlay") &&
    hasFramePassRole(stats?.phases, "campaign-labels", "overlay-ui", "overlay")
  );
}
