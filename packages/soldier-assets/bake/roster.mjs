import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { APPEARANCE_DESCRIPTORS } from "../src/appearance.ts";
import { APPEARANCE_MESH_TIERS } from "../src/appearanceBundle.ts";
import { bakeAppearance, writeAppearance } from "./appearance.mjs";
import { heavyMotionBake, heavyPresentation } from "./heavy-motion-contract.mjs";

/** Saved source and actual engine roles, never the diagnostic placeholder bindings. */
export async function rosterRecipe(descriptor) {
  const { name, look, selection } = descriptor;
  if (look.mounted) {
    const { mountedLoopClips, mountedClipMetadata, mountedPresentation } =
      await import("./mounted-motion-contract.mjs");
    const source =
      name === "horse-archers"
        ? "horse-archer"
        : name === "shock-cav"
          ? "shock-cavalry"
          : "shock-cavalry-sidearm";
    return {
      source: "mounted-family",
      lods: `${source}/runtime`,
      loopClips: mountedLoopClips,
      clipMetadata: mountedClipMetadata(look.weapon === "bow"),
      presentation: mountedPresentation(look.weapon === "bow"),
    };
  }
  if (look.weapon.startsWith("pike")) {
    const { pikeMotionBake, pikeFamilyPresentation } = await import("./pike-motion-contract.mjs");
    const source =
      name === "heavy-phalanx-rest"
        ? "phalanx"
        : name === "medium-phalanx-rest"
          ? "medium-phalanx"
          : name;
    return {
      source,
      ...(selection.state === "sidearm" ? heavyMotionBake : pikeMotionBake),
      presentation: pikeFamilyPresentation(selection.state),
    };
  }
  if (["spear", "greatsword"].includes(look.weapon)) {
    const { meleeFootMotionBake, meleeFootPresentation } =
      await import("./melee-foot-contract.mjs");
    return {
      source: name,
      ...meleeFootMotionBake(name),
      presentation: meleeFootPresentation(name),
    };
  }
  const release = { bow: "bow-release", javelin: "throw-release", artillery: "crew-release" }[
    look.weapon
  ];
  return {
    source: name === "heavy-sword" ? "heavy-kit" : `foot-roster/${name}`,
    ...heavyMotionBake,
    clipMetadata: {
      ...heavyMotionBake.clipMetadata,
      ...(release ? { [release]: { markers: { release: 0 } } } : {}),
    },
    presentation: {
      ...heavyPresentation,
      actions: {
        ...heavyPresentation.actions,
        release: release ? { clip: release, layer: "fullBody" } : null,
      },
    },
  };
}

export async function bakeRosterAppearance(descriptor) {
  const { source, lods = "lods", ...motion } = await rosterRecipe(descriptor);
  const root = new URL(`../assets/source/${source}/`, import.meta.url);
  const tiers = await Promise.all(
    APPEARANCE_MESH_TIERS.map((tier) => readFile(new URL(`${lods}/${tier}.glb`, root))),
  );
  return bakeAppearance({
    name: descriptor.name,
    mounted: descriptor.look.mounted,
    tiers,
    ...motion,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      name: { type: "string" },
      check: { type: "boolean", default: false },
    },
  });
  if (!values.out) throw new Error("Provide --out for the complete generated catalog");
  const entries = APPEARANCE_DESCRIPTORS.map((descriptor, id) => ({ descriptor, id })).filter(
    ({ descriptor }) => !values.name || descriptor.name === values.name,
  );
  if (!entries.length) throw new Error(`Unknown appearance ${values.name}`);
  const prior = async (name) => {
    if (!values.name) return {};
    try {
      return JSON.parse(await readFile(resolve(values.out, name), "utf8")).appearances;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  };
  const appearances = await prior("catalog.json"),
    review = await prior("review-matrix.json");
  const failures = [];
  for (const { descriptor, id } of entries) {
    try {
      const files = await bakeRosterAppearance(descriptor);
      const hash = createHash("sha256");
      for (const [path, content] of Object.entries(files)) {
        hash.update(path).update(content instanceof Uint8Array ? content : JSON.stringify(content));
      }
      // Content-addressed bundles leave the published catalog usable even if
      // another row fails. The catalog switches only after every bundle exists.
      const path = `appearances/${descriptor.name}/${hash.digest("hex").slice(0, 16)}`;
      const destination = resolve(values.out, path);
      const existing = await stat(destination).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (values.check || existing) {
        await writeAppearance(files, destination, { check: true });
      } else {
        await mkdir(dirname(destination), { recursive: true });
        const staging = await mkdtemp(`${destination}.staging-`);
        try {
          await writeAppearance(files, staging);
          await rename(staging, destination);
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      }
      appearances[id] = `${path}/appearance.json`;
      review[id] = {
        name: descriptor.name,
        selection: descriptor.selection,
        ...files["appearance.json"].presentation,
      };
      console.log(`${descriptor.name}: ${values.check ? "verified" : "baked"}`);
    } catch (error) {
      failures.push(`${descriptor.name}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  // Catalog publication follows complete coverage; never advertise a failed row.
  for (const [name, data] of Object.entries({
    "review-matrix.json": { appearances: review },
    "catalog.json": { appearances },
  })) {
    const path = resolve(values.out, name);
    const bytes = `${JSON.stringify(data, null, 2)}\n`;
    if (values.check) {
      if ((await readFile(path, "utf8")) !== bytes) throw new Error(`Stale ${path}`);
    } else {
      await mkdir(resolve(values.out), { recursive: true });
      await writeFile(`${path}.next`, bytes);
      await rename(`${path}.next`, path);
    }
  }
}
