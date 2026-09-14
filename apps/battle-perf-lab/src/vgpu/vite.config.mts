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
        find: /^typegpu$/,
        replacement: fileURLToPath(
          new URL("../../../../web/node_modules/typegpu/index.js", import.meta.url),
        ),
      },
      {
        find: /^vgpu$/,
        replacement: fileURLToPath(
          new URL("../../../../web/node_modules/vgpu/dist/index.js", import.meta.url),
        ),
      },
    ],
  },
  build: {
    rolldownOptions: {
      input: {
        preflight: fileURLToPath(new URL("./index.html", import.meta.url)),
        sky: fileURLToPath(new URL("./sky-check.html", import.meta.url)),
      },
    },
    outDir: fileURLToPath(new URL("../../../../throwaway/vgpu/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
