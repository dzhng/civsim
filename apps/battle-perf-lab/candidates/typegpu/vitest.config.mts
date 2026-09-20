import { fileURLToPath } from "node:url";
// Match the build transform so typed shader bodies carry resolution metadata.
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
