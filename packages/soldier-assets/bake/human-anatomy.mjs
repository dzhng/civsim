import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";

const {
  values: { check },
} = parseArgs({
  options: { check: { type: "boolean", default: false } },
});
const source = await readFile(
  new URL("../assets/source/human-anatomy/human-anatomy.glb", import.meta.url),
);
// Identical tiers are anatomy-inspection candidates, never accepted distance representations.
const bundle = bakeAppearance({
  name: "human-anatomy",
  mounted: false,
  tiers: APPEARANCE_MESH_TIERS.map(() => source),
  loopClips: [],
  presentation: null,
});
const files = {
  "catalog.json": { appearances: { 0: "human/appearance.json", 14: "human/appearance.json" } },
};
for (const [path, content] of Object.entries(bundle)) files[`human/${path}`] = content;
for (const root of [
  new URL("../assets/candidates/human-anatomy/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/human-anatomy/", import.meta.url),
])
  await writeAppearance(files, fileURLToPath(root), { check });
console.log(
  `Human anatomy candidate ${check ? "verified" : "written"}; production catalog unchanged`,
);
