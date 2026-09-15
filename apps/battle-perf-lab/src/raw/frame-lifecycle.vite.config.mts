import { fileURLToPath } from "node:url";
import base from "./pmrem.vite.config.mts";
export default {
  ...base,
  optimizeDeps: { ...base.optimizeDeps, include: [] },
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/frame-lifecycle/dist", import.meta.url)),
    emptyOutDir: true,
    copyPublicDir: false,
    rolldownOptions: {
      input: fileURLToPath(new URL("./frame-lifecycle-check.html", import.meta.url)),
    },
  },
};
