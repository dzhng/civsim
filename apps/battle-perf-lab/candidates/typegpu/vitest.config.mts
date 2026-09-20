import { fileURLToPath } from "node:url";
// The same transform the candidate Vite build uses; typed shader bodies only resolve to WGSL
// once it has attached their syntax tree.
import typegpu from "../../../../web/node_modules/unplugin-typegpu/vite.js";
export default {
  plugins: [typegpu()],
  resolve: {
    alias: {
      typegpu: fileURLToPath(
        new URL("../../../../web/node_modules/typegpu/index.js", import.meta.url),
      ),
    },
  },
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
};
