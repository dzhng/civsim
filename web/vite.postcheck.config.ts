import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../apps/battle-perf-lab/candidates/raw-post", import.meta.url)),
  publicDir: false,
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
