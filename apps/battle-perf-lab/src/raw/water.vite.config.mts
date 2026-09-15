import { fileURLToPath } from "node:url";
import base from "./crowd.vite.config.mts";
export default {
  ...base,
  build: {
    ...base.build,
    outDir: fileURLToPath(new URL("../../../../throwaway/water-control/dist", import.meta.url)),
    rolldownOptions: { input: fileURLToPath(new URL("./water-check.html", import.meta.url)) },
  },
};
