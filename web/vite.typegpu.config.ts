import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import typegpu from "unplugin-typegpu/vite";
import base from "./vite.config";

// Candidate-only build: the production Vite configuration has no TypeGPU plugin.
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../apps/battle-perf-lab/candidates/typegpu", import.meta.url)),
  publicDir: false,
  plugins: [typegpu()],
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
