import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { bakeAppearance } from "./appearance.mjs";
import { bakeGltf, parseGlb } from "./gltf.mjs";
import {
  bakeLocalAnimation,
  decodeLocalSample,
  resolveLocalSample,
} from "../src/localAnimation.ts";
import { localPoseToJointMatrices } from "../src/localPose.ts";
import {
  loadAppearanceBundle,
  loadAppearanceCatalog,
  decodeSoldierMesh,
} from "../src/appearanceBundle.ts";
import { poseSoldierMesh } from "../src/skin.ts";
import { editGlb } from "./test-harness/glb.mjs";
import { heavyMotionBake, heavyPresentation } from "./heavy-motion-contract.mjs";

const sourceRoot = new URL("../assets/test/blender-reference/", import.meta.url);
const human = await readFile(new URL("human.glb", sourceRoot));
const defaults = {
  presentation: null,
  name: "diagnostic",
  tiers: [human, human, human, human],
  loopClips: [],
};
const marked = bakeAppearance(defaults);
assert.equal(
  marked["appearance.json"].far.clip,
  marked["animation.json"].clips[0].name,
  "manual inspection keeps its first authored clip",
);
// The real reduced export has the exact same authored rig/actions; avoid
// spending this policy tracer on copies of the high-detail bound bake.
const heavyBytes = await readFile(
  new URL("../assets/source/heavy-kit/lods/far.glb", import.meta.url),
);
const admittedHeavy = bakeAppearance({
  name: "heavy-kit",
  mounted: false,
  tiers: [heavyBytes, heavyBytes, heavyBytes, heavyBytes],
  ...heavyMotionBake,
  presentation: heavyPresentation,
});
assert.equal(
  admittedHeavy["appearance.json"].far.clip,
  "ready",
  "admitted heavy atlas uses actual ready, never alphabetical inspection bend",
);
assert.deepEqual(
  [...new Set(marked["tier-0.mesh.json"].factionMasks)].sort(),
  [0, 0.25, 0.75, 1],
  "Blender-authored scalar faction mask survives the complete bundle bake",
);
const { json: sourceJson, bin: sourceBin } = parseGlb(human);
const sourceMaskIndex = sourceJson.meshes
  .flatMap((mesh) => mesh.primitives)
  .find((primitive) => primitive.attributes._FACTION_MASK != null).attributes._FACTION_MASK;
const sourceMask = sourceJson.accessors[sourceMaskIndex];
const sourceView = sourceJson.bufferViews[sourceMask.bufferView];
assert.equal(sourceMask.type, "SCALAR");
assert.equal(sourceMask.componentType, 5126);
const sourceData = new DataView(sourceBin.buffer, sourceBin.byteOffset, sourceBin.byteLength);
const authoredMask = Array.from({ length: sourceMask.count }, (_, vertex) =>
  sourceData.getFloat32(
    (sourceView.byteOffset ?? 0) +
      (sourceMask.byteOffset ?? 0) +
      vertex * (sourceView.byteStride ?? 4),
    true,
  ),
);
const importedMasks = bakeGltf(human).primitives.flatMap((primitive) => {
  if (primitive.nodeName !== "forward-tip")
    assert.ok(
      primitive.factionMasks.every((value) => value === 0),
      "unmarked source geometry stays unmarked",
    );
  else
    assert.deepEqual(
      Array.from(primitive.factionMasks),
      authoredMask,
      "mask values retain exact exported vertex order",
    );
  return Array.from(primitive.factionMasks);
});
for (let tier = 0; tier < 3; tier++)
  assert.deepEqual(
    marked[`tier-${tier}.mesh.json`].factionMasks,
    importedMasks,
    "merged vertex order retains the authored scalar mask",
  );
const unmarked = editGlb(human, (json) => {
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) delete primitive.attributes._FACTION_MASK;
});
const unmarkedBundle = bakeAppearance({
  ...defaults,
  tiers: [unmarked, unmarked, unmarked, unmarked],
});
assert.ok(
  unmarkedBundle["tier-0.mesh.json"].factionMasks.every((value) => value === 0),
  "absence means no faction concept, not color inference",
);
for (const field of Object.keys(marked["tier-0.mesh.json"])) {
  if (field !== "factionMasks")
    assert.deepEqual(
      marked["tier-0.mesh.json"][field],
      unmarkedBundle["tier-0.mesh.json"][field],
      `mask authoring does not change ${field}`,
    );
}
const maskAccessor = (json) =>
  json.accessors[
    json.meshes
      .flatMap((mesh) => mesh.primitives)
      .find((primitive) => primitive.attributes._FACTION_MASK != null).attributes._FACTION_MASK
  ];
