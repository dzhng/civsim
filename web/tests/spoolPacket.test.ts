// @vitest-environment node
import { expect, test, vi } from "vitest";
import { gzipSync } from "node:zlib";
import {
  decodeSpoolPacket,
  resolveSpoolGrassRecords,
} from "../../apps/battle-perf-lab/src/spoolPacket";
import { encodeReplayValue, hashReplayBlob } from "../../apps/battle-perf-lab/src/replayArchive";
import type { CapturedReplayFrame } from "../../apps/battle-perf-lab/src/CaptureBattleRenderer";

test("packet decoding preserves typed command arrays and verifies a shared binary resource before publishing it", async () => {
  const bytes = new Float32Array([1.25, -2, 3, 4]);
  const compressed = new Blob([gzipSync(new Uint8Array(bytes.buffer))]);
  const reference = { grassRecord: "base-1", chunks: 1, byteLength: bytes.byteLength };
  const captured = {
    animationFrame: 2,
    frame: { commands: [{ method: "drawTris", args: [bytes, {}] }] },
    grassPublications: [{ records: { base: reference } }],
  };
  const encoded = JSON.parse(await encodeReplayValue(captured).text());
  const packet = await decodeSpoolPacket(
    JSON.stringify({ frame: encoded, poses: [], selection: { snapshot: false, elapsedMs: 1 } }),
  );
  expect(packet.captured.frame.commands[0].args[0]).toEqual(bytes);
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(compressed));
  try {
    const publications = await resolveSpoolGrassRecords(packet.captured, "http://archive", {
      "base-1-0": { sha256: await hashReplayBlob(compressed) },
    });
    expect(fetcher).toHaveBeenCalledWith("http://archive/resource/base-1-0");
    expect(publications[0].records.base).toEqual(bytes);
  } finally {
    fetcher.mockRestore();
  }
});
test("changed resource bytes fail before replacing a published reference", async () => {
  const reference = { grassRecord: "base-1", chunks: 1, byteLength: 16 };
  const captured = {
    grassPublications: [{ records: { base: reference } }],
  } as unknown as CapturedReplayFrame;
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(new Blob([gzipSync(new Uint8Array(16))])));
  try {
    await expect(
      resolveSpoolGrassRecords(captured, "http://archive", { "base-1-0": { sha256: "wrong" } }),
    ).rejects.toThrow("hash changed");
    expect(captured.grassPublications![0].records.base).toBe(reference);
  } finally {
    fetcher.mockRestore();
  }
});
test("verified resource cannot overrun its declared record byte range", async () => {
  const compressed = new Blob([gzipSync(new Uint8Array(32))]);
  const reference = { grassRecord: "base-1", chunks: 1, byteLength: 16 };
  const captured = {
    grassPublications: [{ records: { base: reference } }],
  } as unknown as CapturedReplayFrame;
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(compressed));
  try {
    await expect(
      resolveSpoolGrassRecords(captured, "http://archive", {
        "base-1-0": { sha256: await hashReplayBlob(compressed) },
      }),
    ).rejects.toThrow("overflow");
    expect(captured.grassPublications![0].records.base).toBe(reference);
  } finally {
    fetcher.mockRestore();
  }
});
