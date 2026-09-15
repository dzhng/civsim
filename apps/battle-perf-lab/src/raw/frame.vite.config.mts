import { fileURLToPath } from "node:url";
import base from "./crowd.vite.config.mts";
export default {
  ...base,
  build: {
    ...base.build,
    outDir: fileURLToPath(new URL("../../../../throwaway/frame-control/dist", import.meta.url)),
    rolldownOptions: { input: fileURLToPath(new URL("./frame-check.html", import.meta.url)) },
  },
};
