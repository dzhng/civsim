// @vitest-environment node
import { expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";
import { createSoldierImpostorAtlas } from "@packages/soldier-assets/bake/impostors/atlas";
import { createPlaceholderSoldierMesh } from "@packages/soldier-assets/src/soldierMesh";
import { mat4Identity } from "@packages/soldier-assets/src/localPose";

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
        { table: new THREE.DataTexture(), images: {}, dispose() {} },
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
