// @vitest-environment node
import { expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";
import {
  createSoldierImpostorAtlas,
  OctahedralImpostorLayer,
} from "@packages/photoreal-renderer/src/battle/impostorLayer";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { createPlaceholderSoldierMesh } from "@packages/soldier-assets/src/soldierMesh";
import { mat4Identity } from "@packages/soldier-assets/src/localPose";

test("far views use the same facing basis as the skinned mesh and its offset anchor", () => {
  const scene = new THREE.Scene();
  const dispose = vi.fn();
  const layer = new OctahedralImpostorLayer(scene, {
    textures: {
      albedo: new THREE.Texture(),
      normal: new THREE.Texture(),
      orm: new THREE.Texture(),
    },
    dispose,
    metrics: { allocatedBytes: 0, bakeMs: 0, drawCalls: 1 },
    tileSize: 96,
    columns: 2,
    rows: 1,
    worldSpan: 4,
    center: new THREE.Vector3(0.4, 0, 1),
    directions: [new THREE.Vector3(0, -1, 1).normalize(), new THREE.Vector3(-1, 0, 1).normalize()],
  });
  try {
    const instance = { ...generatedFormation(1)[0], x: 0, y: 0, facing: Math.PI / 2, elevation: 0 };
    layer.upload([instance]);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, -10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    layer.setCamera(camera);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.geometry.getAttribute("impostorInst").getX(0)).toBeCloseTo(0.4);
    // Facing pi/2 is the mesh's unrotated pose, so the camera sees its -Y side.
    expect(mesh.geometry.getAttribute("impostorMeta").getX(0)).toBe(0);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    expect(mesh.geometry.getAttribute("impostorMeta").getW(0)).toBe(0);
    expect(mesh.geometry.getAttribute("impostorLiving").getX(0)).toBe(1);
    layer.upload([{ ...instance, facing: Math.PI, alive: false }]);
    layer.setCamera(camera);
    expect(mesh.geometry.getAttribute("impostorMeta").getW(0)).toBeCloseTo(Math.PI / 2);
    expect(mesh.geometry.getAttribute("impostorInst").getY(0)).toBeCloseTo(0.4);
    expect(mesh.geometry.getAttribute("impostorLiving").getX(0)).toBe(0);
  } finally {
    layer.dispose();
  }
  expect(dispose).toHaveBeenCalledTimes(1);
});

test.each(["render", "falsy render", "GPU validation", "scope rejection"])(
  "%s failure rejects atlas admission and restores the caller's render state",
  async (failure) => {
    const target = new THREE.RenderTarget(8, 8);
    const mrt = {};
    let activeTarget: THREE.RenderTarget | null = target,
      activeMrt: unknown = mrt;
    let color = new THREE.Color(0.2, 0.3, 0.4),
      alpha = 0.37;
    const renderer = {
      backend: {
        device: {
          pushErrorScope: vi.fn(),
          popErrorScope: vi.fn(async () => {
            // Scope removal happens only after the bake has restored the caller.
            expect(activeTarget).toBe(target);
            expect(activeMrt).toBe(mrt);
            expect(renderer.autoClear).toBe(true);
            if (failure === "scope rejection") throw new Error("deliberate scope rejection");
            return failure === "GPU validation" ? { message: "deliberate GPU validation" } : null;
          }),
        },
      },
      init: async () => {},
      autoClear: true,
      getRenderTarget: () => activeTarget,
      getActiveCubeFace: () => 2,
      getActiveMipmapLevel: () => 1,
      getMRT: () => activeMrt,
      getClearColor: (out: THREE.Color) => out.copy(color),
      getClearAlpha: () => alpha,
      setRenderTarget: vi.fn((value: THREE.RenderTarget | null) => {
        activeTarget = value;
      }),
      setMRT: (value: unknown) => {
        activeMrt = value;
      },
      setClearColor: (value: THREE.ColorRepresentation, a: number) => {
        color = new THREE.Color(value);
        alpha = a;
      },
      clear: vi.fn(),
      render: () => {
        if (failure === "falsy render") throw 0;
        if (failure === "render") throw new Error("deliberate render failure");
      },
    };
    const disposed = vi.spyOn(THREE.RenderTarget.prototype, "dispose");
    try {
      const mesh = createPlaceholderSoldierMesh();
      const palette = new Float32Array((Math.max(...mesh.joints) + 1) * 16);
      for (let offset = 0; offset < palette.length; offset += 16)
        palette.set(mat4Identity(), offset);
      const preparation = createSoldierImpostorAtlas(
        renderer as unknown as THREE.WebGPURenderer,
        mesh,
        palette,
        { table: new THREE.DataTexture(), images: {}, stats: [], dispose() {} },
      );
      if (failure === "falsy render") await expect(preparation).rejects.toBe(0);
      else await expect(preparation).rejects.toThrow(`deliberate ${failure}`);
      expect(activeTarget).toBe(target);
      expect(activeMrt).toBe(mrt);
      expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(target, 2, 1);
      expect(color.toArray()).toEqual([0.2, 0.3, 0.4]);
      expect(alpha).toBe(0.37);
      expect(renderer.autoClear).toBe(true);
      expect(disposed).toHaveBeenCalledTimes(1);
      expect(renderer.backend.device.pushErrorScope.mock.calls.map((call) => call[0])).toEqual([
        "out-of-memory",
        "internal",
        "validation",
      ]);
      expect(renderer.backend.device.popErrorScope).toHaveBeenCalledTimes(3);
    } finally {
      disposed.mockRestore();
      target.dispose();
    }
  },
);
