import { writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export class AppearanceTimeoutError extends Error {}
export async function appearanceDeadline(label, milliseconds, work, cancel) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0)
    throw Error("Invalid appearance deadline");
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new AppearanceTimeoutError(`${label} exceeded ${milliseconds}ms`);
          reject(error);
          controller.abort(error);
          try {
            void Promise.resolve(cancel()).catch(() => {});
          } catch {}
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class OutputQuotaError extends Error {}
export function outputBudget(limitBytes, reserveBytes = 4 * 1024 * 1024) {
  if (
    !Number.isSafeInteger(limitBytes) ||
    !Number.isSafeInteger(reserveBytes) ||
    reserveBytes < 0 ||
    limitBytes <= reserveBytes
  )
    throw Error("Invalid atlas output quota");
  let writtenBytes = 0,
    pendingBytes = 0;
  return {
    get writtenBytes() {
      return writtenBytes;
    },
    async write(path, value, { signal, failure = false } = {}) {
      signal?.throwIfAborted();
      const bytes = typeof value === "string" ? Buffer.from(value) : value;
      if (writtenBytes + pendingBytes + bytes.length > limitBytes - (failure ? 0 : reserveBytes))
        throw new OutputQuotaError("Atlas fresh-output quota exceeded");
      const temp = `${path}.${randomUUID()}.tmp`;
      pendingBytes += bytes.length;
      try {
        await writeFile(temp, bytes, { signal, flag: "wx" });
        signal?.throwIfAborted();
        await rename(temp, path);
        writtenBytes += bytes.length;
      } finally {
        pendingBytes -= bytes.length;
        await rm(temp, { force: true });
      }
    },
  };
}
