// @vitest-environment node
import { test, expect } from "vitest";
import { Matrix4, WebGPUCoordinateSystem } from "three";
import { orthographicReverseZ, transformVec4 } from "@packages/renderer-core/src/mat4";
import { singleShadowFit } from "@packages/game-renderer/src/battle/shadowPolicy";

test("orthographic shadow volume maps its physical near/far corners to reverse-Z clip bounds", () => {
  const m = orthographicReverseZ(-15, 25, 30, -10, 2, 1002);
  const close = transformVec4(m, [-15, -10, -2, 1]);
  const distant = transformVec4(m, [25, 30, -1002, 1]);
  close.forEach((v, i) => expect(v).toBeCloseTo([-1, -1, 1, 1][i], 6));
  distant.forEach((v, i) => expect(v).toBeCloseTo([1, 1, 0, 1][i], 6));
});

test("native whole-map shadow projection retains the source matrix at small and battle scale", () => {
  for (const rect of [
    [-20, -20, 40, 40],
    [-750, -500, 1500, 1000],
    [12, -37, 440, 360],
  ] as const) {
    const fit = singleShadowFit(rect, [0.6, 0, 0.8]);
    const native = orthographicReverseZ(
      fit.left,
      fit.right,
      fit.top,
      fit.bottom,
      fit.near,
      fit.far,
    );
    const source = new Matrix4().makeOrthographic(
      fit.left,
      fit.right,
      fit.top,
      fit.bottom,
      fit.near,
      fit.far,
      WebGPUCoordinateSystem,
      true,
    );
    expect(Array.from(native)).toEqual(Array.from(Float32Array.from(source.elements)));
  }
});
