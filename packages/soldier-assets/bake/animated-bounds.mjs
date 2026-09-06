import { poseSoldierMesh, assertMappedTangentFrames } from '../src/skin.ts';

// Positive bound arithmetic rounds outward to the next Float32 value. This also
// dominates the Float64 arithmetic used to calculate each bound expression.
const storage = new ArrayBuffer(4), floats = new Float32Array(storage), bits = new Uint32Array(storage);
function up(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('animated bounds exceed finite Float32 range');
  if (value === 0) return 0;
  floats[0] = value;
  bits[0]++;
  if (!Number.isFinite(floats[0])) throw new Error('animated bounds exceed finite Float32 range');
  return floats[0];
}
const add = (a, b) => up(a + b), mul = (a, b) => up(a * b);
const norm = values => {
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) return 0;
  const sum = values.reduce((sum, value) => {
    const ratio = up(Math.abs(value) / scale);
    return add(sum, mul(ratio, ratio));
  }, 0);
  return mul(up(scale), up(Math.sqrt(sum)));
};
const u = 2 ** -24;
const gamma = n => up(n * u / (1 - n * u));
const g6 = gamma(6), g7 = gamma(7), sqrt3 = up(Math.sqrt(3));
// WebGPU may flush subnormals: bound each lost scalar result by the smallest
// normal, not half a subnormal ULP. Seven products/additions compose a mat4 dot.
const tiny = 2 ** -126, eta7 = up(7 * tiny / (1 - 7 * u));
const matrixTiny = mul(3, eta7), vectorTiny = mul(sqrt3, eta7);
const vectors = (values, width) => Array.from({ length: values.length / width }, (_, index) => values.slice(index * width, (index + 1) * width));

function linearNorm(matrix) {
  // sqrt(||A||1 ||A||infinity) bounds the spectral norm without assuming an
  // exactly orthogonal inverse bind after its Float32 serialization.
  const rows = [0, 1, 2].map(row => [0, 1, 2].reduce((sum, col) => add(sum, Math.abs(matrix[col * 4 + row])), 0));
  const cols = [0, 1, 2].map(col => [0, 1, 2].reduce((sum, row) => add(sum, Math.abs(matrix[col * 4 + row])), 0));
  return up(Math.sqrt(mul(Math.max(...rows), Math.max(...cols))));
}

