// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createPreparedCamera,
  prepareCamera,
  projectPrepared,
  rayPrepared,
  type MutableWorldRay,
  eyePosition,
  invViewProj,
  projectPoint,
  projMatrix,
  unprojectToPlaneZ,
  viewMatrix,
  viewProjMatrix,
  type Camera3DParams,
} from "@packages/renderer-core/src/camera3d.ts";
import { identity, multiply, type Mat4 } from "@packages/renderer-core/src/mat4.ts";

// A representative oblique battle-ish camera. Finite far keeps the reverse-Z
// depth mapping exact at both planes for the monotonic test.
const CAM: Camera3DParams = {
  target: [12, -30, 0],
  distance: 220,
  pitch: 0.55,
  yaw: 0.2,
  fovY: 0.6,
  aspect: 1.6,
  near: 1,
  far: 4000,
};

function maxAbsDiff(a: Mat4, b: Mat4): number {
  let m = 0;
  for (let i = 0; i < 16; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

test("camera3d: screen↔world round-trips on the ground plane", () => {
  // Project a grid of ground points, then unproject the pixel back onto the same
  // z-plane — the inverse must land on the original point.
  for (let gx = -180; gx <= 180; gx += 60) {
    for (let gy = -180; gy <= 180; gy += 60) {
      const world: [number, number, number] = [gx, gy, 0];
      const { ndc, clipW } = projectPoint(CAM, world);
      if (clipW <= 0) continue; // behind the eye — not a pickable pixel
      const back = unprojectToPlaneZ(CAM, ndc[0], ndc[1], 0);
      assert.ok(back, `unproject returned null at ${gx},${gy}`);
      // Matrices are Float32 (they must match the GPU uniform byte-for-byte), so
      // the round-trip carries single-precision error dominated by the perspective
      // divide (~a few ×10⁻³ world units across the field) — far below soldier
      // spacing and sub-pixel for picking.
      assert.ok(
        Math.hypot(back[0] - gx, back[1] - gy, back[2]) < 1e-2,
        `round-trip ${gx},${gy} → ${back}`,
      );
    }
  }
});

test("camera3d: the target projects to the screen centre", () => {
  const { ndc, clipW } = projectPoint(CAM, CAM.target);
  assert.ok(clipW > 0);
  assert.ok(Math.abs(ndc[0]) < 1e-5 && Math.abs(ndc[1]) < 1e-5, `target ndc ${ndc}`);
});

test("camera3d: view rotation is orthonormal", () => {
  const v = viewMatrix(CAM);
  // Upper-left 3×3 rotation (column-major): columns are the basis vectors.
  const cols = [
    [v[0], v[1], v[2]],
    [v[4], v[5], v[6]],
    [v[8], v[9], v[10]],
  ];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(dot(cols[i], cols[i]) - 1) < 1e-6, `column ${i} not unit`);
    for (let j = i + 1; j < 3; j++) {
      assert.ok(Math.abs(dot(cols[i], cols[j])) < 1e-6, `columns ${i},${j} not orthogonal`);
    }
  }
});

test("camera3d: reverse-Z depth is monotonic-decreasing and in [0,1]", () => {
  // March straight out along the eye→target ray; reverse-Z means nearer = higher
  // depth (near→1, far→0), strictly decreasing, always inside the unit range.
  const eye = eyePosition(CAM);
  let dx = CAM.target[0] - eye[0],
    dy = CAM.target[1] - eye[1],
    dz = CAM.target[2] - eye[2];
  const l = Math.hypot(dx, dy, dz);
  dx /= l;
  dy /= l;
  dz /= l;
  let prev = Infinity;
  for (const d of [2, 10, 50, 200, 800, 3500]) {
    const w: [number, number, number] = [eye[0] + dx * d, eye[1] + dy * d, eye[2] + dz * d];
    const { ndc } = projectPoint(CAM, w);
    assert.ok(ndc[2] > 0 && ndc[2] < 1, `depth ${ndc[2]} out of [0,1] at d=${d}`);
    assert.ok(ndc[2] < prev, `depth not decreasing at d=${d} (${ndc[2]} !< ${prev})`);
    prev = ndc[2];
  }
});

test("camera3d: invViewProj is a true inverse", () => {
  const vp = viewProjMatrix(CAM);
  const prod = multiply(vp, invViewProj(CAM));
  assert.ok(
    maxAbsDiff(prod, identity()) < 1e-4,
    `VP · VP⁻¹ ≠ I (max diff ${maxAbsDiff(prod, identity())})`,
  );
});

