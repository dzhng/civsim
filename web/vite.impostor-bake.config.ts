import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../packages/soldier-assets/bake/impostors", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  build: {
    copyPublicDir: false,
    outDir: fileURLToPath(new URL("../throwaway/impostor-bake-dist", import.meta.url)),
    emptyOutDir: true,
  },
});
