import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import typegpu from "unplugin-typegpu/vite";
import base from "./vite.config";
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../apps/battle-perf-lab/candidates/raw-post", import.meta.url)),
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
  optimizeDeps: { include: [] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(
        new URL("../apps/battle-perf-lab/candidates/raw-post/check.html", import.meta.url),
      ),
    },
  },
});
