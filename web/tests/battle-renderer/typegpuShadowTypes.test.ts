// @vitest-environment node
// The part of the conversion that has no runtime: what the TYPE CHECKER now
// rejects. Binding shapes and the receiver block are schemas here rather than
// byte counts, so these are the mistakes that can no longer reach a device.
//
// The assertion is `tsc -p web/tsconfig.json`: a `@ts-expect-error` that stops being an error fails it. The
// cases deliberately never execute — each one would be a GPU validation error.
import { expect, test, vi } from "vitest";
import { tgpu, d } from "typegpu";
import {
  SunCascade,
  SunShadow,
  shadowVisibility,
  sunSamplingLayout,
} from "../../../packages/battle-renderer/src/world/shadow";
import { SUN_SHADOW_BLOCK_FLOATS } from "../../../packages/battle-renderer/src/shaders/shadow";

const root = () =>
  tgpu.initFromDevice({
    device: { limits: {}, features: new Set(), queue: {} } as unknown as GPUDevice,
  });

/** Compiled, never called. Exported so nothing can drop it as dead code. */
export function rejectedByTheTypeChecker() {
  const r = root();
  const state = r.createBuffer(SunShadow).$usage("uniform");
  const depth = r
    .createTexture({ size: [4, 4, 2], format: "depth32float" })
    .$usage("render", "sampled");
  const array = depth.createView(d.textureDepth2dArray());
  const comparison = r.createComparisonSampler({ compare: "greater-equal" });

  // The shape that must keep compiling.
  r.createBindGroup(sunSamplingLayout, { sun: state, sunDepth: array, sunCompare: comparison });

  // @ts-expect-error a receiver without its depth array is not a receiver
  r.createBindGroup(sunSamplingLayout, { sun: state, sunCompare: comparison });

  r.createBindGroup(sunSamplingLayout, {
    // @ts-expect-error one cascade record is not the block every receiver reads
    sun: r.createBuffer(SunCascade).$usage("uniform"),
    sunDepth: array,
    sunCompare: comparison,
  });

  // @ts-expect-error the block is two records and a control vector, not one record
  state.write({ matrix: d.mat4x4f(), bias: d.vec4f(), interval: d.vec4f() });

  // The discarded single-map arity: no layer between the sampler and the matrix.
  // @ts-expect-error a cascade-array receiver must name the layer it reads
  shadowVisibility(array.$, comparison.$, d.mat4x4f(), d.vec4f(), d.vec3f(), d.vec3f(), d.vec2f());
}

test("the typed receiver block is the shared block, and a record is only part of it", () => {
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 64, COPY_DST: 8, COPY_SRC: 4 });
  expect(d.sizeOf(SunShadow)).toBe(SUN_SHADOW_BLOCK_FLOATS * 4);
  expect(d.sizeOf(SunCascade)).toBeLessThan(d.sizeOf(SunShadow));
  vi.unstubAllGlobals();
});
