import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";

const {
  values: { check },
} = parseArgs({ options: { check: { type: "boolean", default: false } } });
const source = await readFile(
  new URL("../assets/source/heavy-surfaces/heavy-surfaces.glb", import.meta.url),
);
// Identical provisional tiers: surface review cannot accept distance representations.
const bundle = bakeAppearance({
  name: "heavy-surfaces",
  mounted: false,
  tiers: APPEARANCE_MESH_TIERS.map(() => source),
  loopClips: [],
  presentation: null,
});
const files = {
  "catalog.json": { appearances: { 0: "surface/appearance.json", 1: "clay/appearance.json" } },
};
for (const [path, content] of Object.entries(bundle)) {
  files[`surface/${path}`] = content;
}
files["clay/appearance.json"] = {
  ...bundle["appearance.json"],
  skeleton: "../surface/skeleton.json",
  animation: "../surface/animation.json",
};
// The control shares every posed vertex and frame with the candidate. Only its
// surface table and explicit faction masks differ, so silhouette stays frozen.
files["clay/materials.json"] = {
  materials: bundle["materials.json"].materials.map(({ name }) => ({
    name: `clay-control-${name}`,
    baseColor: [0.46, 0.43, 0.39, 1],
    roughness: 0.82,
    metallic: 0,
  })),
  textures: {},
};
for (const path of bundle["appearance.json"].tiers) {
  const mesh = structuredClone(bundle[path]);
  mesh.factionMasks.fill(0);
  files[`clay/${path}`] = mesh;
}
for (const root of [
  new URL("../assets/candidates/heavy-surfaces/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/heavy-surfaces/", import.meta.url),
])
  await writeAppearance(files, fileURLToPath(root), { check });
console.log(
  `Heavy surfaces ${check ? "verified" : "written"}; matched clay control, production catalog unchanged`,
);
