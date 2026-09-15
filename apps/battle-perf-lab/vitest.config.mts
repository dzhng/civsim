import { fileURLToPath } from "node:url";
export default {
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
};
