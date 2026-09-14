import { describe, expect, it } from "vitest";
import { encodeRgba8Base64 } from "../../apps/battle-perf-lab/src/imageTransport";

describe("numerical image transport", () => {
  it("round trips all byte values across multiple chunks without changing pixels", () => {
    const bytes = Uint8Array.from({ length: 131076 }, (_, i) => i % 256);
    expect(new Uint8Array(Buffer.from(encodeRgba8Base64(bytes), "base64"))).toEqual(bytes);
    expect(encodeRgba8Base64(new Uint8Array())).toBe("");
    expect(() => encodeRgba8Base64(new Uint8Array(3))).toThrow("complete pixels");
  });
});
