import { fileURLToPath } from "node:url";
import base from "./pmrem.vite.config.mts";
export default {
  ...base,
  publicDir: fileURLToPath(new URL("../../../../web/public", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/crowd-control/dist", import.meta.url)),
    emptyOutDir: true,
    copyPublicDir: false,
    rolldownOptions: { input: fileURLToPath(new URL("./crowd-check.html", import.meta.url)) },
  },
};
