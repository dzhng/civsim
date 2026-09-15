import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** One file exactly as the fixed-build manifest recorded it. */
export interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface VerifiedFileGroup {
  total: number;
  verified: number;
  bytes: number;
  mismatches: string[];
}

/** A digest, or why there is none — either way, the bytes it cost to find out. */
export type Digest = { bytes: number; sha256: string } | { bytes: number; error: string };

/** Streams 1 MiB at a time so a multi-gigabyte asset tree never lands in memory. */
const READ_CHUNK_BYTES = 1024 * 1024;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A recorded length is only usable as a read limit when it is a real count. */
export function recordedSize(bytes: number): number | null {
  return typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Reproduces the fixed-build generator's digest of a recorded file list:
 * `sha256(json.dumps(files, sort_keys=True, separators=(',', ':')))`.
 */
export function fileListSha256(files: ManifestFile[]): string {
  const canonical = files.map((file) =>
    Object.fromEntries(
      (Object.keys(file) as (keyof ManifestFile)[]).sort().map((key) => [key, file[key]]),
    ),
  );
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * The one bounded-digest owner, for files on disk and served bodies alike. It
 * stops at the smaller of the recorded size and the caller's remaining budget,
 * and always reports the bytes it consumed — a refusal still costs its read, so
 * a manifest full of oversized entries cannot read forever. The source is opened
 * only once there is a limit to read it against, so a size that is not a byte
 * count never leaves a stream dangling.
 */
export async function hashBounded(
  open: () => AsyncIterable<Uint8Array>,
  expectedBytes: number,
  readLimitBytes: number,
): Promise<Digest> {
  const size = recordedSize(expectedBytes);
  if (size === null)
    return { bytes: 0, error: `recorded size ${expectedBytes} is not a byte count` };
  const limit = Math.min(size, Math.max(0, readLimitBytes));
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of open()) {
      bytes += chunk.length;
      // Abandoning the iterator closes the stream or cancels the response body.
      if (bytes > limit)
        return {
          bytes,
          error:
            limit < size
              ? `exceeds the remaining ${limit} byte read budget`
              : `larger than the recorded ${size} bytes`,
        };
      hash.update(chunk);
    }
  } catch (error) {
    return { bytes, error: message(error) };
  }
  if (bytes !== size) return { bytes, error: `read ${bytes} of ${size} bytes` };
  return { bytes, sha256: hash.digest("hex") };
}

/** Hashes one file in place, never reading past its recorded length. */
export function hashFileStreaming(
  path: string,
  expectedBytes: number,
  readLimitBytes: number = expectedBytes,
): Promise<Digest> {
  return hashBounded(
    () => createReadStream(path, { highWaterMark: READ_CHUNK_BYTES }),
    expectedBytes,
    readLimitBytes,
  );
}

/** One verification loop for every recorded group, however its bytes are reached. */
export async function verifyFiles(
  files: ManifestFile[],
  digest: (file: ManifestFile, readLimitBytes: number) => Promise<Digest>,
  budget: { remaining: number },
): Promise<VerifiedFileGroup> {
  const group: VerifiedFileGroup = { total: files.length, verified: 0, bytes: 0, mismatches: [] };
  for (const [index, file] of files.entries()) {
    if (budget.remaining <= 0) {
      group.mismatches.push(
        `read budget exhausted with ${files.length - index} file(s) unverified`,
      );
      break;
    }
    const result = await digest(file, budget.remaining);
    // Charged whether or not the digest succeeded: bytes read are bytes spent.
    budget.remaining -= result.bytes;
    group.bytes += result.bytes;
    if ("error" in result) group.mismatches.push(`${file.path}: ${result.error}`);
    else if (result.sha256 !== file.sha256)
      group.mismatches.push(`${file.path}: sha256 ${result.sha256} != ${file.sha256}`);
    else group.verified += 1;
  }
  return group;
}

/** Hashes each recorded file where it sits; an unresolvable path costs nothing. */
export const onDisk =
  (resolve: (file: ManifestFile) => string | null) =>
  async (file: ManifestFile, readLimitBytes: number): Promise<Digest> => {
    const path = resolve(file);
    return path === null
      ? { bytes: 0, error: "no shared tree owns that path prefix" }
      : hashFileStreaming(path, file.bytes, readLimitBytes);
  };
