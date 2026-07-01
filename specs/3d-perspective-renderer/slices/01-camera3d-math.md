# Slice 01 — `camera3d` math library (pure, no GPU)

## Contract unlocked

A deterministic, unit-testable source of truth for view/projection/unprojection
matrices, shared by the GPU uniform packer (`02`), the camera rig (`03`), and CPU
picking (`04`/`05`). Nothing renders yet — this retires "is the matrix math
correct?" with zero GPU flakiness, so every later slice builds on proven math.

## API seam

**Package:** `packages/renderer-core`. New module `src/camera3d.ts` plus a
dependency-free `src/mat4.ts` (renderer-core has no matrix lib today — do **not**
pull `gl-matrix`/`@babylonjs`; keep the package portable and WGSL-column-major).

- `type Vec3 = [number,number,number]`; `type Mat4 = Float32Array /* 16, column-major */`.
- `mat4.ts`: `multiply`, `invert`, `perspectiveFovYReverseZ(fovY, aspect, near, far?)`
  (infinite-far variant when `far` omitted), `lookAt(eye, target, up)`.
- `interface Camera3DParams { target: Vec3; distance: number; pitch: number;
  yaw: number; fovY: number; aspect: number; near: number; far?: number }`
  (world is XY ground plane, **+Z up** — matches `skinnedPipeline`'s vertex convention).
- `eyePosition(p): Vec3`, `viewMatrix(p): Mat4`, `projMatrix(p): Mat4`,
  `viewProjMatrix(p): Mat4`, `invViewProj(p): Mat4`.
- `projectPoint(p, world: Vec3): { ndc: Vec3; clipW: number }`.
- `screenRay(p, ndc: [number,number]): { origin: Vec3; dir: Vec3 }`.
- `unprojectToPlaneZ(p, ndc: [number,number], planeZ: number): Vec3 | null` — the
  picking primitive.

**Ownership:** single source of truth for both GPU-uniform packing (`02`) and CPU
picking (`04`/`05`). The three existing CPU projection copies collapse onto this.

## What the human can run / see

New route `/renderer/camera3d-probe` in `apps/renderer-lab/src/router.ts`: a **2D
`<canvas>`** (NO WebGPU, so it renders on this Mac regardless of the headless-blank
issue) drawing a world ground grid + a unit cube + a formation of dots projected
through the real matrices, with pitch / fov / distance / yaw sliders and a live
"project → unproject round-trip error" readout. Lets the human eyeball that
perspective converges correctly before any GPU cost.

## Verification

- **Vitest** `web/tests/camera3d.test.ts` (or renderer-core test):
  - round-trip `unprojectToPlaneZ(projectPoint(w).ndc, w.z) ≈ w` < 1e-5;
  - known-value projection of axis points (target → NDC center);
  - view matrix orthonormal (`Rᵀ·R = I`);
  - reverse-Z depth **monotonic decreasing** with distance, finite in [0,1];
  - `invert(viewProj)` reconstructs identity;
  - determinism (same params → byte-identical `Float32Array`).
- No screenshot gate (nothing GPU). No perf gate (CPU).
- The probe route uses a 2D canvas, so **no `screenshot-critique` is required** for
  this slice (no rendered GPU shot) — but if you snapshot the probe canvas for a
  regression, run `screenshot-critique` on it as the last check.

## Must stay green

- `bun run --cwd web test`, `cargo test --workspace` (untouched — pure TS).
- No consumer wired yet, so nothing else can regress.

## Human feedback that would change this slice

Handedness / units (confirm +Z up, meters, that `zoom` stays the user-facing
control upstream and the rig derives `distance` from it), and infinite-vs-finite
far plane. Flagged as a **non-blocking** checkpoint: open the probe with
`preview-shots`, give ~5 min, else proceed on the round-trip evidence and record
the call here.
