import { fileURLToPath } from "node:url";
import base from "../../../../web/vite.config";
export default {
  ...base,
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
};
