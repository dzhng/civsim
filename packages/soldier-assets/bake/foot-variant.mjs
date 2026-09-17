import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { APPEARANCE_DESCRIPTORS } from "../src/appearance.ts";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
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
if (descriptor.look.mounted || !["sword", "bow", "javelin", "artillery"].includes(descriptor.look.weapon))
  throw new Error("This composition imports fitted foot actions, not mounted motion");
const source = await readFile(resolve(values.source));
const bundle = bakeAppearance({
  name: descriptor.name,
  mounted: false,
  tiers: APPEARANCE_MESH_TIERS.map(() => source),
  ...heavyMotionBake,
  clipMetadata: {
    ...heavyMotionBake.clipMetadata,
    ...Object.fromEntries(
      ({ bow: ["bow-release"], javelin: ["throw-release"], artillery: ["crew-release"] }[
        descriptor.look.weapon
      ] ?? []).map((clip) => [clip, { markers: { release: 0 } }]),
    ),
  },
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