const nullMask = editGlb(human, (json) => {
  json.meshes
    .flatMap((mesh) => mesh.primitives)
    .find((primitive) => primitive.attributes._FACTION_MASK != null).attributes._FACTION_MASK =
    null;
});
assert.throws(
  () => bakeAppearance({ ...defaults, tiers: [nullMask, human, human, human] }),
  /missing _FACTION_MASK/,
);
for (const [edit, error] of [
  [
    (accessor) => {
      accessor.type = "VEC2";
    },
    /_FACTION_MASK must be SCALAR/,
  ],
  [
    (accessor) => {
      accessor.componentType = 5123;
    },
    /_FACTION_MASK encoding unsupported/,
  ],
  [
    (accessor) => {
      accessor.normalized = true;
    },
    /_FACTION_MASK encoding unsupported/,
  ],
  [
    (accessor) => {
      accessor.count--;
    },
    /_FACTION_MASK count must match POSITION/,
  ],
]) {
  const invalid = editGlb(human, (json) => edit(maskAccessor(json)));
  assert.throws(
    () => bakeAppearance({ ...defaults, tiers: [invalid, human, human, human] }),
    error,
  );
}
for (const value of [-0.1, 1.1, NaN, Infinity]) {
  const invalid = editGlb(human, (json, bin) => {
    const accessor = maskAccessor(json);
    const view = json.bufferViews[accessor.bufferView];
    bin.writeFloatLE(value, (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0));
  });
  assert.throws(
    () => bakeAppearance({ ...defaults, tiers: [invalid, human, human, human] }),
    Number.isFinite(value) ? /_FACTION_MASK values must be between zero and one/ : /nonfinite data/,
  );
}
assert.throws(() => bakeAppearance({ ...defaults, tiers: [human] }), /explicit GLB byte arrays/);
assert.throws(
  () => bakeAppearance({ ...defaults, tiers: [new Uint8Array(8), human, human, human] }),
  /bad magic/,
);
assert.throws(() => bakeAppearance({ ...defaults, loopClips: ["unknown"] }), /loop clip unknown/);
assert.throws(() => bakeAppearance({ ...defaults, loopClips: undefined }), /declare loopClips/);
assert.throws(
  () =>
    bakeAppearance({
      ...defaults,
      tiers: [
        human,
        editGlb(human, (json) => {
          json.nodes[json.skins[0].joints[0]].translation[0] += 0.2;
        }),
        human,
        human,
      ],
    }),
  /bind or parent differs/,
);
const oppositeQuaternions = editGlb(human, (json) => {
  for (const node of json.nodes)
    if (node.rotation) node.rotation = node.rotation.map((value) => -value);
});
assert.doesNotThrow(
  () => bakeAppearance({ ...defaults, tiers: [human, oppositeQuaternions, human, human] }),
  "q and -q encode the same bind rotation",
);

