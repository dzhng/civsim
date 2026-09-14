import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../web/package.json", import.meta.url));
const { mergeConfig }: typeof import("../../../../web/node_modules/vite/dist/node/index.js") =
  await import(require.resolve("vite"));
import base from "../../../../web/vite.config";
export default mergeConfig(base, {
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: [
      {
        find: /^vgpu$/,
        replacement: fileURLToPath(
          new URL("../../../../web/node_modules/vgpu/dist/index.js", import.meta.url),
        ),
      },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("../../../../throwaway/vgpu/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
