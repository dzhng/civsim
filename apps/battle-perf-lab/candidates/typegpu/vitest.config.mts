import { fileURLToPath } from "node:url";
export default {
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
