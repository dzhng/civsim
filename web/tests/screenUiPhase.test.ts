import { expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { CampaignLabelLayer } from "@packages/photoreal-renderer/src/campaign/labelLayer";
import { CampaignMarkerLayer } from "@packages/photoreal-renderer/src/campaign/markerLayer";

// These fakes pin requested state/order and restoration. Actual attachment,
// sample count, colors and draw totals are established by the GPU control.
const gpu = vi.hoisted(() => ({
  renders: [] as {
    scene: string;
    toneMapping: number;
    colorSpace: string;
    autoClear: boolean;
    outputTarget: unknown;
    renderTarget: unknown;
  }[],
}));

vi.mock("three/webgpu", async (original) => {
  const actual = await original<typeof import("three/webgpu")>();
  return {
    ...actual,
    WebGPURenderer: class {
      backend = {
        trackTimestamp: false,
        hasTimestamp: false,
        timestampQueryPool: { render: null, compute: null },
      };
      shadowMap = {};
      info = { render: { drawCalls: 0, triangles: 0, timestamp: 0 }, compute: { timestamp: 0 } };
      toneMapping = actual.NoToneMapping;
      outputColorSpace = actual.SRGBColorSpace;
      autoClear = true;
      dispose = vi.fn();
      private outputTarget: unknown = null;
      private renderTarget: unknown = null;
      private width = 1280;
      private height = 800;
      private pixelRatio = 1;
      setOpaqueSort() {}
      setTransparentSort() {}
      async init() {}
      setPixelRatio(value: number) {
        this.pixelRatio = value;
      }
      setSize(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getDrawingBufferSize(target: THREE.Vector2) {
        return target.set(this.width * this.pixelRatio, this.height * this.pixelRatio).floor();
      }
      setOutputRenderTarget(target: unknown) {
        this.outputTarget = target;
      }
      getOutputRenderTarget() {
        return this.outputTarget;
      }
      setRenderTarget(target: unknown) {
        this.renderTarget = target;
      }
      getRenderTarget() {
        return this.renderTarget;
      }
      render(scene: THREE.Object3D) {
        gpu.renders.push({
          scene: scene.name,
          toneMapping: this.toneMapping,
          colorSpace: this.outputColorSpace,
          autoClear: this.autoClear,
          outputTarget: this.outputTarget,
          renderTarget: this.renderTarget,
        });
        // Pinned Three leaves an explicit graded output target bound.
        if (this.outputTarget !== null && this.toneMapping !== actual.NoToneMapping)
          this.renderTarget = this.outputTarget;
        this.info.render.drawCalls += 1;
        this.info.render.triangles += 2;
      }
    },
  };
});

function member(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicNodeMaterial());
  mesh.name = name;
  return mesh;
}

async function createWorld(): Promise<PhotorealWorld> {
  gpu.renders.length = 0;
  const world = await PhotorealWorld.create(document.createElement("canvas"));
  world.scene.name = "world";
  return world;
}

test("the world and UI request the shared target, then restore both selectors before copying", async () => {
  const world = await createWorld();
  world.screenUi.add(member("label-glyphs"));
  world.render(new THREE.PerspectiveCamera());

  expect(gpu.renders.map((render) => render.scene)).toEqual([
    "world",
    "photoreal-screen-ui",
    "photoreal-screen-ui-display-copy",
  ]);
  const [worldRender, uiRender, copyRender] = gpu.renders;
  // The world keeps the ONE engine tone map and the display colour space, so
  // three still grades it — into the phase's target rather than the canvas.
  expect(worldRender).toMatchObject({
    toneMapping: THREE.AgXToneMapping,
    colorSpace: THREE.SRGBColorSpace,
    autoClear: true,
  });
  // The UI sees neither, so three renders it straight into that same graded
  // attachment — no clear, no second tone map. Sharing the attachment, not
  // autoClear, is what keeps the world underneath.
  expect(uiRender).toMatchObject({
    toneMapping: THREE.NoToneMapping,
    colorSpace: THREE.ColorManagement.workingColorSpace,
    autoClear: false,
  });
  expect(uiRender.outputTarget).toBe(worldRender.outputTarget);
  expect(uiRender.renderTarget).toBe(worldRender.outputTarget);
  expect(copyRender.renderTarget).toBeNull();
  expect(worldRender.outputTarget).not.toBeNull();
  // Only the copy addresses the canvas, and it must not be graded a second time.
  expect(copyRender).toMatchObject({
    toneMapping: THREE.NoToneMapping,
    colorSpace: THREE.ColorManagement.workingColorSpace,
    outputTarget: null,
  });
  expect(world.renderer.toneMapping).toBe(THREE.AgXToneMapping);
  expect(world.renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
  expect(world.renderer.autoClear).toBe(true);
  expect(world.renderer.getOutputRenderTarget()).toBeNull();
  expect(world.renderer.getRenderTarget()).toBeNull();
});

test("the output state is restored even when the screen draw throws", async () => {
  const world = await createWorld();
  world.screenUi.add(member("label-glyphs"));
  const render = vi.spyOn(world.renderer, "render").mockImplementation((scene) => {
    if (scene === world.scene) {
      world.renderer.setRenderTarget(world.renderer.getOutputRenderTarget());
      return;
    }
    expect(world.renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(world.renderer.autoClear).toBe(false);
    expect(world.renderer.getOutputRenderTarget()).not.toBeNull();
    throw new Error("device lost mid-frame");
  });
  expect(() => world.render(new THREE.PerspectiveCamera())).toThrow("device lost mid-frame");
  expect(render).toHaveBeenCalledTimes(2);
  expect(world.renderer.toneMapping).toBe(THREE.AgXToneMapping);
  expect(world.renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
  expect(world.renderer.autoClear).toBe(true);
  expect(world.renderer.getOutputRenderTarget()).toBeNull();
  expect(world.renderer.getRenderTarget()).toBeNull();
});

test("membership, not visibility, decides whether a frame is composed at all", async () => {
  // No members: the battle and every empty-screen route keep the bare world
  // frame — no attachment, no copy, nothing to go wrong.
  const bare = await createWorld();
  bare.render(new THREE.PerspectiveCamera());
  expect(gpu.renders.map((render) => render.scene)).toEqual(["world"]);
  expect(gpu.renders[0].outputTarget).toBeNull();
  expect(bare.stats()).toMatchObject({ drawCalls: 1, triangles: 2 });
  expect(bare.screenUi.stats()).toMatchObject({ members: 0, drawn: 0, display: null });

  // A member that is merely hidden still composes, so a layer toggling its mesh
  // never flips the world between two attachments mid-session.
  const hiding = await createWorld();
  const hidden = member("hidden-glyphs");
  hidden.visible = false;
  hiding.screenUi.add(hidden);
  hiding.render(new THREE.PerspectiveCamera());
  expect(gpu.renders.map((render) => render.scene)).toEqual([
    "world",
    "photoreal-screen-ui-display-copy",
  ]);
  expect(hiding.screenUi.stats()).toMatchObject({ members: 1, drawn: 0 });
});

test("the frame's draw stats count the screen phase and its copy instead of being reset by it", async () => {
  const world = await createWorld();
  world.screenUi.add(member("label-glyphs"));
  world.render(new THREE.PerspectiveCamera());
  // World draw + member draw + the one copy that hands the frame to the canvas.
  expect(world.stats()).toMatchObject({ drawCalls: 3, triangles: 6 });
  expect(world.screenUi.stats()).toMatchObject({
    owner: "screenUiPhase",
    drawn: 1,
    toneMapped: false,
    depth: "none",
    fog: "none",
    colorSpace: THREE.SRGBColorSpace,
    display: { width: 1280, height: 800, samples: 0, copyDraws: 1 },
  });
});

test("the shared attachment follows the drawing buffer and is released with the world", async () => {
  const world = await createWorld();
  world.screenUi.add(member("label-glyphs"));
  const camera = new THREE.PerspectiveCamera();
  world.render(camera);
  world.render(camera);
  const attachment = gpu.renders[0].outputTarget as THREE.RenderTarget;
  expect(world.screenUi.stats().display).toMatchObject({ width: 1280, height: 800 });

  world.resize(640, 480, 2);
  world.render(camera);
  expect(world.screenUi.stats().display).toMatchObject({ width: 1280, height: 960 });
  // Still the one attachment: every frame and every resize reuses it rather
  // than stranding a drawing-buffer-sized texture per frame.
  const attachments = new Set(gpu.renders.map((render) => render.outputTarget).filter(Boolean));
  expect([...attachments]).toEqual([attachment]);

  const dispose = vi.spyOn(attachment, "dispose");
  world.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(world.screenUi.stats().display).toBeNull();
});

test("the campaign screen layers join the screen phase and leave the world scene empty", async () => {
  const world = await createWorld();
  const labels = new CampaignLabelLayer(world.screenUi);
  const markers = new CampaignMarkerLayer(world.screenUi);
  expect(world.screenUi.stats().members).toBe(2);
  expect(world.scene.children).toEqual([]);
  labels.dispose();
  markers.dispose();
  expect(world.screenUi.stats().members).toBe(0);
});
