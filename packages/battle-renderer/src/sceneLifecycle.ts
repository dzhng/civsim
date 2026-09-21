/** One owned asynchronous scene operation. Closing prevents further use immediately;
 * its promise settles only after deferred cleanup, with the original failure retained. */
export function createSceneLifecycle(release: () => void) {
  let closed = false,
    pending = false,
    released = false;
  const check = () => {
    if (closed) throw Error("Battle scene disposed");
  };
  const idle = () => {
    check();
    if (pending) throw Error("Battle scene operation already in flight");
  };
  const cleanup = () => {
    if (!released) {
      released = true;
      release();
    }
  };
  return {
    check,
    idle,
    get busy() {
      return pending;
    },
    get disposed() {
      return closed;
    },
    async run<T>(operation: () => T | Promise<T>): Promise<T> {
      idle();
      pending = true;
      let result!: T, failure: { error: unknown } | undefined;
      try {
        result = await operation();
        check();
      } catch (error) {
        failure = { error };
      } finally {
        pending = false;
        if (closed) {
          try {
            cleanup();
          } catch (error) {
            failure = {
              error: failure
                ? new AggregateError([failure.error, error], "Scene operation and cleanup failed")
                : error,
            };
          }
        }
      }
      if (failure) throw failure.error;
      return result;
    },
    dispose() {
      if (closed) return;
      closed = true;
      if (!pending) cleanup();
    },
  };
}