// Reordering glTF skin slots must not change the shared rig used by the other tiers.
const reordered = editGlb(human, (json, bin) => {
  const skin = json.skins[0];
  const count = skin.joints.length;
  skin.joints.reverse();
  const accessor = json.accessors[skin.inverseBindMatrices];
  const matrixStart =
    (json.bufferViews[accessor.bufferView].byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const matrices = Buffer.from(bin.subarray(matrixStart, matrixStart + count * 64));
  for (let slot = 0; slot < count; slot++)
    matrices.copy(bin, matrixStart + slot * 64, (count - slot - 1) * 64, (count - slot) * 64);
  const jointAccessors = new Set(
    json.meshes.flatMap((mesh) =>
      mesh.primitives.map((primitive) => primitive.attributes.JOINTS_0),
    ),
  );
  for (const index of jointAccessors) {
    const joints = json.accessors[index];
    assert.equal(joints.componentType, 5121, "fixture joint slots are bytes");
    const view = json.bufferViews[joints.bufferView];
    const start = (view.byteOffset ?? 0) + (joints.byteOffset ?? 0);
    for (let vertex = 0; vertex < joints.count; vertex++) {
      for (let influence = 0; influence < 4; influence++) {
        const offset = start + vertex * (view.byteStride ?? 4) + influence;
        bin[offset] = count - bin[offset] - 1;
      }
    }
  }
});
const remapped = bakeAppearance({ ...defaults, tiers: [human, reordered, human, human] });
for (const field of Object.keys(remapped["tier-0.mesh.json"])) {
  if (field !== "materialIds")
    assert.deepEqual(
      remapped["tier-1.mesh.json"][field],
      remapped["tier-0.mesh.json"][field],
      `remapped tier ${field}`,
    );
}
for (let vertex = 0; vertex < remapped["tier-0.mesh.json"].materialIds.length; vertex++) {
  const near =
    remapped["materials.json"].materials[remapped["tier-0.mesh.json"].materialIds[vertex]];
  const mid =
    remapped["materials.json"].materials[remapped["tier-1.mesh.json"].materialIds[vertex]];
  assert.deepEqual(
    [near.baseColor, near.roughness, near.metallic],
    [mid.baseColor, mid.roughness, mid.metallic],
  );
}

let currentFiles;
const imageRequests = [];
const server = createServer((request, response) => {
  if (/\/images\//.test(request.url)) imageRequests.push(request.url);
  const file = currentFiles[decodeURIComponent(request.url.slice(1))];
  if (file == null) return response.writeHead(404).end();
  response.writeHead(200, {
    "Content-Type": file instanceof Uint8Array ? "model/gltf-binary" : "application/json",
  });
  response.end(file instanceof Uint8Array ? file : JSON.stringify(file));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const report = [];
try {
  for (const name of ["human", "mounted"]) {
    const bytes = await readFile(new URL(`${name}.glb`, sourceRoot));
    const oracle = JSON.parse(
      await readFile(new URL(`${name}.landmarks.json`, sourceRoot), "utf8"),
    );
    const source = bakeGltf(bytes);
    const options = {
      presentation: null,
      name: `${name}-diagnostic`,
      mounted: name === "mounted",
      tiers: [bytes, bytes, bytes, bytes],
      loopClips: name === "mounted" ? ["gait"] : [],
    };
    currentFiles = bakeAppearance(options);
    assert.deepEqual(bakeAppearance(options), currentFiles, "candidate bake must be deterministic");
    const bundle = await loadAppearanceBundle(
      `http://127.0.0.1:${server.address().port}/appearance.json`,
    );
    assert.equal(bundle.manifest.mounted, name === "mounted");
    for (const [channel, texture] of Object.entries(bundle.surface.textures)) {
      const emitted = currentFiles["materials.json"].textures[channel];
      assert.deepEqual(
        Buffer.from(texture.image),
        currentFiles[emitted.image],
        "production loader retains exact encoded image bytes",
      );
      assert.deepEqual(texture.sampler, emitted.sampler);
    }
    for (const clip of bundle.animation.clips) {
      assert.equal(clip.loop, options.loopClips.includes(clip.name));
      assert.equal(
        clip.duration,
        source.rig.clips.find((candidate) => candidate.name === clip.name).duration,
      );
    }
    for (const material of bundle.surface.materials) {
      const original = parseGlb(bytes).json.materials.find(
        (source) => source.name === material.name,
      );
      assert.deepEqual(
        material.baseColor,
        original.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1],
      );
      assert.equal(material.roughness, original.pbrMetallicRoughness?.roughnessFactor ?? 1);
      assert.equal(material.metallic, original.pbrMetallicRoughness?.metallicFactor ?? 1);
    }
    // Prove that retained local tracks can compose the oracle's independent rider mask.
    // Runtime composition remains06; this is a source-data retention check.
    if (name === "mounted") {
      const tracks = {};
      for (const clip of bundle.rig.clips) {
        for (const [bone, track] of Object.entries(clip.tracks)) {
          const inMask = oracle.riderUpperBodyMask.includes(bundle.rig.bones[bone].name);
          if (inMask === (clip.name === "rider-action")) tracks[bone] = track;
        }
      }
      bundle.rig.clips.push({ name: "composed", duration: 1, tracks });
    }
    const composedBake = bakeLocalAnimation(bundle.rig);
    let maximumError = 0,
      checkedVertices = 0;
    for (const sample of oracle.samples) {
      const animation = sample.clip === "composed" ? composedBake : bundle.animation;
      const clip = animation.clips.find((clip) => clip.name === sample.clip);
      const palette = localPoseToJointMatrices(
        bundle.rig,
        decodeLocalSample(
          animation,
          resolveLocalSample(animation, clip.name, sample.seconds / clip.duration),
        ),
      );
      for (const mesh of bundle.tiers) {
        const posed = poseSoldierMesh(mesh, palette);
        let offset = 0;
        for (const primitive of source.primitives) {
          const mapping = oracle.meshes.find(
            (mapping) =>
              mapping.node === primitive.nodeName && mapping.primitive === primitive.primitiveIndex,
          );
          for (let vertex = 0; vertex < primitive.positions.length / 3; vertex++) {
            const [x, y, z] =
              sample.positions[mapping.node][mapping.sourceVertexByGltfVertex[vertex]];
            const expected = [x, -z, y];
            const actual = posed.positions.subarray(
              (offset + vertex) * 3,
              (offset + vertex + 1) * 3,
            );
            const error = Math.hypot(...actual.map((value, axis) => value - expected[axis]));
            maximumError = Math.max(maximumError, error);
            checkedVertices++;
            assert.ok(
              error < oracle.toleranceMetres,
              `${name}/${sample.name}/${mapping.node}/${vertex}: ${error}m`,
            );
          }
          offset += primitive.positions.length / 3;
        }
      }
    }
    report.push({ fixture: name, samples: oracle.samples.length, checkedVertices, maximumError });
    currentFiles["catalog.json"] = { appearances: { 0: "appearance.json", 1: "appearance.json" } };
    const catalogUrl = `http://127.0.0.1:${server.address().port}/catalog.json`;
    const catalog = await loadAppearanceCatalog(catalogUrl);
    assert.equal(
      catalog[0].animation,
      catalog[1].animation,
      "shared source URL retains one decoded GPU resource identity",
    );
    assert.equal(catalog[0].rig, catalog[1].rig);
    const reload = await loadAppearanceCatalog(catalogUrl);
    assert.notEqual(
      reload[0].animation,
      catalog[0].animation,
      "reload starts a new resource generation",
    );
    // Separate appearance directories embed the same content-addressed atlas.
    for (const [path, value] of Object.entries(currentFiles)) currentFiles[`copy/${path}`] = value;
    currentFiles["catalog.json"] = {
      appearances: { 0: "appearance.json", 1: "copy/appearance.json" },
    };
    imageRequests.length = 0;
    const duplicated = await loadAppearanceCatalog(catalogUrl);
    for (const channel of Object.keys(duplicated[0].surface.textures)) {
      const original = duplicated[0].surface.textures[channel].image;
      assert.deepEqual(duplicated[1].surface.textures[channel].image, original);
    }
    const imageNames = new Set(
      Object.values(currentFiles["materials.json"].textures).map((t) => t.image),
    );
    assert.equal(
      imageRequests.length,
      imageNames.size,
      "each hashed atlas downloads once across appearance directories",
    );
    currentFiles["animation.json"].data.pop();
    await assert.rejects(loadAppearanceCatalog(catalogUrl), /invalid samples or metadata/);
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

// Individually Uint16 primitives require Uint32 after concatenation crosses the limit.
const large = editGlb(human, (json) => {
  const primitive = json.meshes[0].primitives[0];
  const count = json.accessors[primitive.attributes.POSITION].count;
  json.meshes[0].primitives = Array.from({ length: Math.ceil(65537 / count) }, () => primitive);
});
const largeFiles = bakeAppearance({ ...defaults, tiers: [large, large, large, large] });
const largeMesh = decodeSoldierMesh(largeFiles["tier-0.mesh.json"]);
assert.equal(largeFiles["tier-0.mesh.json"].indexFormat, "uint32");
assert.ok(largeMesh.indices.some((index) => index > 65535));
assert.ok(largeMesh.indices.every((index) => index < largeMesh.positions.length / 3));

const directory = await mkdtemp(join(tmpdir(), "appearance-bake-test-"));
try {
  const cli = fileURLToPath(new URL("./appearance.mjs", import.meta.url));
  const input = fileURLToPath(new URL("human.glb", sourceRoot));
  const args = [
    cli,
    "--near",
    input,
    "--intermediate",
    input,
    "--mid",
    input,
    "--far",
    input,
    "--out",
    directory,
    "--name",
    "cli-diagnostic",
    "--loop",
    "",
  ];
  execFileSync(process.execPath, args, { stdio: "pipe" });
  const first = await readFile(join(directory, "animation.json"));
  execFileSync(process.execPath, args, { stdio: "pipe" });
  assert.deepEqual(await readFile(join(directory, "animation.json")), first);
  assert.deepEqual(await readFile(join(directory, "source/tier-0.glb")), human);
  assert.equal(
    JSON.parse(await readFile(join(directory, "appearance.json"), "utf8")).name,
    "cli-diagnostic",
  );
  execFileSync(process.execPath, [...args, "--check"], { stdio: "pipe" });
  await writeFile(join(directory, "obsolete.json"), "{}");
  const stale = spawnSync(process.execPath, [...args, "--check"], { encoding: "utf8" });
  assert.notEqual(stale.status, 0);
  assert.ok(stale.stderr.includes("obsolete candidate asset"));
  await rm(join(directory, "obsolete.json"));
  await rm(join(directory, "tier-2.mesh.json"));
  const missing = spawnSync(process.execPath, [...args, "--check"], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.ok(
    missing.stderr.includes(
      `stale or missing candidate asset: ${join(directory, "tier-2.mesh.json")}`,
    ),
  );
  const invalid = spawnSync(
    process.execPath,
    [cli, "--near", input, "--out", directory, "--name", "bad", "--loop", ""],
    { encoding: "utf8" },
  );
  assert.notEqual(invalid.status, 0);
  assert.ok(invalid.stderr.includes("missing --intermediate"));
  assert.equal(
    JSON.parse(await readFile(join(directory, "appearance.json"), "utf8")).name,
    "cli-diagnostic",
  );
} finally {
  await rm(directory, { recursive: true });
}
console.log(
  JSON.stringify({ fixtures: report, uint32Merge: true, cli: true, deterministic: true }),
);