/** Covers continuous local blends/masks; sampled poses below admit mapped frames only. */
export function deriveAnimatedBounds(tiers, animation, materials, rig) {
  for (const bone of rig.bones) {
    const m = bone.inverseBind;
    if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1)
      throw new Error(`animated bounds require an affine inverse bind: ${bone.name}`);
  }
  const envelope = rig.bones.map((bone, joint) => {
    const values = field => [bone.bind[field], ...rig.clips.flatMap(clip => clip.tracks[joint]?.[field]
      ? vectors(clip.tracks[joint][field].values, field === 'R' ? 4 : 3) : [])];
    const rotations = values('R');
    const q2 = Math.max(1, ...rotations.map(q => mul(norm(q), norm(q))));
    // R(q) has norm max(1,sqrt(1+4|q.xyz|²(|q|²-1))). Interior
    // slerps normalize; endpoints/binds may retain tiny authored norm errors.
    const rotationNorm = up(Math.sqrt(add(1, mul(4 * q2, Math.max(0, q2 - 1)))));
    const scale = up(Math.max(...values('S').flat().map(Math.abs)));
    // A TRS coefficient has at most six arithmetic/store roundings. Its
    // absolute polynomial is bounded by (1+4|q|²)S; Frobenius error ≤3δ.
    const localLinear = add(mul(rotationNorm, scale), add(mul(mul(3 * g6, add(1, mul(4, q2))), scale), mul(3, tiny)));
    const translations = values('T');
    const t = Math.max(...translations.map(norm));
    return { translations, t: add(mul(1 + g6, t), vectorTiny), tError: add(mul(g6, t), vectorTiny), localLinear };
  });
  const roots = envelope.flatMap((item, joint) => rig.bones[joint].parent < 0 ? item.translations : []);
  const center = [0, 1, 2].map(axis => Math.fround((Math.min(...roots.map(t => t[axis])) + Math.max(...roots.map(t => t[axis]))) / 2));
  const centerNorm = norm(center), world = [];
  for (let joint = 0; joint < rig.bones.length; joint++) {
    const p = rig.bones[joint].parent, item = envelope[joint];
    if (p < 0) {
      world.push({ linear: item.localLinear, distance: add(Math.max(...item.translations.map(t => norm(t.map((value, axis) => value - center[axis])))), item.tError) });
    } else {
      const parent = world[p];
      // ||fl(AB)-AB||2 ≤3γ7||A||2||B||2; affine translation uses
      // γ7(sqrt(3)||A||2|t|+|parent.t|). Carry absolute and centered terms.
      const translationError = add(mul(g7, add(mul(mul(sqrt3, parent.linear), item.t), add(centerNorm, parent.distance))), vectorTiny);
      world.push({
        linear: add(mul(mul(1 + 3 * g7, parent.linear), item.localLinear), matrixTiny),
        distance: add(add(parent.distance, mul(parent.linear, item.t)), translationError),
      });
    }
  }
  const inverse = rig.bones.map(bone => ({ linear: linearNorm(bone.inverseBind), translation: norm(Array.from(bone.inverseBind).slice(12, 15)) }));
  // Three rounded stages dominate both orders: weighted columns→vertex dot,
  // or per-joint vertex dot→weighted positions→Float32 output store.
  const skinErrorFactor = up((1 + sqrt3 * g7) ** 3 - 1);
  let radius = 0;
  for (const mesh of tiers) {
    assertMappedTangentFrames(mesh, materials);
    for (let frame = 0; frame < animation.width; frame++) {
      const posed = poseSoldierMesh(mesh, animation, frame);
      assertMappedTangentFrames({ ...posed, materialIds: mesh.materialIds }, materials);
    }
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
      const point = Array.from(mesh.positions.slice(vertex * 3, vertex * 3 + 3)), pointNorm = norm(point);
      let distance = 0, linear = 0, translation = 0, weightSum = 0;
      for (let influence = 0; influence < 4; influence++) {
        const offset = vertex * 4 + influence, weight = mesh.weights[offset];
        if (weight === 0) continue;
        const joint = mesh.joints[offset], w = world[joint], inv = inverse[joint], m = rig.bones[joint].inverseBind;
        const local = [0, 1, 2].map(axis => m[axis] * point[0] + m[axis + 4] * point[1] + m[axis + 8] * point[2] + m[axis + 12]);
        const inversePointError = add(mul(g7, add(mul(mul(sqrt3, inv.linear), pointNorm), inv.translation)), vectorTiny);
        const localNorm = add(norm(local), inversePointError);
        const absoluteTranslation = add(centerNorm, w.distance);
        const jointLinearError = add(mul(mul(3 * g7, w.linear), inv.linear), matrixTiny);
        const jointTranslationError = add(mul(g7, add(mul(mul(sqrt3, w.linear), inv.translation), absoluteTranslation)), vectorTiny);
        distance = add(distance, mul(weight, add(add(w.distance, mul(w.linear, localNorm)), add(mul(jointLinearError, pointNorm), jointTranslationError))));
        linear = add(linear, mul(weight, add(mul(w.linear, inv.linear), jointLinearError)));
        translation = add(translation, mul(weight, add(add(absoluteTranslation, mul(w.linear, inv.translation)), jointTranslationError)));
        weightSum += weight;
      }
      const underflowError = mul(1 + skinErrorFactor, add(mul(matrixTiny, pointNorm), mul(3, vectorTiny)));
      const skinError = add(mul(skinErrorFactor, add(mul(mul(sqrt3, linear), pointNorm), translation)), underflowError);
      radius = Math.max(radius, add(add(distance, mul(Math.abs(weightSum - 1), centerNorm)), skinError));
    }
  }
  return { center, radius };
}
