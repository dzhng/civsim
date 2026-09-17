import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";

const {
  values: { check },
} = parseArgs({ options: { check: { type: "boolean", default: false } } });
const files = {},
  appearances = {};
for (const [id, name, mounted, loopClips] of [
  [40, "human", false, []],
  [41, "mounted", true, ["gait"]],
]) {
  const bytes = await readFile(
    new URL(`../assets/test/blender-reference/${name}.glb`, import.meta.url),
  );
  // Deliberately identical diagnostic inputs: these prove the pipeline, not final-art LOD quality.
  const bundle = bakeAppearance({
    presentation: null,
    name: `${name}-diagnostic`,
    mounted,
    tiers: APPEARANCE_MESH_TIERS.map(() => bytes),
    loopClips,
  });
  for (const [path, content] of Object.entries(bundle)) files[`${name}/${path}`] = content;
  appearances[id] = `${name}/appearance.json`;
}
files["catalog.json"] = { appearances };
for (const root of [
  new URL("../assets/candidates/blender-reference/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/blender-reference/", import.meta.url),
]) {
  await writeAppearance(files, fileURLToPath(root), { check });
}
console.log(
  `Blender diagnostic candidates ${check ? "verified" : "written"}; production catalog unchanged`,
);
