import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../apps/battle-perf-lab/candidates/aerial", import.meta.url)),
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: fileURLToPath(
        new URL("../apps/battle-perf-lab/candidates/aerial/check.html", import.meta.url),
      ),
    },
  },
});
