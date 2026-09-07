import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";

const {
  values: { check },
} = parseArgs({ options: { check: { type: "boolean", default: false } } });
const source = await readFile(new URL("../assets/source/heavy-kit/heavy-kit.glb", import.meta.url));
// These identical tiers are source-fitting candidates, not accepted distance representations.
const bundle = bakeAppearance({
  name: "heavy-kit",
  mounted: false,
  tiers: [source, source, source],
  loopClips: ["idle", "ready", "walk", "run", "guarded-backward-walk", "guarded-left-walk"],
  // Reviewed motion recipe: metres traveled during one authored support/recovery cycle.
  clipMetadata: { walk: { strideMeters: 1.53 }, run: { strideMeters: 2.584 } },
  presentation: null,
});
const files = { "catalog.json": { appearances: { 0: "heavy/appearance.json" } } };
for (const [path, content] of Object.entries(bundle)) files[`heavy/${path}`] = content;
for (const root of [
  new URL("../assets/candidates/heavy-kit/", import.meta.url),
  new URL("../../../web/public/assets/soldiers/candidates/heavy-kit/", import.meta.url),
])
  await writeAppearance(files, fileURLToPath(root), { check });
console.log(`Heavy kit candidate ${check ? "verified" : "written"}; production catalog unchanged`);
