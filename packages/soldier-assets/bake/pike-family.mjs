import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APPEARANCE_DESCRIPTORS } from "../src/appearance.ts";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";
import { heavyMotionBake } from "./heavy-motion-contract.mjs";
import { pikeMotionBake, pikeFamilyPresentation } from "./pike-motion-contract.mjs";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    check: { type: "boolean", default: false },
  },
});
const ids = [3, 14, 16, 17, 18, 19].filter(
  (id) => !values.name || APPEARANCE_DESCRIPTORS[id].name === values.name,
);
if (!ids.length) throw new Error("Unknown pike-family appearance");
for (const id of ids) {
  const descriptor = APPEARANCE_DESCRIPTORS[id];
  // Rest selects a different standing action on the same physical pike kit.
  const sourceName = id === 16 ? "phalanx" : id === 17 ? "medium-phalanx" : descriptor.name;
  const sourceRoot = new URL(`../assets/source/${sourceName}/`, import.meta.url);
  // The unreduced saved export is this candidate's near tier.
  const tiers = await Promise.all(
    APPEARANCE_MESH_TIERS.map((tier) =>
      readFile(new URL(tier === "near" ? `${sourceName}.glb` : `lods/${tier}.glb`, sourceRoot)),
    ),
  );
  const bundle = bakeAppearance({
    name: descriptor.name,
    mounted: false,
    tiers,
    ...(descriptor.selection.state === "sidearm" ? heavyMotionBake : pikeMotionBake),
    presentation: pikeFamilyPresentation(descriptor.selection.state),
  });
  const folder = id === 14 ? "medium" : "soldier";
  const files = { "catalog.json": { appearances: { [id]: `${folder}/appearance.json` } } };
  for (const [path, content] of Object.entries(bundle)) files[`${folder}/${path}`] = content;
  for (const root of [
    `../assets/candidates/${descriptor.name}/`,
    `../../../web/public/assets/soldiers/candidates/${descriptor.name}/`,
  ])
    await writeAppearance(files, fileURLToPath(new URL(root, import.meta.url)), {
      check: values.check,
    });
  console.log(`${descriptor.name} ${values.check ? "verified" : "baked"}`);
}
