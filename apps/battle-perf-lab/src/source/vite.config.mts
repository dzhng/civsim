import { fileURLToPath } from "node:url";
import base from "../../../../web/vite.config";
import { sourceTimestampTapPlugin } from "./timestampTap";
export default {
  ...base,
  root: fileURLToPath(new URL("../../../../web", import.meta.url)),
  plugins: [...(base.plugins ?? []), sourceTimestampTapPlugin()],
  optimizeDeps: { ...base.optimizeDeps, exclude: ["three", "three/webgpu", "three/tsl"] },
  build: {
    ...base.build,
    copyPublicDir: false,
    outDir: fileURLToPath(new URL("../../../../throwaway/source-ranges/dist", import.meta.url)),
  },
};
