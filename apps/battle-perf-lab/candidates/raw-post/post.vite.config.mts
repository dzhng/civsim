import { fileURLToPath } from "node:url";
import base from "../../src/raw/pmrem.vite.config.mts";
export default {
  ...base,
  optimizeDeps: { ...base.optimizeDeps, include: [] },
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/post-control/dist", import.meta.url)),
    emptyOutDir: true,
    copyPublicDir: false,
    rolldownOptions: { input: fileURLToPath(new URL("./check.html", import.meta.url)) },
  },
};
