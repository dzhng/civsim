import { decodeReplayPoses, decodeReplayText, hashReplayBlob } from "./replayArchive";
import type { CapturedReplayFrame } from "./CaptureBattleRenderer";
import type { GrassRecordReference } from "./grassRecordChunks";

/** One packet owns its decoded poses; callers finish presentation before decoding another. */
export async function decodeSpoolPacket(packetText: string) {
  const packet = JSON.parse(packetText);
  const poses = await decodeReplayPoses(
    packet.poses.map((pose: unknown) => new Blob([JSON.stringify(pose)])),
  );
  const captured = decodeReplayText<CapturedReplayFrame>(JSON.stringify(packet.frame), poses);
  return {
    captured,
    selection: packet.selection as {
      window?: string;
      windowIndex?: number;
      elapsedMs: number;
      snapshot: boolean;
    },
  };
}

/** Shared bounded resource protocol for every replay backend. */
export async function resolveSpoolGrassRecords(
  captured: CapturedReplayFrame,
  sink: string,
  resources: Record<string, { sha256: string }>,
) {
  for (const publication of captured.grassPublications ?? []) {
    for (const layer of ["base", "ring"] as const) {
      const reference = publication.records[layer] as unknown as
        GrassRecordReference | null | undefined;
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
  return captured.grassPublications;
}
