import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.config";

// Isolated numerical controls inherit the production TypeGPU transform.
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../apps/battle-perf-lab/candidates/typegpu", import.meta.url)),
  publicDir: false,
  resolve: {
    alias: [
      {
        find: /^typegpu$/,
        replacement: fileURLToPath(new URL("./node_modules/typegpu/index.js", import.meta.url)),
      },
    ],
  },
  build: { outDir: "dist", emptyOutDir: true },
});
