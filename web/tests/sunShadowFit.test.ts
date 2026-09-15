// @vitest-environment node
import { expect, test } from "vitest";
import * as THREE from "three";
import {
  fitSunShadowRect,
  fitSunShadowView,
} from "@packages/photoreal-renderer/src/landscape/sunShadow";

test("a moving shadow fit preserves sunlight and a world-stable texel grid", () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  sun.position.set(3, -4, 5);
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun, sun.target);
  const direction = sun.position.clone().normalize();
  const project = (x: number) => {
    fitSunShadowRect(sun, [x, -150, 400, 300], true);
    scene.updateMatrixWorld(true);
    sun.shadow.updateMatrices(sun);
    return new THREE.Vector3(20, 30, 0).project(sun.shadow.camera);
  };
  const before = project(-200);
  const after = project(-199);
  for (const key of ["x", "y"] as const) {
    const pixels = ((after[key] - before[key]) * sun.shadow.mapSize.x) / 2;
    expect(pixels).toBeCloseTo(Math.round(pixels), 8);
  }
  expect(
    sun.position.clone().sub(sun.target.position).normalize().distanceTo(direction),
  ).toBeLessThan(1e-12);
  for (const point of [
    [-199, -150, 0],
    [201, 150, 0],
    [0, 0, 40],
  ]) {
    const projected = new THREE.Vector3(...point).project(sun.shadow.camera);
    expect(Math.abs(projected.x)).toBeLessThan(1);
    expect(Math.abs(projected.y)).toBeLessThan(1);
    expect(Math.abs(projected.z)).toBeLessThan(1);
  }
});

test("panning across a map edge keeps shadow scale and world texels stable", () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  sun.position.set(3, -4, 5);
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun, sun.target);
  let previous: THREE.Vector3 | undefined;
  let extent: number | undefined;
  // The surface starts at x=0; the view moves from outside it into the map.
  for (const x of [-100, -1, 0, 1, 100]) {
    fitSunShadowView(sun, {
      target: [x, 40, 0],
      distance: 380,
      pitch: 0.8,
      yaw: -Math.PI / 2,
      fovY: 0.68,
      aspect: 1.5,
      near: 1,
      far: 8000,
    });
    scene.updateMatrixWorld(true);
    sun.shadow.updateMatrices(sun);
    const camera = sun.shadow.camera;
    const projected = new THREE.Vector3(20, 30, 0).project(camera);
    if (extent !== undefined) expect(camera.right - camera.left).toBeCloseTo(extent, 8);
    if (previous)
      for (const key of ["x", "y"] as const) {
        const pixels = (projected[key] - previous[key]) * 512;
        expect(pixels).toBeCloseTo(Math.round(pixels), 8);
      }
    extent = camera.right - camera.left;
    previous = projected;
  }
});
