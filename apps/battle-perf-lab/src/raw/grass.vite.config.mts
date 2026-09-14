import { fileURLToPath } from "node:url";
import base from "./pmrem.vite.config.mts";
export default {
  ...base,
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/grass-control/dist", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: { input: fileURLToPath(new URL("./grass-check.html", import.meta.url)) },
  },
};
