import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { bakeGltf, parseGlb } from "./gltf.mjs";
import { gltfToEngineBasis } from "./engine-basis.mjs";
import { bakeLocalAnimation, encodeLocalAnimation } from "../src/localAnimation.ts";
import { deriveAnimatedBounds } from "./animated-bounds.mjs";
import { appearanceMaterials } from "./materials.mjs";
import { encodeSoldierMesh } from "../src/appearanceBundle.ts";
import { assertAppearancePresentation } from "../src/presentation.ts";
import { assertPresentationMotion } from "./presentation.mjs";

function jointMap(source, target, tier) {
  const names = new Map(target.bones.map((bone, index) => [bone.name, index]));
  if (
    names.size !== target.bones.length ||
    new Set(source.bones.map((bone) => bone.name)).size !== source.bones.length
  ) {
    throw new Error(
      "tier skeletons require unique bone names; name every deform bone and ancestor in Blender",
    );
  }
  if (source.bones.length !== target.bones.length)
    throw new Error(`tier ${tier}: skeleton bone count differs from near tier`);
  return source.bones.map((bone) => {
    const index = names.get(bone.name);
    if (index == null)
      throw new Error(`tier ${tier}: skeleton bone ${bone.name} is absent from near tier`);
    const expected = target.bones[index];
    const parent = bone.parent < 0 ? null : source.bones[bone.parent].name;
    const expectedParent = expected.parent < 0 ? null : target.bones[expected.parent].name;
    const actualValues = [...bone.bind.T, ...bone.bind.S, ...bone.inverseBind];
    const expectedValues = [...expected.bind.T, ...expected.bind.S, ...expected.inverseBind];
    const rotationError = Math.min(
      ...[1, -1].map((sign) =>
        Math.hypot(...bone.bind.R.map((value, i) => value - sign * expected.bind.R[i])),
      ),
    );
    if (
      parent !== expectedParent ||
      rotationError > 1e-6 ||
      actualValues.some((value, i) => Math.abs(value - expectedValues[i]) > 1e-6)
    ) {
      throw new Error(
        `tier ${tier}: bone ${bone.name} bind or parent differs from near tier; export all tiers with the same rig`,
      );
    }
    return index;
  });
}

function mergedMesh(primitives, remap, materialSlot) {
  const count = primitives.reduce((sum, primitive) => sum + primitive.positions.length / 3, 0);
  const mesh = {
    positions: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    colors: new Float32Array(count * 4),
    joints: new Uint16Array(count * 4),
    weights: new Float32Array(count * 4),
    uvs: new Float32Array(count * 2),
    tangents: new Float32Array(count * 4),
    materialIds: new Float32Array(count),
    factionMasks: new Float32Array(count),
    indices: new (count > 65536 ? Uint32Array : Uint16Array)(
      primitives.reduce((sum, primitive) => sum + primitive.indices.length, 0),
    ),
  };
  let vertexOffset = 0,
    indexOffset = 0;
  for (const primitive of primitives) {
    const vertices = primitive.positions.length / 3;
    for (const [field, width] of Object.entries({
      positions: 3,
      normals: 3,
      colors: 4,
      weights: 4,
      uvs: 2,
      tangents: 4,
      factionMasks: 1,
    })) {
      mesh[field].set(primitive[field], vertexOffset * width);
    }
    for (let i = 0; i < primitive.joints.length; i++)
      mesh.joints[vertexOffset * 4 + i] = remap[primitive.joints[i]];
    mesh.materialIds.fill(
      materialSlot(primitive.materialIndex),
      vertexOffset,
      vertexOffset + vertices,
    );
    for (const index of primitive.indices) mesh.indices[indexOffset++] = vertexOffset + index;
    vertexOffset += vertices;
  }
  return mesh;
}

