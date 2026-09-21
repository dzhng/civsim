export type SceneFrame = (now: number) => void | Promise<void>;
/** Owns one frame and its exit barrier. Exit aborts immediately, but resources stay
 * alive until the synchronous stack or awaited presentation has unwound. */
export function createSceneFrames(frame: SceneFrame, abort: () => void, release: () => void) {
  let closed = false,
    running = false,
    released = false;
  let pending: Promise<void> | null = null;
  let drain: { promise: Promise<void>; resolve(): void; reject(error: unknown): void } | null =
    null;
  const cleanup = () => {
    if (released) return;
    released = true;
    try {
      release();
      drain?.resolve();
    } catch (error) {
      drain?.reject(error);
      throw error;
    }
  };
  const finish = (failure?: { error: unknown }) => {
    pending = null;
    if (closed) {
      try {
        cleanup();
      } catch (error) {
        failure = {
          error: failure
            ? new AggregateError([failure.error, error], "Frame and cleanup failed")
            : error,
        };
      }
    }
    if (failure) throw failure.error;
  };
  return {
    frame(now: number): void | Promise<void> {
      if (closed || running) return;
      if (pending) return pending;
      running = true;
      let failure: { error: unknown } | undefined;
      try {
        const result = frame(now);
        if (result) {
          pending = result.then(
            () => finish(),
            (error) => finish({ error }),
          );
          return pending;
        }
      } catch (error) {
        failure = { error };
      } finally {
        running = false;
      }
      finish(failure);
    },
    exit(): void | Promise<void> {
      if (closed) return drain?.promise;
      closed = true;
      abort();
      if (running || pending) {
        let resolve!: () => void, reject!: (error: unknown) => void;
        const promise = new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        drain = { promise, resolve, reject };
        return promise;
      }
      cleanup();
    },
  };
}
/** The source's synchronous callback still schedules directly. Async callbacks
 * schedule their successor only after settlement; errors stop the pump. */
export function startSceneFrames(
  frame: SceneFrame,
  schedule: (next: (now: number) => void) => void,
  fail: (error: unknown) => void,
) {
  let stopped = false;
  const next = (now: number) => {
    if (stopped) return;
    try {
      const pending = frame(now);
      if (pending)
        void pending.then(
          () => {
            if (!stopped) schedule(next);
          },
          (error) => {
            stopped = true;
            fail(error);
          },
        );
      else schedule(next);
    } catch (error) {
      stopped = true;
      fail(error);
    }
  };
  schedule(next);
  return () => {
    stopped = true;
  };
}
