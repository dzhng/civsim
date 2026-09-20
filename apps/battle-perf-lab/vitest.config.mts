import { fileURLToPath } from "node:url";
export default {
  resolve: {
    alias: {
      // Listed before the bare specifier so the subpath is not rewritten into `index.js/mock`.
      "vgpu/mock": fileURLToPath(
        new URL("../../web/node_modules/vgpu/dist/mock.js", import.meta.url),
      ),
      vgpu: fileURLToPath(new URL("../../web/node_modules/vgpu/dist/index.js", import.meta.url)),
      // The lab's own seams reach into the TypeGPU candidate; this suite resolves the
      // library the same way the candidate's config does.
      typegpu: fileURLToPath(new URL("../../web/node_modules/typegpu/index.js", import.meta.url)),
      "@packages": fileURLToPath(new URL("../../packages", import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "report/**/*.test.ts", "trials/**/*.test.ts"],
  },
};
