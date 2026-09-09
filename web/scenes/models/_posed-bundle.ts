import {
  evaluatePlaybackPose,
  type SoldierPlayback,
} from "../../../packages/crowd-runtime/src/actionTimeline";
import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import {
  localPoseToJointMatrices,
  mat4Identity,
} from "../../../packages/soldier-assets/src/localPose";
import { bakeLocalAnimation } from "../../../packages/soldier-assets/src/localAnimation";
import { poseSoldierMesh } from "../../../packages/soldier-assets/src/skin";

/** CPU-composed geometry still uses production materials, world and skin shader.
 * An identity rig makes the GPU's pose calculation independent of the reference. */
export function posedBundle(source: AppearanceBundle, playback: SoldierPlayback): AppearanceBundle {
  const palette = localPoseToJointMatrices(source.rig, evaluatePlaybackPose(source, playback));
  return bundleAtPose(source, palette);
}

/** Also accepts a validated GPU readback to isolate palette consumption from sampling. */
export function bundleAtPose(
  source: AppearanceBundle,
  palette: Float32Array,
  arithmetic: "independent" | "readback" = "independent",
): AppearanceBundle {
  const cpu = structuredClone(source);
  const pose = (mesh: AppearanceBundle["farMesh"]) => ({
    ...mesh,
    ...(arithmetic === "readback"
      ? readbackAttributes(mesh, palette)
      : poseSoldierMesh(mesh, palette)),
    joints: new Uint16Array(mesh.joints.length),
    weights: Float32Array.from(mesh.weights, (_, index) => Number(index % 4 === 0)),
  });
  cpu.tiers = [pose(cpu.tiers[0]), pose(cpu.tiers[1]), pose(cpu.tiers[2])];
  cpu.farMesh = pose(cpu.farMesh);
  cpu.rig = {
    bones: [
      {
        name: "oracle",
        parent: -1,
        bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
        inverseBind: mat4Identity(),
      },
    ],
    clips: [{ name: "oracle", duration: 1, loop: true, tracks: {} }],
  };
  cpu.animation = bakeLocalAnimation(cpu.rig);
  cpu.manifest.presentation = null;
  cpu.manifest.far = { ...cpu.manifest.far, clip: "oracle", phase: 0 };
  return cpu;
}

/** Raster-reference arithmetic only: match skinNodes' column-first f32 attributes.
 * Keep directions raw: the production material normalizes them exactly once.
 * The source oracle and production skin/bakes retain their independent owners. */
function readbackAttributes(mesh: AppearanceBundle["farMesh"], palette: Float32Array) {
  const result = new Float32Array(mesh.positions.length),
    normals = new Float32Array(mesh.normals.length),
    tangents = new Float32Array(mesh.tangents.length),
    f = Math.fround;
  for (let vertex = 0; vertex < result.length / 3; vertex++) {
    const columns = Array.from({ length: 16 }, (_, element) => {
      const term = (influence: number) =>
        f(
          palette[mesh.joints[vertex * 4 + influence] * 16 + element] *
            mesh.weights[vertex * 4 + influence],
        );
      return f(f(f(term(0) + term(1)) + term(2)) + term(3));
    });
    for (let axis = 0; axis < 3; axis++) {
      const direction = (values: Float32Array, offset: number) =>
        f(
          f(f(columns[axis] * values[offset]) + f(columns[4 + axis] * values[offset + 1])) +
            f(columns[8 + axis] * values[offset + 2]),
        );
      normals[vertex * 3 + axis] = direction(mesh.normals, vertex * 3);
      tangents[vertex * 4 + axis] = direction(mesh.tangents, vertex * 4);
      result[vertex * 3 + axis] = f(
        f(
          f(
            f(columns[axis] * mesh.positions[vertex * 3]) +
              f(columns[4 + axis] * mesh.positions[vertex * 3 + 1]),
          ) + f(columns[8 + axis] * mesh.positions[vertex * 3 + 2]),
        ) + columns[12 + axis],
      );
    }
    tangents[vertex * 4 + 3] = mesh.tangents[vertex * 4 + 3];
  }
  return { positions: result, normals, tangents };
}
