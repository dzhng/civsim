import type { GrassRecordReference } from "./grassRecordChunks";
import {
  beginGrassPublicationReplay,
  queueGrassPublications,
  assertGrassPublicationsConsumed,
} from "./CaptureGrassResidency";
import { ThreeControl } from "./threeControl";
import {
  decodeReplayText,
  decodeReplayPoses,
  hashLoadedAppearances,
  hashReplayBlob,
  encodeReplayValue,
} from "./replayArchive";
import type { BattleReplayAssets, BattleReplaySettings } from "./fixture";
import type { CapturedReplayFrame } from "./CaptureBattleRenderer";

/** One decompressed packet at a time; actual command history stays on disk. */
export async function createSpoolReplay(
  inputsText: string,
  sink: string,
  resources: Record<string, { sha256: string }>,
  diagnostic = false,
) {
  const { assets, settings } = decodeReplayText<{
    assets: BattleReplayAssets;
    settings: BattleReplaySettings;
  }>(inputsText);
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `width:${settings.viewport.width}px;height:${settings.viewport.height}px`;
  document.body.replaceChildren(canvas);
  beginGrassPublicationReplay();
  const control = await ThreeControl.prepare(canvas, assets, settings);
  let sourceClock: number | null = null;
  let replayClock: number | null = null;
  return {
    async identity() {
      const appearances = await hashLoadedAppearances(control.soldierAssets);
      const ground = encodeReplayValue(control.groundInputs());
      return { appearances, groundHash: await hashReplayBlob(ground), groundBytes: ground.size };
    },
    async present(packetText: string) {
      const packet = JSON.parse(packetText);
      const poses = await decodeReplayPoses(
        packet.poses.map((pose: unknown) => new Blob([JSON.stringify(pose)])),
      );
      const captured = decodeReplayText<CapturedReplayFrame>(JSON.stringify(packet.frame), poses);
      if (captured.animationFrame !== sourceClock && control.animationFrame === replayClock)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      for (const publication of captured.grassPublications ?? []) {
        for (const layer of ["base", "ring"] as const) {
          const reference = publication.records[layer] as unknown as
            | GrassRecordReference
            | null
            | undefined;
          if (!reference) continue;
          if (
            !Number.isSafeInteger(reference.byteLength) ||
            reference.byteLength < 0 ||
            reference.byteLength > 128 * 1024 * 1024 ||
            reference.byteLength % 4
          )
            throw Error("Invalid grass resource length");
          const bytes = new Uint8Array(reference.byteLength);
          let offset = 0;
          for (let index = 0; index < reference.chunks; index++) {
            const id = `${reference.grassRecord}-${index}`;
            const response = await fetch(`${sink}/resource/${id}`);
            if (!response.ok) throw Error("Missing grass resource");
            const compressed = await response.blob();
            if ((await hashReplayBlob(compressed)) !== resources[id]?.sha256)
              throw Error("Grass resource hash changed");
            const chunk = await new Response(
              compressed.stream().pipeThrough(new DecompressionStream("gzip")),
            ).arrayBuffer();
            if (chunk.byteLength > 4 * 1024 * 1024 || offset + chunk.byteLength > bytes.length)
              throw Error("Grass resource chunk overflow");
            bytes.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
          if (offset !== bytes.length) throw Error("Grass resource is incomplete");
          publication.records[layer] = new Float32Array(bytes.buffer);
        }
      }
      if (!captured.grassPublications) throw Error("Recording has no resolved grass publications");
      queueGrassPublications(captured.grassPublications);
      const result = await control.submit(captured.frame);
      assertGrassPublicationsConsumed();
      sourceClock = captured.animationFrame;
      replayClock = control.animationFrame;
      let image: Blob | undefined;
      const draws = packet.selection.snapshot ? control.readGrassDraws() : undefined;
      if (packet.selection.snapshot) {
        // Snapshot this submission immediately; only selected endpoints wait for encoding.
        image = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(Error("Replay snapshot failed"))),
            "image/png",
          ),
        );
      }
      let localization;
      if (diagnostic && packet.selection.snapshot && packet.selection.window === "zoom-crossing") {
        const x = packet.selection.windowIndex === 0 ? 1500 : 1529,
          y = packet.selection.windowIndex === 0 ? 786 : 1105;
        const crop = async (blob: Blob) => {
          const bitmap = await createImageBitmap(blob);
          const target = document.createElement("canvas");
          target.width = 65;
          target.height = 65;
          const context = target.getContext("2d")!;
          context.drawImage(bitmap, x - 32, y - 32, 65, 65, 0, 0, 65, 65);
          bitmap.close();
          return {
            png: target.toDataURL("image/png").split(",")[1],
            pixel: Array.from(context.getImageData(32, 32, 1, 1).data),
          };
        };
        const snapshot = () =>
          new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(Error("Diagnostic snapshot failed"))),
              "image/png",
            ),
          );
        const original = await crop(image!);
        control.redrawPrepared(false);
        const repeated = await crop(await snapshot());
        control.redrawPrepared(true);
        const grassHidden = await crop(await snapshot());
        control.redrawPrepared(false);
        const prefix = packet.selection.windowIndex === 0 ? "battle-grass" : "battle-crowd";
        const objects = control.diagnosticObjects(prefix).filter((row) => row.visible);
        const attribution = [];
        // One object at a time, bounded by the production catalog and grass tier count.
        if (objects.length > 256) throw Error("Diagnostic object budget exceeded");
        for (const object of objects) {
          control.redrawExcluding([object.name]);
          const observation = await crop(await snapshot());
          if (observation.pixel.some((v, i) => v !== original.pixel[i]))
            attribution.push({ object, ...observation });
        }
        control.redrawExcluding([]);
        const restored = await crop(await snapshot());
        const grassStorage =
          packet.selection.windowIndex === 0 ? await control.inspectGrassStorage() : undefined;
        localization = {
          x,
          y,
          original,
          repeated,
          grassHidden,
          attribution,
          restored,
          grassStorage,
        };
      }
      return {
        localization,
        selection: packet.selection,
        frameId: captured.frame.frameId,
        simTick: captured.frame.simTick,
        sourceAnimationFrame: captured.animationFrame,
        replayAnimationFrame: replayClock,
        publications: captured.grassPublications.map((publication) => ({
          baseRevision: publication.state.base.revision,
          ringRevision: publication.state.ring.revision,
          pending: publication.stats.rebuild.pending,
          baseCircle: publication.state.base.circle,
          publishedLayers: Object.keys(publication.records),
        })),
        source: captured.reference,
        replay: result.stats,
        image,
        draws: await draws,
      };
    },
    dispose() {
      control.dispose();
      canvas.remove();
    },
  };
}
