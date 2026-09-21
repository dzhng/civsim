import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";
import { heavyMotionBake, heavyPresentation } from "./heavy-motion-contract.mjs";

const {
  values: { check },
} = parseArgs({ options: { check: { type: "boolean", default: false } } });
const bundle = bakeAppearance({
  name: "heavy-kit",
  mounted: false,
  tiers: await Promise.all(
    APPEARANCE_MESH_TIERS.map((tier) =>
      readFile(new URL(`../assets/source/heavy-kit/lods/${tier}.glb`, import.meta.url)),
    ),
  ),
  ...heavyMotionBake,
  presentation: heavyPresentation,
});
const files = { "catalog.json": { appearances: { 0: "heavy/appearance.json" } } };
for (const [path, content] of Object.entries(bundle)) files[`heavy/${path}`] = content;
for (const root of [
  new URL("../assets/candidates/heavy-kit/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/heavy-kit/", import.meta.url),
])
  await writeAppearance(files, fileURLToPath(root), { check });
console.log(`Heavy kit candidate ${check ? "verified" : "written"}; production catalog unchanged`);
