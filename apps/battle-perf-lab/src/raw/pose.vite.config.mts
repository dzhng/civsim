import { fileURLToPath } from "node:url";
import base from "./impostor.vite.config.mts";
export default {
  ...base,
  build: {
    ...base.build,
    outDir: fileURLToPath(new URL("../../../../throwaway/pose-control/dist", import.meta.url)),
    rolldownOptions: { input: fileURLToPath(new URL("./pose-check.html", import.meta.url)) },
  },
};
