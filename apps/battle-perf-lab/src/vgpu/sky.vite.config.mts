import { fileURLToPath } from "node:url";
import base from "./vite.config.mts";
export default {
  ...base,
  root: fileURLToPath(new URL("../..", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/vgpu-sky/dist", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        vgpu: fileURLToPath(new URL("./sky-check.html", import.meta.url)),
        typegpu: fileURLToPath(new URL("../../candidates/typegpu/sky-check.html", import.meta.url)),
        raw: fileURLToPath(new URL("../raw/sky-check.html", import.meta.url)),
      },
    },
  },
};
