import { fileURLToPath } from "node:url";
export default {
  resolve: {
    alias: {
      vgpu: fileURLToPath(new URL("../../web/node_modules/vgpu/dist/index.js", import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "report/**/*.test.ts", "trials/**/*.test.ts"],
  },
};
