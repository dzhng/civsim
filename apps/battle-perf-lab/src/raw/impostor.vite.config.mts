import { fileURLToPath } from "node:url";
import base from "./pmrem.vite.config.mts";
export default {
  ...base,
  publicDir: fileURLToPath(new URL("../../../../web/public", import.meta.url)),
  build: {
    copyPublicDir: false,
    outDir: fileURLToPath(new URL("../../../../throwaway/impostor-control/dist", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: { input: fileURLToPath(new URL("./impostor-check.html", import.meta.url)) },
  },
};
