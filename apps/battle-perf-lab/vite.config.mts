import { fileURLToPath } from "node:url";
import webConfig from "../../web/vite.config";

const worldPath = fileURLToPath(new URL("../../web/src/battle/battleWorld.ts", import.meta.url));
const productionWorldPath = fileURLToPath(
  new URL("../../packages/photoreal-renderer/src/battle/battleWorld", import.meta.url),
);
const rendererPath = fileURLToPath(new URL("../../web/src/battle/renderer.ts", import.meta.url));
const worldCapturePath = fileURLToPath(
  new URL("./src/CapturePhotorealBattleWorld.ts", import.meta.url),
);
const capturePath = fileURLToPath(new URL("./src/CaptureBattleRenderer.ts", import.meta.url));

// The actual main/menu/battle loop is unchanged. Only this lab build substitutes
// the renderer at the production world's import boundary.
export default {
  ...webConfig,
  root: fileURLToPath(new URL("../../web", import.meta.url)),
  build: { ...webConfig.build, outDir: "dist-battle-perf-lab" },
  plugins: [
    ...(webConfig.plugins ?? []),
    {
      name: "battle-capture-renderer",
      enforce: "pre",
      resolveId(source: string, importer?: string) {
        if (
          (source === "@packages/photoreal-renderer/src/battle/battleWorld" ||
            source === productionWorldPath ||
            source === `${productionWorldPath}.ts`) &&
          importer?.split("?")[0] === rendererPath
        )
          return worldCapturePath;
        if (source === "./renderer" && importer?.split("?")[0] === worldPath) return capturePath;
        return null;
      },
    },
  ],
};
