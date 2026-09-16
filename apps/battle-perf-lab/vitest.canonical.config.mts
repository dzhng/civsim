/** Heavy canonical verification entry, kept out of the fast lab suite on purpose: the
 * `*.canonical.ts` runs prepare the canonical 9000-tick window and take minutes, while
 * `vitest.config.mts` stays a short default suite. Same resolution, different include. */
import base from "./vitest.config.mts";

export default {
  ...base,
  test: {
    ...base.test,
    include: ["tests/**/*.canonical.ts"],
    // One authoritative Game at a time on the host, whatever ends up matching the glob.
    fileParallelism: false,
    testTimeout: 90 * 60_000,
    hookTimeout: 10 * 60_000,
    teardownTimeout: 60_000,
  },
};
