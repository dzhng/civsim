import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { bakeGltf } from "./gltf.mjs";
import { gltfToEngineBasis } from "./engine-basis.mjs";
import { localPoseToJointMatrices, sampleRigLocalPoseSeconds } from "../src/localPose.ts";
import { poseSoldierMesh } from "../src/skin.ts";

const { positionals: paths, values: { before } } = parseArgs({ allowPositionals: true,
  options: { before: { type: "string" } } });
assert.ok(paths.length, "Pass crew source and optional runtime tier GLBs");
if (before) {
  const old = bakeGltf(await readFile(before));
  const current = bakeGltf(await readFile(paths[0]));
  assert.deepEqual(current.rig.clips.map(c => [c.name, c.duration]),
    old.rig.clips.map(c => [c.name, c.duration]), "crew action identities/durations changed");
  let maximumTrackDelta = 0;
  for (const clip of old.rig.clips) {
    const next = current.rig.clips.find(c => c.name === clip.name);
    for (const [index, track] of Object.entries(clip.tracks)) {
      const name = old.rig.bones[Number(index)].name;
      const nextIndex = current.rig.bones.findIndex(b => b.name === name);
      for (const [channel, original] of Object.entries(track)) {
        const actual = next.tracks[nextIndex][channel];
        assert.deepEqual(actual.times, original.times);
        assert.equal(actual.interpolation, original.interpolation);
        assert.equal(actual.values.length, original.values.length);
        for (let i = 0; i < original.values.length; i++) {
          const delta = Math.abs(actual.values[i] - original.values[i]);
          maximumTrackDelta = Math.max(maximumTrackDelta, delta);
          // Exporting the previously omitted identity root changes Blender's
          // transform decomposition rounding, not the saved authored keys.
          assert.ok(delta < 1e-6, `${clip.name}/${name}/${channel}: export drift ${delta}`);
        }
      }
    }
  }
  const bodyVertices = (source) => {
    const result = new Map();
    for (const mesh of source.primitives) for (let v = 0; v < mesh.positions.length / 3; v++) {
      const names = [...mesh.joints.subarray(v*4, v*4+4)].map(j => source.rig.bones[j].name);
      if (names[0] === "root" && mesh.weights[v*4] === 1) continue;
      const key = JSON.stringify([...["positions", "uvs"].map(field => {
        const size = field === "uvs" ? 2 : 3;
        return [...mesh[field].subarray(v*size, v*size+size)];
      }), ...names.map((name, i) => mesh.weights[v*4+i] ? [name, mesh.weights[v*4+i]] : null)]);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  };
  assert.deepEqual(bodyVertices(current), bodyVertices(old),
    "approved body/tool positions, UVs or named skin weights changed");
  console.log(JSON.stringify({ bodyChannels: "exact", maximumTrackDelta }));
}
let machinerySurface;
for (const path of paths) {
  const source = gltfToEngineBasis(bakeGltf(await readFile(path)));
  const root = source.rig.bones.findIndex(({ name }) => name === "root");
  assert.ok(root >= 0, `${path}: explicit equipment root must be exported`);
  const references = [];
  for (const mesh of source.primitives) {
    const vertices = [];
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
      if (mesh.joints[vertex * 4] === root && mesh.weights[vertex * 4] === 1)
        vertices.push(vertex);
    }
    references.push(vertices);
  }
  assert.ok(references.flat().length > 100, `${path}: rigid machinery missing`);
  let reference;
  for (const clip of source.rig.clips) {
    for (const phase of [0, .5, 1]) {
      const palette = localPoseToJointMatrices(source.rig,
        sampleRigLocalPoseSeconds(source.rig, clip.name, clip.duration * phase));
      const points = source.primitives.flatMap((mesh, index) => {
        const posed = poseSoldierMesh(mesh, palette);
        return references[index].map((vertex) => [...posed.positions.subarray(vertex * 3, vertex * 3 + 3)]);
      });
      reference ??= points;
      for (let i = 0; i < points.length; i++)
        assert.ok(Math.hypot(...points[i].map((v, a) => v - reference[i][a])) < 1e-5,
          `${path}/${clip.name}/${phase}: machinery follows human deformation`);
    }
  }
  const min = [0, 1, 2].map((a) => Math.min(...reference.map((p) => p[a])));
  const max = [0, 1, 2].map((a) => Math.max(...reference.map((p) => p[a])));
  const surface = reference.map(point => JSON.stringify(point)).sort();
  machinerySurface ??= surface;
  assert.deepEqual(surface, machinerySurface, `${path}: rigid equipment lost or moved across tiers`);
  assert.ok(min[0] > -.1 && max[0] > 1.1 && max[0] < 1.3, `right-hand carriage footprint ${min}/${max}`);
  assert.ok(min[1] > -.35 && max[1] > 1.35 && max[1] < 1.6, `forward beam footprint ${min}/${max}`);
  assert.ok(Math.abs(min[2]) < .02 && max[2] > 1 && max[2] < 1.3, `grounded wheel/arm envelope ${min}/${max}`);
  console.log(JSON.stringify({ path, rootVertices: references.flat().length, min, max,
    clips: source.rig.clips.length, samples: source.rig.clips.length * 3 }));
}
