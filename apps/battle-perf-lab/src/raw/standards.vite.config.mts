import { fileURLToPath } from "node:url";
import base from "./pmrem.vite.config.mts";
export default {
  ...base,
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/standards-control/dist", import.meta.url)),
    emptyOutDir: true,
    copyPublicDir: false,
    rolldownOptions: { input: fileURLToPath(new URL("./standards-check.html", import.meta.url)) },
  },
};
