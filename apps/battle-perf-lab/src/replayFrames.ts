import type { BattleReplayFrame } from "./fixture";

/** Sequential consumption bounds the driver to one source frame at a time.
 * The source owns decoding/chunk memory; the consumer owns any retained reports. */
export async function consumeReplayFrames<T extends Pick<BattleReplayFrame, "frameId">>(
  source: AsyncIterable<T>,
  frameLimit: number,
  consume: (frame: T) => void | Promise<void>,
): Promise<{ frames: number; stopped: "frame-limit" | "source-ended" }> {
  if (!Number.isSafeInteger(frameLimit) || frameLimit <= 0) {
    throw new RangeError("frameLimit must be a positive safe integer");
  }
  let frames = 0;
  for await (const frame of source) {
    await consume(frame);
    frames++;
    if (frames === frameLimit) return { frames, stopped: "frame-limit" };
  }
  return { frames, stopped: "source-ended" };
}
