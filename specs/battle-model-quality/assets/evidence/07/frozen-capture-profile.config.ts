import { execFileSync } from "node:child_process";

const root = new URL("../../../../../", import.meta.url).pathname;
const baseline = new URL("./baseline-timeline.ts", import.meta.url).pathname;
export default {
  root,
  plugins: [
    {
      name: "frozen-capture-baseline",
      resolveId(id: string) {
        if (id === "baseline-timeline") return baseline;
      },
      load(id: string) {
        if (id !== baseline) return;
        // Pin the pre-optimization controller without keeping a second implementation.
        return execFileSync(
          "git",
          ["show", "be522c50:packages/crowd-runtime/src/actionTimeline.ts"],
          { cwd: root, encoding: "utf8" },
        )
          .replaceAll('"../../soldier-assets/', `"${root}packages/soldier-assets/`)
          .replace('"./animationState"', `"${root}packages/crowd-runtime/src/animationState.ts"`);
      },
    },
  ],
  resolve: {
    alias: {
      "@packages": `${root}packages`,
      vitest: `${root}web/node_modules/vitest/dist/index.js`,
    },
  },
  test: {
    environment: "node",
    include: ["specs/battle-model-quality/assets/evidence/07/frozen-capture-profile.test.ts"],
    testTimeout: 120000,
  },
};
