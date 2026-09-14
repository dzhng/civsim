import type { LabContext } from "../../renderer-lab/src/labShell";
import type { BattleReplayAssets, BattleReplaySettings } from "./fixture";
import type { CapturedReplayFrame } from "./CaptureBattleRenderer";
import {
  encodeReplayValue,
  decodeReplayValue,
  hashLoadedAppearances,
  hashReplayBlob,
} from "./replayArchive";
import { loadReplayArchive, replayArchiveDownload } from "./captureStore";
import { ThreeControl } from "./threeControl";

export async function route(ctx: LabContext) {
  const archive = await loadReplayArchive();
  if (!archive) {
    ctx.status.textContent =
      "No capture saved. Open the actual game through the battle-perf-lab build, launch a battle from the menu, then use window.__battleCapture.start().";
    return;
  }
  if (!archive.frames.length) {
    ctx.status.textContent = "The saved capture contains no frames; record another short window.";
    return;
  }
  if (
    (await hashReplayBlob(archive.assets)) !== archive.manifest.assetsHash ||
    (await hashReplayBlob(archive.settings)) !== archive.manifest.settingsHash
  )
    throw new Error("Capture asset/settings hash mismatch");
  const assets = await decodeReplayValue<BattleReplayAssets>(archive.assets);
  const settings = await decodeReplayValue<BattleReplaySettings>(archive.settings);
  // Preserve the captured CSS viewport and physical drawing buffer even when the
  // lab sidebar leaves less room. Scrolling is preferable to changing the workload.
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const scroller = document.createElement("div");
  scroller.style.cssText = "overflow:auto;min-width:0;min-height:0";
  ctx.canvas.before(scroller);
  scroller.append(ctx.canvas);
  ctx.canvas.style.width = `${settings.viewport.width}px`;
  ctx.canvas.style.height = `${settings.viewport.height}px`;
  ctx.canvas.style.flex = "none";
  const poses: (readonly number[])[] = [];
  for (const [index, blob] of archive.poses.entries()) {
    if ((await hashReplayBlob(blob)) !== archive.manifest.poseHashes[index])
      throw new Error(`Pose ${index} hash mismatch`);
    poses.push(Object.freeze(await decodeReplayValue<number[]>(blob)));
  }
  const control = await ThreeControl.prepare(ctx.canvas, assets, settings);
  const replayGroundHash = await hashReplayBlob(encodeReplayValue(control.groundInputs()));
  if (replayGroundHash !== archive.manifest.groundHash) {
    control.dispose();
    throw new Error("Generated ground changed since capture");
  }
  let disposed = false;
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      control.dispose();
    }
  };
  window.addEventListener("pagehide", dispose, { once: true });
  try {
    const appearances = await hashLoadedAppearances(control.soldierAssets);
    if (appearances.hash !== archive.manifest.loadedAppearanceHash)
      throw new Error("Loaded appearance content changed since capture");
  } catch (error) {
    dispose();
    throw error;
  }
  const stats = document.createElement("pre");
  const next = document.createElement("button");
  next.textContent = "Replay window";
  const download = document.createElement("button");
  download.textContent = "Download capture and hashes";
  ctx.panel.append(next, download, stats);
  if (archive.referenceImage) {
    if ((await hashReplayBlob(archive.referenceImage)) !== archive.manifest.referenceImageHash) {
      dispose();
      throw new Error("Reference image hash mismatch");
    }
    const source = document.createElement("a");
    const sourceUrl = URL.createObjectURL(archive.referenceImage);
    source.href = sourceUrl;
    source.download = "battle-replay-source.png";
    source.textContent = `Download source image (frame ${archive.manifest.referenceFrameId})`;
    ctx.panel.append(source);
    window.addEventListener("pagehide", () => URL.revokeObjectURL(sourceUrl), { once: true });
  }
  let nextFrame = 0;
  let latestSummary: unknown;
  let triangleVertices = 0,
    readouts = 0,
    standards = 0;
  const showFrame = async (frameIndex: number) => {
    if (disposed) throw new Error("Replay route disposed");
    if (frameIndex === nextFrame - 1) return latestSummary;
    if (
      !Number.isInteger(frameIndex) ||
      frameIndex < nextFrame ||
      frameIndex >= archive.frames.length
    )
      throw new Error("Replay advances in captured order; reload to start again");
    let captured!: CapturedReplayFrame;
    let report!: Awaited<ReturnType<ThreeControl["render"]>>;
    while (nextFrame <= frameIndex) {
      const blob = archive.frames[nextFrame];
      if ((await hashReplayBlob(blob)) !== archive.manifest.frameHashes[nextFrame])
        throw new Error(`Capture frame ${nextFrame} hash mismatch`);
      captured = await decodeReplayValue<CapturedReplayFrame>(blob, poses);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      report = await control.render(captured.frame);
      for (const command of captured.frame.commands) {
        if (command.method === "drawTris") triangleVertices = command.args[0].length / 6;
        if (command.method === "uploadUnitReadouts") {
          standards = command.args[0].length;
          readouts = command.args[1].length;
        }
      }
      nextFrame++;
    }
    const summary = {
      grassDraws: { source: archive.manifest.grassDraws, replay: await control.readGrassDraws() },
      groundIdentity: { source: archive.manifest.groundHash, replay: replayGroundHash },
      provisional: true,
      parity: "unverified",
      frame: frameIndex + 1,
      frameCount: archive.frames.length,
      frameId: report.frameId,
      simTick: report.simTick,
      source: {
        camera: captured.reference.camera,
        terrainEnvironment: captured.reference.terrain?.environment,
        groundCover: captured.reference.terrain?.groundCover,
        width: archive.manifest.framebuffer.width,
        height: archive.manifest.framebuffer.height,
        soldiers: captured.reference.soldiers,
        expectedSoldiers: captured.reference.expectedSoldiers,
        reportedTriangleCapacityEstimate: captured.reference.triangles,
        reportedFrameDrawCalls: captured.reference.drawCalls,
      },
      replay: {
        camera: report.stats.camera,
        terrainEnvironment: report.stats.terrain?.environment,
        groundCover: report.stats.terrain?.groundCover,
        width: report.stats.width,
        height: report.stats.height,
        soldiers: report.stats.soldiers,
        expectedSoldiers: report.stats.expectedSoldiers,
        reportedTriangleCapacityEstimate: report.stats.triangles,
        reportedFrameDrawCalls: report.stats.drawCalls,
      },
      grass: {
        source: {
          hash: captured.reference.terrain?.grass.recordHash,
          records: captured.reference.terrain?.grass.recordCount,
          cachedCpuTriangleEstimate: captured.reference.terrain?.grass.submittedTriangles,
          tiers: captured.reference.terrain?.grass.tiers,
          cull: captured.reference.terrain?.grass.routeCullMask,
          transition: captured.reference.terrain?.grass.activeTransition,
        },
        replay: {
          hash: report.stats.terrain?.grass.recordHash,
          records: report.stats.terrain?.grass.recordCount,
          cachedCpuTriangleEstimate: report.stats.terrain?.grass.submittedTriangles,
          tiers: report.stats.terrain?.grass.tiers,
          cull: report.stats.terrain?.grass.routeCullMask,
          transition: report.stats.terrain?.grass.activeTransition,
        },
      },
      crowd: {
        source: captured.reference.crowd?.visibleTierHistogram,
        replay: report.stats.crowd.visibleTierHistogram,
        sourceShadow: captured.reference.crowd?.shadowTierHistogram,
        replayShadow: report.stats.crowd.shadowTierHistogram,
      },
      triangleVertices,
      readouts,
      standards,
      assetsHash: archive.manifest.assetsHash,
    };
    latestSummary = summary;
    stats.textContent = JSON.stringify(summary, null, 2);
    ctx.status.textContent =
      "Actual production submission replay — hashes checked; image parity not yet verified.";
    window.__battleReplay = { manifest: archive.manifest, summary, showFrame };
    return summary;
  };
  next.onclick = () => location.reload();
  download.onclick = () => {
    const url = URL.createObjectURL(replayArchiveDownload(archive));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "battle-replay-capture.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  try {
    await showFrame(archive.frames.length - 1);
  } catch (error) {
    dispose();
    throw error;
  }
}

declare global {
  interface Window {
    __battleReplay?: {
      manifest: import("./captureStore").ReplayManifest;
      summary: unknown;
      showFrame: (index: number) => Promise<unknown>;
    };
  }
}
