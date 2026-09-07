import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";

const { values: { check } } = parseArgs({ options: { check: { type: "boolean", default: false } } });
const source = await readFile(new URL("../assets/source/medium-phalanx/medium-phalanx.glb", import.meta.url));
// Identical tiers are provisional fitting content, not distance-ready artwork.
const bundle = bakeAppearance({
  name: "medium-phalanx",
  mounted: false,
  tiers: [source, source, source],
  loopClips: ["pike-carry", "ready", "walk", "run", "pike-ready"],
  presentation: null,
});
const files = { "catalog.json": { appearances: { 14: "medium/appearance.json" } } };
for (const [path, content] of Object.entries(bundle)) files[`medium/${path}`] = content;
for (const root of [
  new URL("../assets/candidates/medium-phalanx/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/medium-phalanx/", import.meta.url),
]) await writeAppearance(files, fileURLToPath(root), { check });
console.log(`Medium phalanx candidate ${check ? "verified" : "written"}; production catalog unchanged`);
