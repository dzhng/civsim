import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";

const {
  values: { check },
} = parseArgs({ options: { check: { type: "boolean", default: false } } });
const bytes = await readFile(
  new URL("../assets/test/material-swatches/swatches.glb", import.meta.url),
);
// Same explicit diagnostic source at every tier; this is not authored LOD art.
const bundle = bakeAppearance({
  presentation: null,
  name: "six-material-swatches",
  mounted: false,
  tiers: [bytes, bytes, bytes],
  loopClips: [],
});
const files = { "catalog.json": { appearances: { 42: "swatches/appearance.json" } } };
for (const [path, content] of Object.entries(bundle)) files[`swatches/${path}`] = content;
for (const root of [
  new URL("../assets/candidates/material-swatches/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/material-swatches/", import.meta.url),
])
  await writeAppearance(files, fileURLToPath(root), { check });
console.log(`Six material swatches ${check ? "verified" : "written"}; production roster unchanged`);
