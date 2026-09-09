import { mat4Mul } from '../src/localPose.ts';

const BASIS = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]);
const INVERSE = new Float32Array([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
const vector = ([x, y, z]) => [x, -z, y];
const rotation = ([x, y, z, w]) => [x, -z, y, w];

/** Convert the complete bind/animation/geometry system together, exactly once. */
export function gltfToEngineBasis(imported) {
  const channel = (source, stride, convert) => {
    if (!source) return undefined;
    const values = [];
    for (let i = 0; i < source.values.length; i += stride)
      values.push(...convert(source.values.slice(i, i + stride)));
    return { ...source, values };
  };
  const rig = {
    ...imported.rig,
    bones: imported.rig.bones.map((bone) => ({
      ...bone,
      bind: {
        T: vector(bone.bind.T),
        R: rotation(bone.bind.R),
        S: [bone.bind.S[0], bone.bind.S[2], bone.bind.S[1]],
      },
      inverseBind: mat4Mul(mat4Mul(BASIS, bone.inverseBind), INVERSE),
    })),
    clips: imported.rig.clips.map((clip) => ({
      ...clip,
      tracks: Object.fromEntries(
        Object.entries(clip.tracks).map(([id, track]) => [
          id,
          {
            ...track,
            T: channel(track.T, 3, vector),
            R: channel(track.R, 4, rotation),
            S: channel(track.S, 3, ([x, y, z]) => [x, z, y]),
          },
        ]),
      ),
    })),
  };
  const attribute = (source, stride) => {
    const out = new Float32Array(source);
    for (let i = 0; i < out.length; i += stride) {
      out[i + 1] = -source[i + 2];
      out[i + 2] = source[i + 1];
    }
    return out;
  };
  return {
    rig,
    primitives: imported.primitives.map((primitive) => ({
      ...primitive,
      positions: attribute(primitive.positions, 3),
      normals: attribute(primitive.normals, 3),
      tangents: attribute(primitive.tangents, 4),
    })),
  };
}
