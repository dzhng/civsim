import { createRawBattleScene } from "./battleScene";
import { PhotorealBattleWorld } from "../../../../packages/photoreal-renderer/src/battle/battleWorld";
import { loadAppearanceCatalog } from "../../../../packages/soldier-assets/src/appearanceBundle";
import {
  loadImpostorAtlas,
  type ImpostorAtlasData,
} from "../../../../packages/soldier-assets/src/impostorAtlas";
import { generatedFormation } from "../../../../packages/crowd-runtime/src/instanceData";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { productionBladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { resolveDeviceCaps } from "../../../../packages/renderer-core/src/capabilities";
import { trackTextureLifetime } from "../textureLifetimeCheck";
import { trackBufferLifetime } from "../bufferLifetimeCheck";
import type { BattleStandardInstance } from "../../../../packages/game-renderer/src/models/shared/battleStandardData";
import type { BattleReadoutInstance } from "../../../../packages/game-renderer/src/battle/readoutData";

async function run() {
  const release: (() => void)[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    release.push(() => x.dispose());
    return x;
  };
  let device: GPUDevice | undefined;
  const errors: string[] = [];
  try {
    const width = 1440,
      height = 900,
      ratio = 2;
    const atlasPath = new URLSearchParams(location.search).get("atlasCatalog");
    if (!atlasPath) throw Error("Scene control requires the prepared full atlas catalog URL");
    const atlasUrl = new URL(atlasPath, location.href);
    // A bounded full-catalog scene; live simulation and exact recorded replay are separate gates.
    const assets = await loadAppearanceCatalog(
      new URL("/assets/soldiers/catalog.json", location.href).href,
    );
    const catalog = await (await fetch(atlasUrl)).json();
    const atlases: Record<number, ImpostorAtlasData> = {};
    for (const id of Object.keys(assets).map(Number))
      atlases[id] = await loadImpostorAtlas(
        new URL(catalog.appearances[id], atlasUrl).href,
        assets[id],
      );
    const grid = {
      w: 100,
      h: 100,
      cell: 4,
      ox: -200,
      oy: -200,
      height: Float32Array.from(
        { length: 10000 },
        (_, i) => 2 + Math.sin((i % 100) / 17) * Math.cos(Math.floor(i / 100) / 21),
      ),
      tint: new Uint8Array(10000),
    };
    const sourceCanvas = document.createElement("canvas"),
      actualCanvas = document.createElement("canvas");
    document.body.append(sourceCanvas, actualCanvas);
    const source = own(
      await PhotorealBattleWorld.create(sourceCanvas, {
        environment: "golden-hour",
        shadows: "single",
      }),
    );
    source.resize(width, height, ratio);
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("WebGPU adapter unavailable");
    device = await adapter.requestDevice();
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const textures = trackTextureLifetime(device),
      buffers = trackBufferLifetime(device);
    release.push(textures.restore, buffers.restore);
    const caps = resolveDeviceCaps({
      adapterLimits: {
        maxBufferSize: device.limits.maxBufferSize,
        maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      },
      deviceFeatures: device.features,
      powerPreference: "default",
    });
    actualCanvas.width = width * ratio;
    actualCanvas.height = height * ratio;
    const context = actualCanvas.getContext("webgpu")!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
    release.push(() => context.unconfigure());
    const scene = own(
      await createRawBattleScene(device, caps, {
        environment: CIVSIM_ENVIRONMENTS.golden,
        assets,
        atlases,
        terrain: { grid, cover: "green-grass", vista: null, lakes: [] },
        grassProfile: productionBladeFieldProfile("standard"),
        width: width * ratio,
        height: height * ratio,
        samples: 1,
        outputFormat: format,
        shadows: true,
        grass: true,
        farGrass: true,
        bloom: true,
        post: true,
        grade: {
          strength: 1,
          saturationBoost: 1.15,
          contrast: 0.16,
          splitTone: 0.85,
          shadowLift: 1,
        },
      }),
    );
    // Start source residency only after both runtimes finish allocating resources.
    source.setTerrain(grid);
    const instances = Object.keys(assets)
      .map(Number)
      .flatMap((id, index) =>
        generatedFormation(778, {
          columns: 39,
          spacing: 1.1,
          x: ((index % 4) - 1.5) * 65,
          y: (Math.floor(index / 4) - 2) * 40,
          classId: id,
          faction: (index % 2) as 0 | 1,
          clip: assets[id].manifest.far.clip,
          phase: assets[id].manifest.far.phase,
          mounted: assets[id].manifest.mounted,
        }),
      );
    source.setStatic(
      Uint32Array.from({ length: instances.length }, (_, i) => Math.floor(i / 778)),
      Array.from({ length: 20 }, (_, i) => i % 2),
      Object.keys(assets).map(Number),
    );
    for (const instance of instances)
      instance.elevation = scene.seatingHeightAt(instance.x, instance.y);
    const standards: BattleStandardInstance[] = Array.from({ length: 20 }, (_, i) => {
      const x = ((i % 4) - 1.5) * 65,
        y = (Math.floor(i / 4) - 2) * 40;
      return {
        unitId: i,
        x,
        y,
        z: scene.heightAt(x, y),
        yaw: 0,
        scale: 1,
        factionId: i % 2 ? "crimson" : "azure",
        selected: i === 8,
      };
    });
    const lines = {
      groundCues: new Float32Array([-20, 0, 1, 0.8, 0.2, 1, 20, 0, 1, 0.8, 0.2, 1]),
      effects: new Float32Array([0, 0, 12, 1, 0.4, 0.1, 25, 20, 6, 1, 0.7, 0.2]),
      rings: new Float32Array([0, 0, 18, 1, 0.8, 0.2, 0.9]),
    };
    const attack = new Float32Array([
      -12, -8, 0.9, 0.2, 0.1, 0.3, 12, -8, 0.9, 0.2, 0.1, 0.3, 0, 10, 0.9, 0.2, 0.1, 0.3,
    ]);
    const results = [];
    for (const [label, distance, pitch] of [
      ["tactical", 150, 0.6],
      ["wide", 450, 0.5],
      ["horizon", 900, 0.15],
      ["far-lod", 3000, 0.45],
    ] as const) {
      const camera = {
        x: 0,
        y: 0,
        zoom: label === "tactical" ? 2 : 0.7,
        zoomT: 1,
        camera3d: {
          target: [0, 0, 3] as [number, number, number],
          distance,
          yaw: 0,
          pitch,
          fovY: Math.PI / 3,
          aspect: width / height,
          near: 0.5,
        },
      };
      source.setTime(0);
      source.drawInstances(instances, camera);
      const readouts: BattleReadoutInstance[] = standards.map((s) => ({
        unitId: s.unitId,
        x: s.x,
        y: s.y,
        z: s.z + 8,
        worldPerPx: 1 / source.pxPerWorldAt(s.x, s.y, s.z + 8),
        chips: [{ text: "Holding" }],
      }));
      source.uploadUnitReadouts(standards, readouts);
      source.drawTris(attack, camera);
      source.drawTacticalLines(lines, camera);
      const sourceInitial = sourceCanvas.toDataURL();
      const sourceInitialStats = source.stats();
      scene.uploadCrowd(instances, camera, 0);
      await scene.uploadReadouts(standards, readouts);
      scene.uploadTriangles(attack);
      scene.uploadTacticalLines(lines);
      const input = { camera, time: 0 };
      const present = async () => {
        await scene.prepare(input);
        const encoder = device!.createCommandEncoder();
        scene.encode(encoder, context.getCurrentTexture().createView());
        device!.queue.submit([encoder.finish()]);
        const image = actualCanvas.toDataURL();
        const stats = scene.stats();
        await device!.queue.onSubmittedWorkDone();
        return { image, stats };
      };
      const actualInitial = await present();
      results.push({
        label: `${label}-initial`,
        source: sourceInitial,
        actual: actualInitial.image,
        sourceStats: sourceInitialStats,
        actualStats: actualInitial.stats,
      });
      await source.settlePresentedFrame();
      source.render();
      const sourceSettled = sourceCanvas.toDataURL();
      const sourceSettledStats = source.stats();
      await scene.settleGrass();
      await present();
      // Both owners submit a settlement frame and an explicit stable capture frame.
      const actualSettled = await present();
      results.push({
        label: `${label}-settled`,
        source: sourceSettled,
        actual: actualSettled.image,
        sourceStats: sourceSettledStats,
        actualStats: actualSettled.stats,
      });
    }
    scene.dispose();
    const remaining = { textures: textures.liveCount(), buffers: buffers.liveCount() };
    return { results, errors, remaining, instances: instances.length, rankable: false };
  } finally {
    for (const fn of release.reverse()) fn();
    device?.destroy();
  }
}
run()
  .then((result) => Object.assign(window, { __sceneCheck: result }))
  .catch((error) => Object.assign(window, { __sceneCheck: { error: String(error) } }));
