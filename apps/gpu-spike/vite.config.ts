import { defineConfig } from "vite";
import typegpu from "unplugin-typegpu/vite";
import wgsl from "@vgpu/wgsl/loader-vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        three: fileURLToPath(new URL("./three.html", import.meta.url)),
        gallery: fileURLToPath(new URL("./gallery.html", import.meta.url)),
        repro: fileURLToPath(new URL("./repro.html", import.meta.url)),
      },
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [typegpu(), wgsl()],
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: fileURLToPath(
          new URL("./node_modules/three/build/three.module.js", import.meta.url),
        ),
      },
      {
        find: /^three\/webgpu$/,
        replacement: fileURLToPath(
          new URL("./node_modules/three/build/three.webgpu.js", import.meta.url),
        ),
      },
      {
        find: /^three\/tsl$/,
        replacement: fileURLToPath(
          new URL("./node_modules/three/build/three.tsl.js", import.meta.url),
        ),
      },
    ],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
});
