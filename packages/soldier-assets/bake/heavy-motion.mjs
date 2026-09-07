import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";

const {
  values: { check },
} = parseArgs({ options: { check: { type: "boolean", default: false } } });
const source = await readFile(
  new URL("../assets/source/heavy-motion/heavy-motion.glb", import.meta.url),
);
const bundle = bakeAppearance({
  name: "heavy-motion",
  mounted: false,
  tiers: [source, source, source],
  loopClips: ["ready", "walk"],
  presentation: null,
});
const files = { "catalog.json": { appearances: { 0: "heavy/appearance.json" } } };
for (const [path, content] of Object.entries(bundle)) files[`heavy/${path}`] = content;
for (const root of [
  new URL("../assets/candidates/heavy-motion/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/heavy-motion/", import.meta.url),
]) {
  await writeAppearance(files, fileURLToPath(root), { check });
}
console.log(
  `Heavy motion candidate ${check ? "verified" : "written"}; production catalog unchanged`,
);
