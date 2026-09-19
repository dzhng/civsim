import { fileURLToPath } from "node:url";
import { wholeMapShadowControlPlugins } from "./wholeMapShadowControl";

// The control is a build-time substitution, so the only honest way to test what
// it does is to run the tests through a build that carries it. The request is
// explicit here rather than read from the environment: these cases are ABOUT
// the controlled build, and must not go quietly green on an uncontrolled one.
export default {
  plugins: wholeMapShadowControlPlugins("whole-map"),
  resolve: {
    alias: { "@packages": fileURLToPath(new URL("../../../../packages", import.meta.url)) },
  },
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
};