/** Complete candidate content only: the caller chooses whether a catalog references it. */
export function bakeAppearance({
  name,
  mounted = false,
  tiers,
  loopClips,
  presentation,
  clipMetadata = {},
}) {
  if (typeof name !== "string" || !name.trim())
    throw new Error("appearance requires a nonempty name");
  if (typeof mounted !== "boolean") throw new Error("mounted must be boolean");
  if (
    !Array.isArray(tiers) ||
    tiers.length !== 3 ||
    tiers.some((tier) => !(tier instanceof Uint8Array))
  ) {
    throw new Error("appearance requires three explicit GLB byte arrays: near, mid and far");
  }
  if (
    !Array.isArray(loopClips) ||
    loopClips.some((clip) => typeof clip !== "string") ||
    new Set(loopClips).size !== loopClips.length
  ) {
    throw new Error("declare loopClips explicitly, using an empty array for no looping clips");
  }
  const imported = tiers.map((bytes) => gltfToEngineBasis(bakeGltf(bytes)));
  const rig = imported[0].rig;
  const clipNames = new Set(rig.clips.map((clip) => clip.name));
  if (clipNames.size !== rig.clips.length || clipNames.size === 0)
    throw new Error("near tier requires uniquely named animation clips");
  for (const clip of loopClips)
    if (!clipNames.has(clip)) throw new Error(`loop clip ${clip} is absent from the near tier`);
  for (const clip of rig.clips) clip.loop = loopClips.includes(clip.name);
  for (const [name, metadata] of Object.entries(clipMetadata)) {
    const clip = rig.clips.find((clip) => clip.name === name);
    if (!clip) throw new Error(`metadata clip ${name} is absent from the near tier`);
    clip.markers = metadata.markers;
    clip.strideMeters = metadata.strideMeters;
  }
  const files = {};
  const materialSet = appearanceMaterials(files);
  const meshes = imported.map((source, tier) => {
    const { json, bin } = parseGlb(tiers[tier]);
    const sourcePath = `source/tier-${tier}.glb`;
    files[sourcePath] = tiers[tier];
    return mergedMesh(source.primitives, jointMap(source.rig, rig, tier), (index) =>
      materialSet.slot(json, bin, index),
    );
  });
  const animation = bakeLocalAnimation(rig);
  assertAppearancePresentation(presentation, rig, animation, mounted);
  assertPresentationMotion(presentation, animation, rig);
  files["skeleton.json"] = {
    ...rig,
    bones: rig.bones.map((bone) => ({ ...bone, inverseBind: Array.from(bone.inverseBind) })),
  };
  files["animation.json"] = encodeLocalAnimation(animation);
  files["materials.json"] = materialSet.surface;
  const paths = meshes.map((mesh, index) => {
    const path = `tier-${index}.mesh.json`;
    files[path] = encodeSoldierMesh(mesh);
    return path;
  });
  files["appearance.json"] = {
    name,
    mounted,
    presentation,
    skeleton: "skeleton.json",
    animation: "animation.json",
    materials: "materials.json",
    tiers: paths,
    far: {
      mesh: paths[0],
      clip: presentation?.actions.ready?.clip ?? animation.clips[0].name,
      phase: 0,
    },
    bounds: deriveAnimatedBounds(meshes, animation, materialSet.surface.materials, rig),
  };
  return files;
}

export async function writeAppearance(files, directory, { check = false } = {}) {
  for (const [path, content] of Object.entries(files)) {
    const output = resolve(directory, path);
    const bytes =
      content instanceof Uint8Array
        ? content
        : Buffer.from(`${JSON.stringify(content, null, content.indexFormat ? undefined : 2)}\n`);
    if (check) {
      const current = await readFile(output).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (!current?.equals(bytes)) throw new Error(`stale or missing candidate asset: ${output}`);
    } else {
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes);
    }
  }
  if (check) {
    for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = resolve(entry.parentPath, entry.name);
      if (!Object.hasOwn(files, relative(resolve(directory), path)))
        throw new Error(`obsolete candidate asset: ${path}`);
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const { values } = parseArgs({
    options: {
      near: { type: "string" },
      mid: { type: "string" },
      far: { type: "string" },
      out: { type: "string" },
      name: { type: "string" },
      mounted: { type: "boolean", default: false },
      loop: { type: "string" },
      check: { type: "boolean", default: false },
    },
  });
  for (const argument of ["near", "mid", "far", "out", "name", "loop"]) {
    if (values[argument] == null)
      throw new Error(
        `missing --${argument}; provide three tiers, an output directory and explicit --loop names (empty for no loops)`,
      );
  }
  if (!values.out.trim()) throw new Error("--out must name the candidate output directory");
  const files = bakeAppearance({
    presentation: null,
    name: values.name,
    mounted: values.mounted,
    tiers: await Promise.all([values.near, values.mid, values.far].map((path) => readFile(path))),
    loopClips: values.loop ? values.loop.split(",") : [],
  });
  await writeAppearance(files, values.out, { check: values.check });
  console.log(
    `${values.check ? "verified" : "wrote"} candidate ${resolve(values.out, "appearance.json")}; no roster catalog changed`,
  );
}
