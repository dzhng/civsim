import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(
  base,
  defineConfig({
    root: fileURLToPath(new URL("../apps/battle-perf-lab/src/raw", import.meta.url)),
    publicDir: false,
    build: {
      outDir: fileURLToPath(
        new URL("../throwaway/battle-performance/raw-preflight", import.meta.url),
      ),
      emptyOutDir: true,
      rolldownOptions: {
        input: fileURLToPath(
          new URL("../apps/battle-perf-lab/src/raw/preflight.html", import.meta.url),
        ),
      },
    },
  }),
);
