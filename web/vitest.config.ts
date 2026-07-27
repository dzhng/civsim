import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest for the React UI overlay. The React plugin transforms JSX/TSX the same
// way the app build does, jsdom gives the components a DOM, and setup-tests.ts
// wires @testing-library/jest-dom matchers. The pure, DOM-free `.test.mjs`
// suites (cardGrid, armyBuilderState) stay on `node --test` (bun run test:ui);
// vitest owns the `.test.tsx` component tests.
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
      "src/**/*.test.tsx",
      "src/**/*.test.ui.ts",
      "tests/vitest/ambientAudio.test.ts",
      "tests/vitest/windSignal.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./setup-tests.ts"],
    globals: false,
  },
});
