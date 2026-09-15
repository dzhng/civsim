import { fileURLToPath } from "node:url";
import base from "./crowd.vite.config.mts";
export default {
  ...base,
  build: {
    ...base.build,
    outDir: fileURLToPath(new URL("../../../../throwaway/backdrop-control/dist", import.meta.url)),
    rolldownOptions: { input: fileURLToPath(new URL("./backdrop-check.html", import.meta.url)) },
  },
};
