import { fileURLToPath } from "node:url";
import typegpu from "../../../../web/node_modules/unplugin-typegpu/vite.js";
import base from "./vite.config.mts";
export default {
  ...base,
  plugins: [...(base.plugins ?? []), typegpu()],
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
