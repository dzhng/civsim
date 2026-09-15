import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.impostor-bake.config";
export default mergeConfig(base, {
  plugins: [
    {
      name: "runtime-atlas-without-three",
      generateBundle() {
        for (const id of this.getModuleIds())
          if (/node_modules\/three\/|packages\/photoreal-renderer\//.test(id))
            throw Error(`Runtime atlas loader imports rendering authoring code: ${id}`);
      },
    },
  ],
  build: {
    outDir: fileURLToPath(new URL("../throwaway/impostor-runtime-dist", import.meta.url)),
    rolldownOptions: {
      input: fileURLToPath(
        new URL("../packages/soldier-assets/bake/impostors/runtime.html", import.meta.url),
      ),
    },
  },
});
