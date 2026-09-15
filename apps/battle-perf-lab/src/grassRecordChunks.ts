import type { GrassPublication } from "./CaptureGrassResidency";
export const GRASS_CHUNK_BYTES = 4 * 1024 * 1024;
export interface GrassRecordReference {
  grassRecord: string;
  byteLength: number;
  chunks: number;
}
export interface GrassRecordChunk {
  id: string;
  blob: Blob;
}
/** Record bytes are immutable borrowed production data until this boundary copies chunks. */
export function chunkGrassPublications(publications: readonly GrassPublication[]) {
  const resources: GrassRecordChunk[] = [];
  const reference = (id: string, array: Float32Array): GrassRecordReference => {
    if (!(array.buffer instanceof ArrayBuffer))
      throw Error("Grass records must own ordinary immutable ArrayBuffer storage");
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const count = Math.ceil(bytes.length / GRASS_CHUNK_BYTES);
    for (let chunk = 0; chunk < count; chunk++)
      resources.push({
        id: `${id}-${chunk}`,
        blob: new Blob([
          bytes.subarray(chunk * GRASS_CHUNK_BYTES, (chunk + 1) * GRASS_CHUNK_BYTES),
        ]),
      });
    return { grassRecord: id, byteLength: bytes.length, chunks: count };
  };
  const frames = publications.map((publication) => {
    const records: Record<string, GrassRecordReference | null> = {};
    for (const layer of ["base", "ring"] as const) {
      if (!Object.hasOwn(publication.records, layer)) continue;
      const array = publication.records[layer];
      records[layer] = array
        ? reference(`${layer}-${publication.state[layer].revision}`, array)
        : null;
    }
    // A boundary's ranges are bounded, so their payload is too - keyed by the
    // publication step that wrote them, not by a generation.
    const edits: Record<string, unknown> = {};
    for (const layer of ["base", "ring"] as const) {
      const payload = publication.edits[layer];
      if (!payload) continue;
      edits[layer] = {
        editSerial: payload.editSerial,
        ranges: payload.ranges,
        data: reference(`${layer}-edit-${payload.editSerial}`, payload.data),
      };
    }
    return { ...publication, records, edits };
  });
  return { frames, resources };
}
