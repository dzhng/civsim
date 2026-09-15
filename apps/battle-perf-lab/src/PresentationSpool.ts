import { ReplayWindow, encodeReplayValue } from "./replayArchive";
import type { BattleReplayAssets, BattleReplaySettings } from "./fixture";
import type { CapturedReplayFrame } from "./CaptureBattleRenderer";

export interface SpoolWindow {
  name: string;
  startMs: number;
  frameLimit: number;
}
export function validateSpoolWindows(windows: readonly SpoolWindow[]) {
  if (new Set(windows.map((w) => w.name)).size !== windows.length)
    throw new Error("Spool capture window names must be unique");
  if (
    !windows.length ||
    windows.length > 4 ||
    windows.some(
      (w) =>
        !w.name ||
        !Number.isFinite(w.startMs) ||
        w.startMs < 0 ||
        !Number.isInteger(w.frameLimit) ||
        w.frameLimit < 1 ||
        w.frameLimit > 30,
    )
  )
    throw new Error("Spool capture requires one to four bounded windows of at most 30 frames");
}

const MEMORY_CAP = 128 * 1024 * 1024;
const DISK_CAP = 1024 * 1024 * 1024;
interface Packet {
  id: number;
  raw: Blob;
  reservedBytes: number;
  sourceImage?: Promise<Blob>;
}

/** Lossless source-only recording. Disk acknowledgments release queued ownership. */
export class PresentationSpool {
  readonly inputs: Blob;
  private packets: Packet[] = [];
  private pumping = false;
  private stopped = false;
  private complete = false;
  private error: string | null = null;
  private offered = 0;
  private acknowledged = 0;
  private diskBytes = 0;
  private peakBytes = 0;
  private selected = new Map<string, number>();
  private compressor: Worker | null = null;
  private compression: { resolve: (bytes: number) => void; reject: (error: Error) => void } | null =
    null;
  private compress(packet: Packet, png?: Blob): Promise<number> {
    this.compressor ??= new Worker(new URL("./spoolCompression.worker.ts", import.meta.url), {
      type: "module",
    });
    return new Promise((resolve, reject) => {
      this.compression = { resolve, reject };
      this.compressor!.onmessage = ({ data }) => {
        this.compression = null;
        if (data.id !== packet.id) reject(Error("Compression reply id mismatch"));
        else if (data.error) reject(Error(data.error));
        else resolve(data.bytes);
      };
      this.compressor!.onerror = (event) => {
        this.compression = null;
        reject(Error(event.message));
      };
      this.compressor!.postMessage({ id: packet.id, blob: packet.raw, png, sink: this.sink });
    });
  }
  constructor(
    private readonly source: HTMLCanvasElement,
    assets: BattleReplayAssets,
    settings: BattleReplaySettings,
    private readonly windows: readonly SpoolWindow[],
    private readonly cancelSource: () => void,
    private readonly sink: string,
  ) {
    validateSpoolWindows(windows);
    this.inputs = encodeReplayValue({ assets, settings });
    this.diskBytes = this.inputs.size;
  }
  offer(frame: CapturedReplayFrame, elapsedMs: number, running: boolean) {
    if (this.stopped || this.complete) return;
    try {
      const encoded = new ReplayWindow(1, MEMORY_CAP);
      if (encoded.append(frame) === "byte-limit")
        throw Error("One source frame exceeds memory cap");
      const window = running
        ? this.windows.find(
            (w) => elapsedMs >= w.startMs && (this.selected.get(w.name) ?? 0) < w.frameLimit,
          )
        : undefined;
      const windowIndex = window ? (this.selected.get(window.name) ?? 0) : -1;
      const snapshot = !!window && (windowIndex === 0 || windowIndex === window.frameLimit - 1);
      const parts: BlobPart[] = ['{"frame":', encoded.frames[0], ',"poses":['];
      encoded.poses.forEach((pose, i) => {
        if (i) parts.push(",");
        parts.push(pose);
      });
      parts.push(
        '],"selection":',
        JSON.stringify({ window: window?.name ?? null, windowIndex, elapsedMs, snapshot }),
        "}",
      );
      const raw = new Blob(parts);
      // Compression retains its input and may produce an incompressible output.
      const reservedBytes =
        raw.size * 2 +
        65536 +
        (snapshot ? this.source.width * this.source.height * 4 + 1048576 : 0);
      if (this.retainedBytes() + reservedBytes > MEMORY_CAP || this.packets.length >= 32)
        throw Error("Source spool reached its 128 MiB / 32-packet memory cap");
      const packet: Packet = { id: ++this.offered, raw, reservedBytes };
      this.packets.push(packet);
      if (snapshot) {
        packet.sourceImage = new Promise<Blob>((resolve, reject) =>
          this.source.toBlob(
            (blob) => (blob ? resolve(blob) : reject(Error("Source snapshot failed"))),
            "image/png",
          ),
        );
        void packet.sourceImage.catch((error) => this.fail(error));
      }
      if (window) this.selected.set(window.name, windowIndex + 1);
      this.peakBytes = Math.max(this.peakBytes, this.retainedBytes());
      if (this.windows.every((w) => this.selected.get(w.name) === w.frameLimit)) {
        this.complete = true;
        this.cancelSource();
      }
      void this.pump();
    } catch (error) {
      this.fail(error);
    }
  }
  private async pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (!this.stopped) {
        const packet = this.packets[0];
        if (!packet) break;
        const png = await packet.sourceImage;
        const bytes = await this.compress(packet, png);
        if (this.stopped) break;
        if (this.diskBytes + bytes > DISK_CAP)
          throw Error("Source spool reached its 1 GiB compressed disk cap");
        this.diskBytes += bytes;
        this.acknowledge(packet.id);
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.pumping = false;
    }
  }
  private acknowledge(id: number) {
    if (this.error) throw Error(this.error);
    if (this.packets[0]?.id !== id)
      throw Error("Spool acknowledgment must match the oldest completed packet");
    this.packets.shift();
    this.acknowledged++;
  }
  private retainedBytes() {
    return this.inputs.size + this.packets.reduce((n, p) => n + p.reservedBytes, 0);
  }
  status() {
    return {
      sourceComplete: this.complete,
      offered: this.offered,
      acknowledged: this.acknowledged,
      queued: this.packets.length,
      retainedBytes: this.retainedBytes(),
      peakBytes: this.peakBytes,
      diskBytes: this.diskBytes,
      error: this.error,
      stopped: this.stopped,
      windows: Object.fromEntries(this.selected),
    };
  }
  private fail(error: unknown) {
    if (this.stopped) return;
    this.error = String(error);
    this.cancelSource();
    this.dispose();
  }
  dispose() {
    this.stopped = true;
    this.compression?.reject(Error(this.error ?? "Spool disposed"));
    this.compression = null;
    this.compressor?.terminate();
    this.compressor = null;
    this.packets = [];
  }
}
