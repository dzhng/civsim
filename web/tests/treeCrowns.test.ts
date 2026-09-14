import { describe, expect, it } from "vitest";
import { SCENERY_PROP_MODELS } from "../../packages/game-renderer/src/models/shared/sceneryPropRegistry";
import { PhotorealScenery } from "../../packages/photoreal-renderer/src/landscape/sceneryLayer";
import * as THREE from "three/webgpu";
import { applyCamera3d } from "../../packages/photoreal-renderer/src/cameraBridge";
import { chartCamera3d } from "../../packages/renderer-core/src/camera3d";

describe("shared tree crown coverage", () => {
  it("retains identical closed crown geometry when close leaf detail is added", () => {
    for (const kind of ["conifer", "broadleaf", "ash", "aspen", "bush"] as const) {
      for (const variant of [0, 1, 2]) {
        const crown = SCENERY_PROP_MODELS[kind].build("canopy", variant).opaque;
        const detail = SCENERY_PROP_MODELS[kind].build("leaves", variant).opaque;
        expect(Array.from(detail.vertices.subarray(0, crown.vertices.length))).toEqual(
          Array.from(crown.vertices),
        );
        expect(Array.from(detail.indices.subarray(0, crown.indices.length))).toEqual(
          Array.from(crown.indices),
        );
        expect(Array.from(crown.vertices).every(Number.isFinite)).toBe(true);
        expect(detail.indices.length).toBeGreaterThan(crown.indices.length);
      }
    }
  });
  it("selects close detail per tree and leaves steady frames unchanged", () => {
    const scene = new THREE.Scene(),
      scenery = new PhotorealScenery(scene);
    scenery.upload([
      { kind: "broadleaf", x: 0, y: 0, size: 3 },
      { kind: "broadleaf", x: 0, y: 0, size: 0.1 },
    ]);
    const camera = new THREE.PerspectiveCamera();
    applyCamera3d(camera, chartCamera3d({ x: 0, y: 0, zoom: 45, pitch: 0.55 }, 800));
    scenery.prepareRender(camera, 800);
    expect(scenery.stats().sceneryDetailed).toBe(1);
    const versions = scene.children.map(
      (child) =>
        ((child as THREE.Mesh).geometry.getAttribute("instStyle") as THREE.InstancedBufferAttribute)
          .version,
    );
    scenery.prepareRender(camera, 800);
    expect(
      scene.children.map(
        (child) =>
          (
            (child as THREE.Mesh).geometry.getAttribute(
              "instStyle",
            ) as THREE.InstancedBufferAttribute
          ).version,
      ),
    ).toEqual(versions);
    applyCamera3d(camera, chartCamera3d({ x: 0, y: 0, zoom: 12, pitch: 0.55 }, 800));
    scenery.prepareRender(camera, 800);
    expect(scenery.stats().sceneryDetailed).toBe(0);
    scenery.upload(
      Array.from({ length: 12 }, (_, i) => ({
        kind: "broadleaf" as const,
        x: i / 20,
        y: 0,
        size: 3,
      })),
    );
    applyCamera3d(camera, chartCamera3d({ x: 0, y: 0, zoom: 45, pitch: 0.55 }, 800));
    scenery.prepareRender(camera, 800);
    expect(scenery.stats().sceneryDrawCalls).toBe(2);
    scenery.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