test("camera3d: infinite far plane maps the horizon toward depth 0", () => {
  const inf: Camera3DParams = { ...CAM, far: undefined };
  const eye = eyePosition(inf);
  // A very distant ground point ahead should approach — but stay above — depth 0.
  const far: [number, number, number] = [eye[0] + 1e6, eye[1], 0];
  const { ndc } = projectPoint(inf, far);
  // Infinite far → depth collapses to ~0 (floating error may nudge it barely
  // negative); the contract is "vanishingly small", not a hard sign.
  assert.ok(Math.abs(ndc[2]) < 1e-2, `far depth ${ndc[2]} not near 0`);
});

test("camera3d: matrices are deterministic for identical params", () => {
  assert.deepEqual(viewProjMatrix(CAM), viewProjMatrix(CAM));
  assert.deepEqual(projMatrix(CAM), projMatrix(CAM));
});

test("prepared camera keeps accepted poses and caller-owned projections independent", () => {
  const params = { ...CAM, target: [...CAM.target] as [number, number, number] };
  const a = createPreparedCamera();
  const b = createPreparedCamera();
  prepareCamera(a, params);
  prepareCamera(b, { ...CAM, target: [500, 200, 0] });
  const first = { ndc: [0, 0, 0] as [number, number, number], clipW: 0 };
  const second = { ndc: [0, 0, 0] as [number, number, number], clipW: 0 };
  projectPrepared(first, a, ...CAM.target);
  assert.ok(Math.hypot(first.ndc[0], first.ndc[1]) < 1e-5);
  const retained = structuredClone(first);
  projectPrepared(second, b, 500, 200, 0);
  assert.ok(Math.hypot(second.ndc[0], second.ndc[1]) < 1e-5);
  assert.deepEqual(first, retained);
  params.target[0] += 50;
  projectPrepared(second, a, ...CAM.target);
  assert.deepEqual(second, retained, "unaccepted mutable input must not change the prepared view");
  prepareCamera(a, params);
  projectPrepared(second, a, ...params.target);
  assert.ok(Math.hypot(second.ndc[0], second.ndc[1]) < 1e-5);
  assert.deepEqual(first, retained, "preparing a later pose must not mutate retained output");
});

test("prepared rays hit projected ground points across finite, infinite and vertical views", () => {
  const prepared = createPreparedCamera();
  const projected = { ndc: [0, 0, 0] as [number, number, number], clipW: 0 };
  const ray: MutableWorldRay = { origin: [0, 0, 0], dir: [0, 0, 0] };
  for (const params of [CAM, { ...CAM, far: undefined }, { ...CAM, pitch: Math.PI / 2 }]) {
    prepareCamera(prepared, params);
    for (const point of [
      [12, -30, 0],
      [32, -10, 0],
      [-8, -50, 0],
    ] as const) {
      projectPrepared(projected, prepared, point[0], point[1], point[2]);
      rayPrepared(ray, prepared, projected.ndc[0], projected.ndc[1]);
      const distance = -ray.origin[2] / ray.dir[2];
      assert.ok(distance > 0);
      assert.ok(
        Math.hypot(
          ray.origin[0] + ray.dir[0] * distance - point[0],
          ray.origin[1] + ray.dir[1] * distance - point[1],
        ) < 1e-2,
      );
      assert.ok(Math.abs(Math.hypot(...ray.dir) - 1) < 1e-12);
    }
  }
  const retained = structuredClone(ray);
  prepareCamera(prepared, { ...CAM, target: [500, 500, 50] });
  assert.deepEqual(ray, retained, "ray origins must not borrow the prepared eye storage");
});

test("prepared camera preserves zero-w, singular inverse fallback and behind-eye behavior", () => {
  const camera = createPreparedCamera();
  const out = { ndc: [9, 9, 9] as [number, number, number], clipW: 9 };
  prepareCamera(camera, { ...CAM, target: [0, 0, 0], distance: 0 });
  projectPrepared(out, camera, 1, 2, 3);
  assert.deepEqual(out, { ndc: [0, 0, 0], clipW: 0 });
  const ray: MutableWorldRay = { origin: [9, 9, 9], dir: [9, 9, 9] };
  rayPrepared(ray, camera, 0, 0);
  assert.deepEqual(ray, { origin: [0, 0, 0], dir: [0, 0, 1] });
  prepareCamera(camera, CAM);
  const eye = eyePosition(CAM);
  projectPrepared(
    out,
    camera,
    2 * eye[0] - CAM.target[0],
    2 * eye[1] - CAM.target[1],
    2 * eye[2] - CAM.target[2],
  );
  assert.ok(out.clipW < 0);
});

test("prepared centre ray remains parallel to horizontal ground at zero pitch", () => {
  const camera = createPreparedCamera();
  prepareCamera(camera, { ...CAM, pitch: 0, target: [0, 0, 0], yaw: 0 });
  const ray: MutableWorldRay = { origin: [0, 0, 0], dir: [0, 0, 0] };
  rayPrepared(ray, camera, 0, 0);
  assert.deepEqual(ray.origin, [220, 0, 0]);
  assert.deepEqual(ray.dir, [-1, 0, 0]);
});
