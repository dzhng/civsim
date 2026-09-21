import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// The React plugin transforms JSX/TSX the same way the app build does, jsdom
// gives component tests a DOM, and setup-tests.ts wires
// @testing-library/jest-dom matchers. DOM-free suites select Vitest's node
// environment with a per-file directive.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: [
        "src/**/*.test.{ts,tsx,mjs}",
        "src/**/*.test.ui.ts",
        "tests/**/*.test.ts",
        "snapshot.test.mjs",
        "scene.test.mjs",
      ],
      exclude: ["**/node_modules/**", "**/dist/**"],
      setupFiles: ["./setup-tests.ts"],
      globals: false,
    },
  }),
);
