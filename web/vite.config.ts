import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// packages/* and apps/* are source-only directories outside this vite root, so
// their bare `three` imports never reach web/node_modules by directory walk-up.
// Alias the pinned three@0.185.1 builds explicitly (deps stay owned by
// web/package.json, per repo convention).
const threeBuild = (file: string) =>
  fileURLToPath(new URL(`./node_modules/three/build/${file}`, import.meta.url));

// Cross-origin isolation enables SharedArrayBuffer, which wasm threads will
// need later. Keeping it on from day one so nothing assumes its absence.
// The React/Tailwind plugins must not strip these — crossOriginIsolated
// stays true (verified by the S0 stack-setup slice).
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^three\/webgpu$/, replacement: threeBuild("three.webgpu.js") },
      { find: /^three\/tsl$/, replacement: threeBuild("three.tsl.js") },
      { find: /^three$/, replacement: threeBuild("three.module.js") },
    ],
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
