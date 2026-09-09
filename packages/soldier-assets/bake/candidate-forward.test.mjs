import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeGltf } from "./gltf.mjs";
import { gltfToEngineBasis } from "./engine-basis.mjs";
import { localPoseToJointMatrices, mat4Identity } from "../src/localPose.ts";
import { poseSoldierMesh } from "../src/skin.ts";

for (const name of ["human-anatomy", "heavy-kit", "heavy-motion"]) {
  const { rig, primitives } = gltfToEngineBasis(
    bakeGltf(await readFile(new URL(`../assets/source/${name}/${name}.glb`, import.meta.url))),
  );
  const locals = new Float64Array(
    rig.bones.flatMap(({ bind }) => [...bind.T, ...bind.R, ...bind.S]),
  );
  // Identity inverse binds expose world-space joint origins through the real hierarchy evaluator.
  const worlds = localPoseToJointMatrices(
    {
      ...rig,
      bones: rig.bones.map((bone) => ({ ...bone, inverseBind: mat4Identity() })),
    },
    locals,
  );
  const palette = localPoseToJointMatrices(rig, locals);
  const surfaces = primitives.map((mesh) => ({ mesh, posed: poseSoldierMesh(mesh, palette) }));
  for (const side of ["L", "R"]) {
    const toe = rig.bones.findIndex((bone) => bone.name === `toe.${side}`);
    const foot = rig.bones.findIndex((bone) => bone.name === `foot.${side}`);
    assert.ok(toe >= 0 && foot >= 0, `${name}: missing foot landmarks`);
    const forward = worlds[toe * 16 + 13] - worlds[foot * 16 + 13];
    assert.ok(forward > 0, `${name}/${side}: toes point ${forward}m along native +Y forward`);
    // Real inverse binds and weighted geometry must agree with the joint landmarks.
    let weightedY = 0,
      totalWeight = 0;
    for (const { mesh, posed } of surfaces) {
      for (let slot = 0; slot < mesh.joints.length; slot++) {
        if (mesh.joints[slot] !== toe) continue;
        weightedY += posed.positions[Math.floor(slot / 4) * 3 + 1] * mesh.weights[slot];
        totalWeight += mesh.weights[slot];
      }
    }
    assert.ok(totalWeight > 0, `${name}/${side}: missing weighted toe surface`);
    assert.ok(
      weightedY / totalWeight > worlds[foot * 16 + 13],
      `${name}/${side}: skinned toe surface must lie ahead of the ankle`,
    );
  }
}
