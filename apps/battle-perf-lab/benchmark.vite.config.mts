import { fileURLToPath } from "node:url";
import base from "../../web/vite.config";
import { heldBenchmarkPlugins } from "./src/held/heldBenchmarkPlugin";
import { wholeMapShadowControlPlugins } from "./src/shadow-control/wholeMapShadowControl";

/** Measurement controls surround the production renderer; this build cannot select
 * another facade. Raw and vgpu comparisons consume archived replay inputs. */
export default {
  ...base,
  root: fileURLToPath(new URL("../../web", import.meta.url)),
  plugins: [...(base.plugins ?? []), ...heldBenchmarkPlugins(), ...wholeMapShadowControlPlugins()],
  build: {
    ...base.build,
    copyPublicDir: false,
    outDir: fileURLToPath(new URL("../../throwaway/production-benchmark/dist", import.meta.url)),
  },
};
