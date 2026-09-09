// @vitest-environment node
import { expect, test } from "vitest";
import { Camera } from "../src/shared/camera";
import { minimapViewBounds } from "../src/battle/battleMinimap";

test("minimap retains its overview when downward corner rays miss finite terrain", () => {
  const camera = new Camera({ width: 1200, height: 700 } as HTMLCanvasElement);
  camera.setRig({ min: 0.4, max: 8 }, { width: 400, height: 300 });
  camera.zoom = 3;
  camera.groundSurface = { heightAt: () => 0, raycast: () => null };
  expect(camera.screenToWorld(0, 0)).toBeNull();
  expect(camera.screenToWorld(1200, 700)).toBeNull();
  const footprint = minimapViewBounds(camera, 1200, 700);
  expect(footprint).not.toBeNull();
  expect(footprint!.flat().every(Number.isFinite)).toBe(true);
  expect(
    Math.hypot(footprint![0][0] - footprint![1][0], footprint![0][1] - footprint![1][1]),
  ).toBeGreaterThan(400);
  // The presentation fallback must not manufacture ground orders.
  expect(camera.screenToWorld(0, 0)).toBeNull();
  camera.pitchAboutEye(-2);
  expect(minimapViewBounds(camera, 1200, 700)).toBeNull();
});
