import { fileURLToPath } from "node:url";
import typegpu from "../../../../web/node_modules/unplugin-typegpu/vite.js";
import base from "../../../../web/vite.config";
const backend = process.env.BATTLE_NATIVE_BACKEND;
const atlas = process.env.BATTLE_NATIVE_ATLAS_CATALOG;
if (!backend || !["raw", "typegpu", "vgpu"].includes(backend))
  throw Error("Set BATTLE_NATIVE_BACKEND=raw|typegpu|vgpu");
if (!atlas) throw Error("Set BATTLE_NATIVE_ATLAS_CATALOG to the prepared full catalog URL");
const world = fileURLToPath(new URL("../../../../web/src/battle/battleWorld.ts", import.meta.url));
export default {
  ...base,
  root: fileURLToPath(new URL("../../../../web", import.meta.url)),
  define: {
    __BATTLE_NATIVE_BACKEND__: JSON.stringify(backend),
    __BATTLE_NATIVE_ATLAS_CATALOG__: JSON.stringify(atlas),
  },
  resolve: {
    ...base.resolve,
    alias: [
      ...(base.resolve?.alias ?? []),
      {
        find: /^typegpu$/,
        replacement: fileURLToPath(
          new URL("../../../../web/node_modules/typegpu/index.js", import.meta.url),
        ),
      },
      {
        find: /^vgpu$/,
        replacement: fileURLToPath(
          new URL("../../../../web/node_modules/vgpu/dist/index.js", import.meta.url),
        ),
      },
    ],
  },
  plugins: [
    ...(base.plugins ?? []),
    typegpu(),
    {
      name: "native-live-renderer",
      enforce: "pre",
      resolveId(source: string, importer?: string) {
        if (source === "./renderer" && importer?.split("?")[0] === world)
          return fileURLToPath(new URL("./NativeBattleRenderer.ts", import.meta.url));
        return null;
      },
    },
  ],
  build: {
    ...base.build,
    copyPublicDir: false,
    outDir: fileURLToPath(new URL("../../../../throwaway/native-live/dist", import.meta.url)),
  },
};
