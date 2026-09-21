import {
  chunkGrassPublications,
  GRASS_CHUNK_BYTES,
  type GrassRecordChunk,
} from "./grassRecordChunks";
import { ReplayWindow, encodeReplayValue } from "./replayArchive";
import type { BattleReplayAssets, BattleReplaySettings } from "./fixture";
import type { CapturedReplayFrame } from "./captureData";

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
  resources: GrassRecordChunk[];
  reservedBytes: number;
  sourceImage?: Promise<Blob>;
  sourceDraws?: Promise<unknown>;
}

/** Lossless source-only recording. Disk acknowledgments release queued ownership. */
export class PresentationSpool {
  readonly inputs: Blob;
  private packets: Packet[] = [];
  private stopped = false;
  private complete = false;
  private error: string | null = null;
  private offered = 0;
  private acknowledged = 0;
  private diskBytes = 0;
  private peakBytes = 0;
  private selected = new Map<string, number>();
  private compressor: Worker | null = null;
  private worker() {
    if (this.compressor) return this.compressor;
    const worker = new Worker(new URL("./spoolCompression.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      if (this.stopped) return;
      try {
        if (data.error) throw Error(data.error);
        const packet = this.packets[0];
        if (!packet || packet.id !== data.id)
          throw Error("Worker acknowledgment sequence mismatch");
        if (data.progress !== undefined) {
          const resource = packet.resources.shift();
          if (!resource || resource.id !== data.progress)
            throw Error("Resource acknowledgment mismatch");
          packet.reservedBytes -= resource.blob.size;
        } else {
          if (this.diskBytes + data.bytes > DISK_CAP)
            throw Error("Source spool reached its 1 GiB compressed disk cap");
          this.diskBytes += data.bytes;
          this.acknowledge(packet.id);
        }
      } catch (error) {
        this.fail(error);
      }
    };
    worker.onerror = (event) => this.fail(Error(event.message));
    this.compressor = worker;
    return worker;
  }
  private async dispatch(packet: Packet) {
    try {
      const [png, draws] = await Promise.all([packet.sourceImage, packet.sourceDraws]);
      if (this.stopped) return;
      this.worker().postMessage({
        id: packet.id,
        blob: packet.raw,
        resources: packet.resources,
        png,
        draws,
        sink: this.sink,
      });
    } catch (error) {
      this.fail(error);
    }
  }
  constructor(
    private readonly source: HTMLCanvasElement,
    assets: BattleReplayAssets,
    settings: BattleReplaySettings,
    private readonly windows: readonly SpoolWindow[],
    private readonly cancelSource: () => void,
    private readonly sink: string,
    private readonly readDraws?: () => Promise<unknown>,
  ) {
    validateSpoolWindows(windows);
    this.inputs = encodeReplayValue({ assets, settings });
    this.diskBytes = this.inputs.size;
  }
  offer(frame: CapturedReplayFrame, elapsedMs: number, running: boolean) {
    if (this.stopped || this.complete) return;
    try {
      const resourceBytes = (frame.grassPublications ?? []).reduce(
        (sum, p) =>
          sum +
          Object.values(p.records).reduce((n, a) => n + (a?.byteLength ?? 0), 0) +
          Object.values(p.edits).reduce((n, e) => n + (e?.data.byteLength ?? 0), 0),
        0,
      );
      if (this.retainedBytes() + resourceBytes > MEMORY_CAP)
        throw Error("Grass revision resources exceed retained byte cap");
      const grass = chunkGrassPublications(frame.grassPublications ?? []);
      const encoded = new ReplayWindow(1, MEMORY_CAP);
      if (encoded.append({ ...frame, grassPublications: grass.frames }) === "byte-limit")
        throw Error("One source frame exceeds memory cap");
      const window = running
        ? this.windows.find(
            (w) => elapsedMs >= w.startMs && (this.selected.get(w.name) ?? 0) < w.frameLimit,
          )
        : undefined;
      const windowIndex = window ? (this.selected.get(window.name) ?? 0) : -1;
      const snapshot = !!window && (windowIndex === 0 || windowIndex === window.frameLimit - 1);
      const imageReservation = snapshot ? this.source.width * this.source.height * 4 + 1048576 : 0;
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
      const reservedBytes = resourceBytes + raw.size + 65536 + imageReservation;
      const packet: Packet = {
        id: this.offered + 1,
        raw,
        reservedBytes,
        resources: grass.resources,
      };
      if (this.retainedBytes(packet) > MEMORY_CAP || this.packets.length >= 32)
        throw Error("Source spool reached its 128 MiB / 32-packet memory cap");
      this.offered++;
      this.packets.push(packet);
      if (snapshot) {
        packet.sourceDraws = this.readDraws?.();
        void packet.sourceDraws?.catch((error) => this.fail(error));
        packet.sourceImage = new Promise<Blob>((resolve, reject) =>
          this.source.toBlob(
            (blob) => (blob ? resolve(blob) : reject(Error("Source snapshot failed"))),
            "image/png",
          ),
        ).then((blob) => {
          packet.reservedBytes += blob.size - imageReservation;
          if (this.retainedBytes() > MEMORY_CAP)
            throw Error("Encoded endpoint image exceeded the retained byte cap");
          return blob;
        });
        void packet.sourceImage.catch((error) => this.fail(error));
      }
      if (window) this.selected.set(window.name, windowIndex + 1);
      this.peakBytes = Math.max(this.peakBytes, this.retainedBytes());
      if (this.windows.every((w) => this.selected.get(w.name) === w.frameLimit)) {
        this.complete = true;
        this.cancelSource();
      }
      void this.dispatch(packet);
    } catch (error) {
      this.fail(error);
    }
  }
  private acknowledge(id: number) {
    if (this.error) throw Error(this.error);
    if (this.packets[0]?.id !== id)
      throw Error("Spool acknowledgment must match the oldest completed packet");
    this.packets.shift();
    this.acknowledged++;
  }
  private retainedBytes(candidate?: Packet) {
    const packets = candidate ? [...this.packets, candidate] : this.packets;
    // One worker compresses one chunk/frame at a time. Queued inputs do not yet
    // own compressed outputs; reserve only the largest possible in-flight output.
    const scratch = packets.reduce(
      (size, p) => Math.max(size, p.raw.size, p.resources.length ? GRASS_CHUNK_BYTES : 0),
      0,
    );
    return this.inputs.size + packets.reduce((n, p) => n + p.reservedBytes, 0) + scratch;
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
    this.compressor?.terminate();
    this.compressor = null;
    this.packets = [];
  }
}
