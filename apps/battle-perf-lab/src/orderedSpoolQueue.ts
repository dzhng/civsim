export function orderedSpoolQueue<T>(
  consume: (packet: T) => Promise<void>,
  fail: (error: unknown) => void,
) {
  const pending = new Map<number, T>();
  let next = 1,
    running = false,
    stopped = false;
  async function pump() {
    if (running || stopped) return;
    running = true;
    try {
      while (!stopped && pending.has(next)) {
        const packet = pending.get(next)!;
        pending.delete(next++);
        await consume(packet);
      }
    } catch (error) {
      stopped = true;
      pending.clear();
      fail(error);
    } finally {
      running = false;
    }
  }
  return {
    stop() {
      stopped = true;
      pending.clear();
    },
    offer(id: number, packet: T) {
      if (stopped) return;
      if (id < next || pending.has(id) || pending.size >= 32)
        throw Error("Invalid or overflowing spool packet sequence");
      pending.set(id, packet);
      void pump();
    },
  };
}
