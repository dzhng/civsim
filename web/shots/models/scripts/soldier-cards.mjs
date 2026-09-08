// Production-derived 200×184 card portraits. --check is CPU-only copy/manifest verification.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { snapCheck, snapshotSelected } from "../../../snapshot.mjs";
import {
  appearances,
  artifactStem,
  montage,
  openSoldierCapture,
  roleClip,
  selectedAppearances,
} from "./_soldier-capture.mjs";

const directories = [
  new URL("../../../../packages/soldier-assets/assets/cards/", import.meta.url),
  new URL("../../../public/assets/soldiers/cards/", import.meta.url),
];
const manifest = Object.fromEntries(
  appearances.map((appearance) => [appearance.id, `${artifactStem(appearance)}.png`]),
);

if (process.argv.includes("--check")) {
  for (const directory of directories) {
    const stored = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
    if (JSON.stringify(stored) !== JSON.stringify(manifest))
      throw new Error(`Stale card manifest: ${directory}`);
  }
  for (const file of Object.values(manifest)) {
    const [source, served] = await Promise.all(
      directories.map((directory) => readFile(new URL(file, directory))),
    );
    if (!source.equals(served)) throw new Error(`Card copies differ: ${file}`);
  }
  console.log("Card manifests and served portraits agree");
} else if (snapshotSelected("models/cards/portraits")) {
  const selected = new Set(selectedAppearances().map(({ id }) => id));
  const capture = await openSoldierCapture();
  try {
    const portraits = [];
    for (const appearance of appearances) {
      if (!selected.has(appearance.id)) {
        portraits.push(await readFile(new URL(manifest[appearance.id], directories[0])));
        continue;
      }
      const clip = roleClip(capture.assets[appearance.id], "ready");
      portraits.push(
        await capture.capture(appearance, clip, 0, {
          width: 200,
          height: 184,
          yaw: Math.PI + Math.PI / 12,
          pitch: 1.25,
          framing: "figure",
        }),
      );
    }
    let failed = false;
    await snapCheck(
      capture.page,
      "models/cards/portraits",
      (name, ok, detail) => {
        console.log(ok ? "PASS" : "FAIL", name, detail);
        failed ||= !ok;
      },
      { shot: montage(portraits, 4), threshold: 0, maxDiffRatio: 0 },
    );
    if (failed) throw new Error("Card montage differs; public portraits were not overwritten");
    for (const directory of directories) {
      await mkdir(directory, { recursive: true });
      for (let i = 0; i < appearances.length; i++)
        if (selected.has(appearances[i].id))
          await writeFile(new URL(manifest[appearances[i].id], directory), portraits[i]);
      await writeFile(
        new URL("manifest.json", directory),
        JSON.stringify(manifest, null, 2) + "\n",
      );
    }
  } finally {
    await capture.close();
  }
}
