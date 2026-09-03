import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The React plugin transforms JSX/TSX the same way the app build does, jsdom
// gives component tests a DOM, and setup-tests.ts wires
// @testing-library/jest-dom matchers. DOM-free suites select Vitest's node
// environment with a per-file directive.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
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
      {
        find: /^three$/,
        replacement: fileURLToPath(
          new URL("./node_modules/three/build/three.module.js", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.{ts,tsx,mjs}",
      "src/**/*.test.ui.ts",
      "tests/**/*.test.ts",
      "snapshot.test.mjs",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./setup-tests.ts"],
    globals: false,
  },
});
