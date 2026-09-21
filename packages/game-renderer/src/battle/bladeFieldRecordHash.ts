/** Stable diagnostic hash of quantized packed blade records; not an integrity checksum. */
export function hashPackedRecords(records: Float32Array): string {
  return hashToString(hashPackedRecordsRange(records, 0, records.length, 0x811c9dc5));
}

export function hashPackedRecordsRange(
  records: Float32Array,
  start: number,
  end: number,
  initial: number,
): number {
  let h = initial;
  for (let i = start; i < end; i++) {
    const q = Math.round(records[i] * 1000);
    h ^= q & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

export function hashToString(h: number): string {
  return (h >>> 0).toString(16).padStart(8, "0");
}
