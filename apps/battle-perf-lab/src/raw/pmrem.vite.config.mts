import { fileURLToPath } from "node:url";
import typegpu from "../../../../web/node_modules/unplugin-typegpu/vite.js";
import base from "../vgpu/vite.config.mts";
export default {
  ...base,
  plugins: [...(base.plugins ?? []), typegpu()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/pmrem-control/dist", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: { input: fileURLToPath(new URL("./pmrem-check.html", import.meta.url)) },
  },
};
