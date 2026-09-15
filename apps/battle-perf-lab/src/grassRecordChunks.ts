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
  const frames = publications.map((publication) => {
    const records: Record<string, GrassRecordReference | null> = {};
    for (const layer of ["base", "ring"] as const) {
      if (!Object.hasOwn(publication.records, layer)) continue;
      const array = publication.records[layer];
      if (!array) {
        records[layer] = null;
        continue;
      }
      const id = `${layer}-${publication.state[layer].revision}`;
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
      records[layer] = { grassRecord: id, byteLength: bytes.length, chunks: count };
    }
    return { ...publication, records };
  });
  return { frames, resources };
}
