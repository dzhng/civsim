// @vitest-environment node
import { test, expect } from "vitest";
import { PerspectiveCamera, WebGPUCoordinateSystem, Matrix4 } from "three/webgpu";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { battleSceneCamera } from "../../apps/battle-perf-lab/src/sceneCamera";

test("complete scene camera follows the source projection and billboard basis through a camera tour", () => {
  for (const pitch of [0.15, 0.6, 1.4])
    for (const distance of [45, 300, 900]) {
      const input = {
        x: 52,
        y: -31,
        zoom: 0.7,
        zoomT: 0.7,
        camera3d: {
          target: [120, -50, 38] as [number, number, number],
          distance,
          yaw: 0.8,
          pitch,
          fovY: Math.PI / 3,
          aspect: 1,
          near: 0.5,
        },
      };
      const data = battleSceneCamera(input, 2880, 1800, 23, CIVSIM_ENVIRONMENTS.golden);
      const source = new PerspectiveCamera();
      source.coordinateSystem = WebGPUCoordinateSystem;
      applyCamera3d(source, { ...input.camera3d, aspect: 2880 / 1800 });
      const vp = new Matrix4().multiplyMatrices(source.projectionMatrix, source.matrixWorldInverse);
      for (let i = 0; i < 16; i++) {
        expect(Math.abs(data.viewProjection[i] - vp.elements[i])).toBeLessThan(0.0002);
        expect(Math.abs(data.world[i] - source.matrixWorld.elements[i])).toBeLessThan(0.0002);
      }
      expect(data.observer).toEqual([52, -31, 0]);
      expect(data.snapshot.camera3d.target).toEqual([120, -50, 38]);
      expect(data.bytes[42]).toBe(23);
      expect(data.snapshot.width).toBe(2880);
      expect(data.snapshot.height).toBe(1800);
      for (let i = 0; i < 3; i++) {
        expect(data.impostor.right[i]).toBeCloseTo(source.matrixWorld.elements[i], 5);
        expect(data.impostor.up[i]).toBeCloseTo(source.matrixWorld.elements[i + 4], 5);
      }
    }
});
