import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { APPEARANCE_DESCRIPTORS } from "../src/appearance.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";
import { heavyMotionBake } from "./heavy-motion-contract.mjs";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    source: { type: "string" },
    check: { type: "boolean", default: false },
  },
});
const id = APPEARANCE_DESCRIPTORS.findIndex(({ name }) => name === values.name);
if (id < 0 || !values.source) throw new Error("Provide a canonical --name and saved --source GLB");
const descriptor = APPEARANCE_DESCRIPTORS[id];
if (descriptor.look.mounted || descriptor.look.weapon !== "sword")
  throw new Error("This composition imports the fitted foot-sword action set");
const source = await readFile(resolve(values.source));
const bundle = bakeAppearance({
  name: descriptor.name,
  mounted: false,
  tiers: [source, source, source],
  ...heavyMotionBake,
  presentation: null,
});
const files = { "catalog.json": { appearances: { [id]: "soldier/appearance.json" } } };
for (const [path, content] of Object.entries(bundle)) files[`soldier/${path}`] = content;
await writeAppearance(
  files,
  fileURLToPath(
    new URL(`../../../web/public/assets/soldiers/candidates/${descriptor.name}/`, import.meta.url),
  ),
  { check: values.check },
);
console.log(`${descriptor.name} ${values.check ? "verified" : "baked"} for workbench review`);
