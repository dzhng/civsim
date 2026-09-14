const arrays = {
  Float32Array,
  Float64Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
};

/** Byte encoding preserves NaNs, signed zero and typed view offsets in recorded data. */
export function encodeReplayValue(
  value: unknown,
  replace: (value: unknown) => unknown = (value) => value,
): Blob {
  return new Blob(
    [
      JSON.stringify(value, (_key, raw) => {
        const original = replace(raw);
        if (typeof original === "function" || typeof original === "symbol")
          throw new Error("Replay encoding rejects executable or symbolic values");
        const numericArray =
          Array.isArray(original) &&
          original.length >= 16 &&
          original.every((value) => typeof value === "number");
        const item = numericArray ? Float64Array.from(original) : original;
        if (!ArrayBuffer.isView(item)) {
          if (!item || typeof item !== "object" || Array.isArray(item)) return item;
          const prototype = Object.getPrototypeOf(item);
          if (prototype !== Object.prototype && prototype !== null)
            throw new Error("Replay encoding accepts plain objects and typed-array bytes only");
          return Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          );
        }
        const bytes = new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return {
          typedArray: item.constructor.name,
          bytes: btoa(binary),
          ...(numericArray ? { numericArray: true } : {}),
        };
      }),
    ],
    { type: "application/json" },
  );
}

export async function decodeReplayValue<T>(
  blob: Blob,
  poses: readonly (readonly number[])[] = [],
): Promise<T> {
  return JSON.parse(await blob.text(), (_key, item) => {
    if (item && typeof item === "object" && "frozenPose" in item) {
      if (!Number.isInteger(item.frozenPose) || !poses[item.frozenPose])
        throw new Error("Missing frozen pose in replay dictionary");
      return { kind: "frozen", locals: poses[item.frozenPose] };
    }
    if (!item || typeof item !== "object" || !("typedArray" in item)) return item;
    const constructor = arrays[item.typedArray as keyof typeof arrays];
    if (!Object.hasOwn(arrays, item.typedArray) || typeof item.bytes !== "string") {
      throw new Error("Unsupported replay array encoding");
    }
    const bytes = Uint8Array.from(atob(item.bytes), (character) => character.charCodeAt(0));
    const decoded = new constructor(bytes.buffer);
    return item.numericArray ? Array.from(decoded) : decoded;
  });
}

export async function hashReplayBlob(blob: Blob): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class ReplayWindow {
  readonly frames: Blob[] = [];
  readonly poses: Blob[] = [];
  private poseIds = new WeakMap<readonly number[], number>();
  bytes = 0;

  constructor(
    readonly frameLimit: number,
    readonly byteLimit: number,
    initialBytes = 0,
  ) {
    if (![frameLimit, byteLimit].every((value) => Number.isSafeInteger(value) && value > 0))
      throw new RangeError("Capture limits must be positive safe integers");
    if (!Number.isSafeInteger(initialBytes) || initialBytes < 0 || initialBytes >= byteLimit)
      throw new RangeError("Static capture data exceeds the window byte cap");
    this.bytes = initialBytes;
  }

  append(frame: unknown): "recording" | "frame-limit" | "byte-limit" {
    if (this.frames.length >= this.frameLimit) return "frame-limit";
    const pending = new Map<readonly number[], { id: number; blob: Blob }>();
    let pendingBytes = 0;
    const cap = Symbol("capture-byte-cap");
    let encoded: Blob;
    try {
      encoded = encodeReplayValue(frame, (value) => {
        if (
          !value ||
          typeof value !== "object" ||
          !("kind" in value) ||
          value.kind !== "frozen" ||
          !("locals" in value) ||
          !Array.isArray(value.locals)
        )
          return value;
        const locals = value.locals as readonly number[];
        if (!Object.isFrozen(locals))
          throw new Error("Frozen pose dictionary requires immutable local poses");
        const existing = this.poseIds.get(locals) ?? pending.get(locals)?.id;
        if (existing !== undefined) return { frozenPose: existing };
        const blob = encodeReplayValue(locals);
        pendingBytes += blob.size;
        if (this.bytes + pendingBytes > this.byteLimit) throw cap;
        const id = this.poses.length + pending.size;
        pending.set(locals, { id, blob });
        return { frozenPose: id };
      });
    } catch (error) {
      if (error === cap) return "byte-limit";
      throw error;
    }
    if (this.bytes + pendingBytes + encoded.size > this.byteLimit) return "byte-limit";
    for (const [locals, { id, blob }] of pending) {
      this.poseIds.set(locals, id);
      this.poses.push(blob);
    }
    this.bytes += pendingBytes;
    this.frames.push(encoded);
    this.bytes += encoded.size;
    return this.frames.length === this.frameLimit ? "frame-limit" : "recording";
  }
}

/** Hash one appearance at a time; material images remain their original encoded bytes. */
export async function hashLoadedAppearances(
  assets: Readonly<
    Record<number, import("../../../packages/soldier-assets/src/appearanceBundle").AppearanceBundle>
  >,
  onProgress?: (completed: number, total: number, encodedBytes: number) => void,
) {
  const hashes: [string, string][] = [];
  let encodedBytes = 0;
  let largestAppearanceBytes = 0;
  const ids = Object.keys(assets).sort();
  onProgress?.(0, ids.length, 0);
  for (const id of ids) {
    const blob = encodeReplayValue(assets[Number(id)]);
    encodedBytes += blob.size;
    largestAppearanceBytes = Math.max(largestAppearanceBytes, blob.size);
    hashes.push([id, await hashReplayBlob(blob)]);
    onProgress?.(hashes.length, ids.length, encodedBytes);
  }
  return {
    hash: await hashReplayBlob(encodeReplayValue(hashes)),
    encodedBytes,
    largestAppearanceBytes,
  };
}
