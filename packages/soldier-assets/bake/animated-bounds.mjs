import { poseSoldierMesh, assertMappedTangentFrames } from "../src/skin.ts";
import {
  decodeLocalSample,
  resolveLocalSample,
  isAdmittedLocalQuaternion,
} from "../src/localAnimation.ts";
import { localPoseToJointMatrices } from "../src/localPose.ts";

// Positive bound arithmetic rounds outward to the next Float32 value. This also
// dominates the Float64 arithmetic used to calculate each bound expression.
const storage = new ArrayBuffer(4),
  floats = new Float32Array(storage),
  bits = new Uint32Array(storage);
function up(value) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error("animated bounds exceed finite Float32 range");
  if (value === 0) return 0;
  floats[0] = value;
  bits[0]++;
  if (!Number.isFinite(floats[0])) throw new Error("animated bounds exceed finite Float32 range");
  return floats[0];
}
const add = (a, b) => up(a + b),
  mul = (a, b) => up(a * b);
const norm = (values) => {
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) return 0;
  const sum = values.reduce((sum, value) => {
    const ratio = up(Math.abs(value) / scale);
    return add(sum, mul(ratio, ratio));
  }, 0);
  return mul(up(scale), up(Math.sqrt(sum)));
};
// WGSL permits either adjacent Float32, not just nearest-even. CPU Float32
// storage is nearest-even and therefore has half this relative error.
const u = 2 ** -23,
  packingU = 2 ** -24;
const gamma = (n) => up((n * u) / (1 - n * u));
const g6 = gamma(6),
  g7 = gamma(7),
  sqrt3 = up(Math.sqrt(3));
// Packing plus three T/S a+(b-a)*w stages (sample, base, upper). One
// stage's absolute error is <= (5u+6u²+2u³) times the input norm.
const g16 = gamma(16);
// WebGPU may flush subnormals: bound each lost scalar result by the smallest
// normal, not half a subnormal ULP. Seven products/additions compose a mat4 dot.
const tiny = 2 ** -126,
  eta7 = up((7 * tiny) / (1 - 7 * u));
const eta16 = up((16 * tiny) / (1 - 16 * u));
// Near-unit shortest-arc inputs, the .9995 branch and bounded sine polynomial
// give |slerp result| > .001. The zero/subnormal-cosine shader branch uses pi/2.
// Explicitly include dot underflow relative to that lower squared magnitude.
const normalizedDotError = add(g7, up(eta7 / 1e-6));
// WGSL length inherits sqrt(dot); sqrt inherits 1/inverseSqrt. Division
// permits 2.5 ULP, inverseSqrt 2 ULP. Normalization resets this error per blend.
const divisionError = 2.5 * u,
  inverseSqrtError = 2 * u;
const normalizedQuaternionNorm = add(
  up(
    ((1 + divisionError) * (1 + inverseSqrtError)) /
      ((1 - divisionError) * Math.sqrt(1 - normalizedDotError)),
  ),
  2 * tiny,
);
const matrixTiny = mul(3, eta7),
  vectorTiny = mul(sqrt3, eta7);
const vectors = (values, width) =>
  Array.from({ length: values.length / width }, (_, index) =>
    values.slice(index * width, (index + 1) * width),
  );

