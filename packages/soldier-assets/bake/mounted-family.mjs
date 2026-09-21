import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";
import {
  mountedLoopClips,
  mountedClipMetadata,
  mountedPresentation,
} from "./mounted-motion-contract.mjs";

const { values } = parseArgs({
  options: {
    directory: {
      type: "string",
      default: fileURLToPath(new URL("../assets/source/mounted-family/", import.meta.url)),
    },
    check: { type: "boolean", default: false },
  },
});
const variants = [
  [6, "shock-cavalry"],
  [15, "shock-cavalry-sidearm"],
  [7, "horse-archer"],
];
for (const [id, name] of variants) {
  // The unreduced export is near; coarser tiers are the one runtime reduction chain.
  const tiers = await Promise.all(
    APPEARANCE_MESH_TIERS.map((tier) =>
      readFile(
        `${values.directory}/${tier === "near" ? `${name}.glb` : `${name}/runtime/${tier}.glb`}`,
      ),
    ),
  );
  const bundle = bakeAppearance({
    name,
    mounted: true,
    tiers,
    loopClips: mountedLoopClips,
    clipMetadata: mountedClipMetadata(id === 7),
    presentation: mountedPresentation(id === 7),
  });
  const files = { "catalog.json": { appearances: { [id]: "mount/appearance.json" } } };
  for (const [path, content] of Object.entries(bundle)) files[`mount/${path}`] = content;
  for (const root of [
    new URL(`../assets/candidates/${name}/`, import.meta.url),
    new URL(`../../../web/public/assets/soldiers/candidates/${name}/`, import.meta.url),
  ])
    await writeAppearance(files, fileURLToPath(root), { check: values.check });
  console.log(`${name}: complete mounted presentation and genuine mesh tiers`);
}
