import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.typegpu.config";
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../apps/battle-perf-lab/candidates/terrain", import.meta.url)),
  publicDir: false,
  resolve: {
    alias: [
      {
        find: /^vgpu$/,
        replacement: fileURLToPath(new URL("./node_modules/vgpu/dist/index.js", import.meta.url)),
      },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: fileURLToPath(
        new URL("../apps/battle-perf-lab/candidates/terrain/check.html", import.meta.url),
      ),
    },
  },
});
