import { createReplayBackend, type ReplayBackend } from "./replayBackend";
import { createReplayControl } from "./replayControl";
import { beginGrassPublicationReplay } from "./CaptureGrassResidency";
import { decodeSpoolPacket, resolveSpoolGrassRecords } from "./spoolPacket";
import {
  decodeReplayText,
  hashLoadedAppearances,
  encodeReplayValue,
  hashReplayBlob,
} from "./replayArchive";
import type { BattleReplayAssets, BattleReplaySettings } from "./fixture";
import { loadAppearanceCatalog } from "../../../packages/soldier-assets/src/appearanceBundle";
import {
  loadImpostorAtlas,
  type ImpostorAtlasData,
} from "../../../packages/soldier-assets/src/impostorAtlas";
import { resolveBattleEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import { productionBladeFieldProfile } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import { battleMapByWasmId } from "../../../packages/game-renderer/src/battle/mapCatalog";
import {
  gradeStrengthForPreset,
  GRADE_SATURATION_BOOST,
  GRADE_CONTRAST,
  GRADE_SPLIT_TONE,
  GRADE_SHADOW_LIFT,
} from "../../../packages/game-renderer/src/environment/postParameters";
import { resolveDeviceCaps } from "../../../packages/renderer-core/src/capabilities";
import { hashPackedRecords } from "../../../packages/game-renderer/src/battle/bladeFieldRecordHash";
import { liveGrassRecords } from "../../../packages/battle-renderer/src/grassField";

/** Native replay shares the exact packet/resource decoder with the Three control.
 * One awaited packet at a time; no simulation or source recapture occurs here. */
export async function createSpoolReplay(
  inputsText: string,
  sink: string,
  resources: Record<string, { sha256: string }>,
  atlasCatalogUrl: string,
  backend: ReplayBackend,
) {
  const { assets, settings } = decodeReplayText<{
    assets: BattleReplayAssets;
    settings: BattleReplaySettings;
  }>(inputsText);
  const appearances = await loadAppearanceCatalog(
    new URL(assets.soldierCatalogUrl, location.href).href,
  );
  const atlasUrl = new URL(atlasCatalogUrl, location.href);
  const response = await fetch(atlasUrl);
  if (!response.ok) throw Error("Missing prepared atlas catalog");
  const catalog = await response.json();
  const atlases: Record<number, ImpostorAtlasData> = {};
  for (const id of Object.keys(appearances).map(Number)) {
    if (!catalog.appearances[id]) throw Error(`Missing prepared atlas ${id}`);
    atlases[id] = await loadImpostorAtlas(
      new URL(catalog.appearances[id], atlasUrl).href,
      appearances[id],
    );
  }
  const gpu = navigator.gpu;
  if (!gpu) throw Error("Native replay requires WebGPU");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw Error("Native replay requires WebGPU");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(settings.viewport.width * settings.viewport.pixelRatio);
  canvas.height = Math.floor(settings.viewport.height * settings.viewport.pixelRatio);
  canvas.style.cssText = `width:${settings.viewport.width}px;height:${settings.viewport.height}px`;
  document.body.replaceChildren(canvas);
  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    canvas.remove();
    throw Error("Missing native canvas context");
  }
  const format = gpu.getPreferredCanvasFormat();
  const environment = resolveBattleEnvironment(settings.environment).environment;
  let renderer: Awaited<ReturnType<typeof createReplayBackend>> | undefined;
  let control: Awaited<ReturnType<typeof createReplayControl>> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    control?.dispose();
    try {
      renderer?.dispose();
    } finally {
      context.unconfigure!();
      device.destroy();
      canvas.remove();
    }
  };
  try {
    if (backend !== "vgpu") context.configure({ device, format, alphaMode: "opaque" });
    beginGrassPublicationReplay();
    const terrainOptions = assets.terrainOptions;
    const cover =
      (terrainOptions.wasmMapId === undefined
        ? undefined
        : battleMapByWasmId(terrainOptions.wasmMapId)?.groundCover) ?? "green-grass";
    renderer = await createReplayBackend(backend, device, canvas, context, {
      assets: appearances,
      atlases,
      environment,
      terrain: {
        grid: assets.terrain,
        cover,
        vista: terrainOptions.vista ?? null,
        lakes: terrainOptions.lakeSurfaces ?? [],
        slopeBands: terrainOptions.slopeBands,
      },
      grassProfile: productionBladeFieldProfile(settings.grassQuality),
      width: canvas.width,
      height: canvas.height,
      samples: 1,
      outputFormat: format,
      shadows: settings.shadows !== "off",
      grass: settings.grass,
      farGrass: settings.farGrass,
      bloom: settings.bloom,
      post: settings.post,
      grade: {
        strength: gradeStrengthForPreset(environment.id),
        saturationBoost: GRADE_SATURATION_BOOST,
        contrast: GRADE_CONTRAST,
        splitTone: GRADE_SPLIT_TONE,
        shadowLift: GRADE_SHADOW_LIFT,
        ...settings.postGrade,
      },
    });
    control = await createReplayControl({
      submitPresentation: renderer.submitPresentation,
      waitForSubmittedWork: () => device.queue.onSubmittedWorkDone(),
      scene: renderer.scene,
      assets,
      settings,
      appearances,
    });
    const world = renderer.scene,
      backendRenderer = renderer,
      replay = control;
    const hashes = new WeakMap<Float32Array, string>();
    const recordHash = (records: Float32Array | null) => {
      if (!records) return "00000000";
      let hash = hashes.get(records);
      if (!hash) {
        hash = hashPackedRecords(records);
        hashes.set(records, hash);
      }
      return hash;
    };
    return {
      async identity() {
        const ground = encodeReplayValue(world.groundInputs());
        return {
          appearances: await hashLoadedAppearances(appearances),
          groundHash: await hashReplayBlob(ground),
          groundBytes: ground.size,
        };
      },
      async present(packetText: string) {
        if (disposed) throw Error("Native spool replay disposed");
        const { captured, selection } = await decodeSpoolPacket(packetText);
        const publications = await resolveSpoolGrassRecords(captured, sink, resources);
        let image: Promise<Blob> | undefined;
        const result = await replay.submit(
          captured.frame,
          publications,
          selection.snapshot
            ? () => {
                // vgpu submits before awaiting validation. Request the bitmap at that
                // boundary, while the presented canvas is still available.
                image = new Promise<Blob>((resolve, reject) =>
                  canvas.toBlob(
                    (b) => (b ? resolve(b) : reject(Error("Native replay snapshot failed"))),
                    "image/png",
                  ),
                );
              }
            : undefined,
        );
        const state = world.grassReplayState();
        const stats = world.stats();
        const pendingDiagnostics = selection.snapshot
          ? backendRenderer.readDiagnostics()
          : undefined;
        const cpuHashes = [liveGrassRecords(state.base), liveGrassRecords(state.ring)].map(
          recordHash,
        );
        const diagnostics = (await pendingDiagnostics) ?? [];
        const commands = diagnostics.map((layer) => layer.commands);
        const gpuHashes = diagnostics.map((layer) => hashPackedRecords(layer.records));
        const draws = selection.snapshot
          ? commands.flatMap((words, layer) =>
              ["near", "mid", "far"].flatMap((tier, t) => {
                const name = `battle-grass${layer ? "-ring" : ""}-blades-${tier}`;
                const part = layer ? state.ring : state.base;
                const command = Array.from(words.slice(t * 5, t * 5 + 5));
                return [
                  {
                    name,
                    visible:
                      part.visible &&
                      diagnostics[layer].recordCount > 0 &&
                      (t !== 2 || state.farVisible),
                    command,
                  },
                  ...(t < 2 ? [{ name: `${name}-depth-prepass`, visible: false, command }] : []),
                ];
              }),
            )
          : undefined;
        return {
          selection,
          frameId: captured.frame.frameId,
          simTick: captured.frame.simTick,
          sourceAnimationFrame: captured.animationFrame,
          replayAnimationFrame: result.counts.presentations,
          publications: publications.map((p) => ({
            baseRevision: p.state.base.revision,
            ringRevision: p.state.ring.revision,
            pending: p.stats.rebuild.pending,
            baseMask: p.state.base.mask,
            publishedLayers: Object.keys(p.records),
          })),
          source: captured.reference,
          replay: {
            camera: stats.camera,
            crowd: stats.crowd,
            terrain: { grass: { recordHash: cpuHashes.join("+"), ...stats.grass.residency } },
          },
          native: {
            backend,
            counts: result.counts,
            recordHashSource: "resolved owned records",
            gpuRecordHashes: gpuHashes,
            gpuRecordsMatch: selection.snapshot
              ? gpuHashes.every((h, i) => {
                  const records = i ? state.ring.records : state.base.records;
                  return (
                    diagnostics[i].recordCount === (records?.length ?? 0) / 16 &&
                    h === (records === null ? hashPackedRecords(new Float32Array()) : cpuHashes[i])
                  );
                })
              : null,
            errors: [...errors],
          },
          image: await image,
          draws,
        };
      },
      async finish() {
        await device.queue.onSubmittedWorkDone();
        return [...errors];
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
