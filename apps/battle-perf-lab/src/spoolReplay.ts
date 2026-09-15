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
export async function createSpoolReplay(inputsText: string) {
  const { assets, settings } = decodeReplayText<{
    assets: BattleReplayAssets;
    settings: BattleReplaySettings;
  }>(inputsText);
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `width:${settings.viewport.width}px;height:${settings.viewport.height}px`;
  document.body.replaceChildren(canvas);
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
      const result = await control.submit(captured.frame);
      sourceClock = captured.animationFrame;
      replayClock = control.animationFrame;
      let image: Blob | undefined;
      if (packet.selection.snapshot) {
        // Snapshot this submission immediately; only selected endpoints wait for encoding.
        image = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(Error("Replay snapshot failed"))),
            "image/png",
          ),
        );
      }
      return {
        selection: packet.selection,
        frameId: captured.frame.frameId,
        simTick: captured.frame.simTick,
        sourceAnimationFrame: captured.animationFrame,
        replayAnimationFrame: replayClock,
        source: captured.reference,
        replay: result.stats,
        image,
      };
    },
    dispose() {
      control.dispose();
      canvas.remove();
    },
  };
}
