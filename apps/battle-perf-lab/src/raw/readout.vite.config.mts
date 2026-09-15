import { fileURLToPath } from "node:url";
import base from "./crowd.vite.config.mts";
export default {
  ...base,
  build: {
    ...base.build,
    outDir: fileURLToPath(new URL("../../../../throwaway/readout-control/dist", import.meta.url)),
    rolldownOptions: { input: fileURLToPath(new URL("./readout-check.html", import.meta.url)) },
  },
};