function linearNorm(matrix) {
  // sqrt(||A||1 ||A||infinity) bounds the spectral norm without assuming an
  // exactly orthogonal inverse bind after its Float32 serialization.
  const rows = [0, 1, 2].map((row) =>
    [0, 1, 2].reduce((sum, col) => add(sum, Math.abs(matrix[col * 4 + row])), 0),
  );
  const cols = [0, 1, 2].map((col) =>
    [0, 1, 2].reduce((sum, row) => add(sum, Math.abs(matrix[col * 4 + row])), 0),
  );
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
    const values = (field) => [
      bone.bind[field],
      ...rig.clips.flatMap((clip) =>
        clip.tracks[joint]?.[field]
          ? vectors(clip.tracks[joint][field].values, field === "R" ? 4 : 3)
          : [],
      ),
    ];
    for (const field of ["T", "S"]) {
      const keys = values(field);
      for (let axis = 0; axis < 3; axis++) {
        const low = Math.min(...keys.map((v) => v[axis])),
          high = Math.max(...keys.map((v) => v[axis]));
        // A finite final convex value is insufficient: b-a executes first.
        // Include earlier GPU stages' outward drift before admitting its span.
        const drift = add(mul(g16, Math.max(Math.abs(low), Math.abs(high))), eta16);
        add(up(high - low), mul(2, drift));
      }
    }
    const rotations = values("R");
    for (const q of rotations)
      if (!isAdmittedLocalQuaternion(q))
        throw new Error(`animated bounds require an admitted near-unit quaternion: ${bone.name}`);
    // Endpoints may bypass normalization; packed endpoints and normalized
    // intermediates have separate envelopes. Normalization resets its error.
    const q2 = Math.max(
      mul(normalizedQuaternionNorm, normalizedQuaternionNorm),
      ...rotations.map((q) => {
        const packed = mul(1 + packingU, norm(q));
        return mul(packed, packed);
      }),
    );
    // R(q) has norm max(1,sqrt(1+4|q.xyz|²(|q|²-1))). Interior
    // slerps normalize; endpoints/binds may retain tiny authored norm errors.
    const rotationNorm = up(Math.sqrt(add(1, mul(4 * q2, Math.max(0, q2 - 1)))));
    const scale = add(mul(1 + g16, Math.max(...values("S").flat().map(Math.abs))), eta16);
    // A TRS coefficient has at most six arithmetic/store roundings. Its
    // absolute polynomial is bounded by (1+4|q|²)S; Frobenius error ≤3δ.
    const localLinear = add(
      mul(rotationNorm, scale),
      add(mul(mul(3 * g6, add(1, mul(4, q2))), scale), mul(3, tiny)),
    );
    const sourceTranslations = values("T");
    const low = [0, 1, 2].map((axis) => Math.min(...sourceTranslations.map((t) => t[axis])));
    const high = [0, 1, 2].map((axis) => Math.max(...sourceTranslations.map((t) => t[axis])));
    // CPU range-preserving scalar interpolation stays in this component box
    // at arbitrary interruption depth; it need not stay in the vector hull.
    const translations = Array.from({ length: 8 }, (_, corner) =>
      low.map((value, axis) => (corner & (1 << axis) ? high[axis] : value)),
    );
    const t = Math.max(...translations.map(norm));
    return {
      translations,
      t: add(mul(1 + g16, t), mul(sqrt3, eta16)),
      tError: add(mul(g16, t), mul(sqrt3, eta16)),
      localLinear,
    };
  });
  const roots = envelope.flatMap((item, joint) =>
    rig.bones[joint].parent < 0 ? item.translations : [],
  );
  const center = [0, 1, 2].map((axis) =>
    Math.fround(
      (Math.min(...roots.map((t) => t[axis])) + Math.max(...roots.map((t) => t[axis]))) / 2,
    ),
  );
  const centerNorm = norm(center),
    world = [];
  for (let joint = 0; joint < rig.bones.length; joint++) {
    const p = rig.bones[joint].parent,
      item = envelope[joint];
    if (p < 0) {
      world.push({
        linear: item.localLinear,
        distance: add(
          Math.max(
            ...item.translations.map((t) => norm(t.map((value, axis) => value - center[axis]))),
          ),
          item.tError,
        ),
      });
    } else {
      const parent = world[p];
      // ||fl(AB)-AB||2 ≤3γ7||A||2||B||2; affine translation uses
      // γ7(sqrt(3)||A||2|t|+|parent.t|). Carry absolute and centered terms.
      const translationError = add(
        mul(g7, add(mul(mul(sqrt3, parent.linear), item.t), add(centerNorm, parent.distance))),
        vectorTiny,
      );
      world.push({
        linear: add(mul(mul(1 + 3 * g7, parent.linear), item.localLinear), matrixTiny),
        distance: add(add(parent.distance, mul(parent.linear, item.t)), translationError),
      });
    }
  }
  const inverse = rig.bones.map((bone) => ({
    linear: linearNorm(bone.inverseBind),
    translation: norm(Array.from(bone.inverseBind).slice(12, 15)),
  }));
  // Three rounded stages dominate both orders: weighted columns→vertex dot,
  // or per-joint vertex dot→weighted positions→Float32 output store.
  const skinErrorFactor = up((1 + sqrt3 * g7) ** 3 - 1);
  let radius = 0;
  for (const mesh of tiers) {
    assertMappedTangentFrames(mesh, materials);
    for (const clip of animation.clips) {
      // Preserve the previous12/24Hz source-admission checks as well as every
      // authored key. These samples check tangent validity, not motion bounds.
      const samples = clip.times.map((_, index) => ({
        sampleA: clip.start + index,
        sampleB: clip.start + index,
        fraction: 0,
        stepMaskOffset: clip.stepMaskOffset,
      }));
      for (const rate of [12, 24]) {
        const intervals = Math.max(1, Math.round(clip.duration * rate));
        for (let frame = 0; frame <= intervals; frame++)
          samples.push(resolveLocalSample(animation, clip.name, frame / intervals));
      }
      for (const sample of samples) {
        const locals = decodeLocalSample(animation, sample);
        const posed = poseSoldierMesh(mesh, localPoseToJointMatrices(rig, locals));
        assertMappedTangentFrames({ ...posed, materialIds: mesh.materialIds }, materials);
      }
    }
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
      const point = Array.from(mesh.positions.slice(vertex * 3, vertex * 3 + 3)),
        pointNorm = norm(point);
      let distance = 0,
        linear = 0,
        translation = 0,
        weightSum = 0;
      for (let influence = 0; influence < 4; influence++) {
        const offset = vertex * 4 + influence,
          weight = mesh.weights[offset];
        if (weight === 0) continue;
        const joint = mesh.joints[offset],
          w = world[joint],
          inv = inverse[joint],
          m = rig.bones[joint].inverseBind;
        const local = [0, 1, 2].map(
          (axis) =>
            m[axis] * point[0] + m[axis + 4] * point[1] + m[axis + 8] * point[2] + m[axis + 12],
        );
        const inversePointError = add(
          mul(g7, add(mul(mul(sqrt3, inv.linear), pointNorm), inv.translation)),
          vectorTiny,
        );
        const localNorm = add(norm(local), inversePointError);
        const absoluteTranslation = add(centerNorm, w.distance);
        const jointLinearError = add(mul(mul(3 * g7, w.linear), inv.linear), matrixTiny);
        const jointTranslationError = add(
          mul(g7, add(mul(mul(sqrt3, w.linear), inv.translation), absoluteTranslation)),
          vectorTiny,
        );
        distance = add(
          distance,
          mul(
            weight,
            add(
              add(w.distance, mul(w.linear, localNorm)),
              add(mul(jointLinearError, pointNorm), jointTranslationError),
            ),
          ),
        );
        linear = add(linear, mul(weight, add(mul(w.linear, inv.linear), jointLinearError)));
        translation = add(
          translation,
          mul(
            weight,
            add(add(absoluteTranslation, mul(w.linear, inv.translation)), jointTranslationError),
          ),
        );
        weightSum += weight;
      }
      const underflowError = mul(
        1 + skinErrorFactor,
        add(mul(matrixTiny, pointNorm), mul(3, vectorTiny)),
      );
      const skinError = add(
        mul(skinErrorFactor, add(mul(mul(sqrt3, linear), pointNorm), translation)),
        underflowError,
      );
      radius = Math.max(
        radius,
        add(add(distance, mul(Math.abs(weightSum - 1), centerNorm)), skinError),
      );
    }
  }
  return { center, radius };
}
