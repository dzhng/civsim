// @vitest-environment node
import { expect, test } from "vitest";
import {
  hashPackedRecords,
  hashPackedRecordsRange,
  hashToString,
} from "../../packages/game-renderer/src/battle/bladeFieldRecordHash";
test("capture record hash survives signed values and incremental upload chunks", () => {
  const records = new Float32Array([1.25, -2, 3, 4]);
  expect(hashPackedRecords(records)).toBe("e870c5cd");
  const first = hashPackedRecordsRange(records, 0, 2, 0x811c9dc5);
  expect(hashToString(hashPackedRecordsRange(records, 2, 4, first))).toBe(
    hashPackedRecords(records),
  );
});
