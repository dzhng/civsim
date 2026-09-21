// @vitest-environment node
// What the receiver's sun-shadow entry point actually RESOLVES to. The typed
// bind group layout has to supply the shadow bindings — a depth ARRAY, the one
// 208-byte receiver block and the comparison sampler — and the inherited
// sampling body has to reach them by those names. Nothing here re-states the
// shading math: that stays the shared owner's, asserted against its own text.
import { expect, test } from "vitest";
import { tgpu } from "typegpu";
import { typegpuSunShadowSample } from "../../../packages/battle-renderer/src/world/environment";
import { CSM_CASCADES } from "../../../packages/game-renderer/src/battle/shadowPolicy";

const resolved = (mode: "single" | "csm") => tgpu.resolve([typegpuSunShadowSample(mode)]);

test("both modes bind the cascade depth array and one typed receiver block", () => {
  for (const mode of ["single", "csm"] as const) {
    const wgsl = resolved(mode);
    expect(wgsl).toMatch(/var \w+\s*:\s*texture_depth_2d_array\b/);
    expect(wgsl).toMatch(/var \w+\s*:\s*sampler_comparison\b/);
    // The bindings come from the typed layout, not a hand-written prelude.
    expect(wgsl).toMatch(/@group\(\d+\) @binding\(\d+\)/);
    // One block of two records, never a per-mode receiver struct.
    expect(wgsl).toMatch(new RegExp(`cascades\\s*:\\s*array<\\w+,\\s*${CSM_CASCADES}>`));
    // The caster's plain 2d depth map is gone from the receiver side entirely.
    expect(wgsl).not.toContain("texture_depth_2d>");
    expect(wgsl).not.toMatch(/:\s*texture_depth_2d\s*[;,)]/);
  }
});

test("the fitted single map samples layer 0 directly and High blends both layers", () => {
  // One PCF filter and one visibility function, whatever the mode: the layer is
  // an argument, so neither mode grows a second copy of the sampling math.
  for (const mode of ["single", "csm"] as const) {
    expect(resolved(mode).match(/fn shadowPcf\(/g)).toHaveLength(1);
    expect(resolved(mode).match(/fn shadowVisibility\(/g)).toHaveLength(1);
  }
  const single = resolved("single");
  expect(single).toMatch(/shadowVisibility\(sunDepth,sunCompare,0,/);
  expect(single).not.toContain("cascades[1]");
  // No blend, no view row, no near-plane read: the sole map is sampled directly.
  expect(single).not.toContain("environment.worldToView");
  expect(single).not.toContain("cam.znear");

  const high = resolved("csm");
  for (const layer of Array(CSM_CASCADES).keys())
    expect(high).toMatch(new RegExp(`shadowVisibility\\(sunDepth,sunCompare,${layer},`));
  // The blend reads the shared view row and near plane of the admitted frame.
  expect(high).toContain("environment.worldToView");
  expect(high).toContain("cam.znear");
  expect(high).toContain("sunShadow.control.x");
});
