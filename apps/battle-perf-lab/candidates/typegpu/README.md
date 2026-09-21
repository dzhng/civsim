# TypeGPU verification laboratory

The [production battle world](../../../../packages/battle-renderer/README.md)
owns the TypeGPU renderer. This directory retains isolated API and numerical
controls plus resource-admission tests; it is not a second battle implementation.
The [build configuration](../../../../web/vite.typegpu.config.ts) serves these
controls with the same shader transform as production. Dependency versions live
in [the web package](../../../../web/package.json).

The preflight adapts Software Mansion's compute-to-vertex-buffer and triangle
examples, under the retained [MIT license](TYPEGPU-LICENSE). It verifies public
command-encoder integration and borrowed device/buffer ownership. Its
[hardware evidence](evidence/preflight.json) establishes that bounded contract,
not battle appearance or performance.

Numerical controls compare output before display transforms. The sky control
uses the retained Three atmosphere as an independent reference; the production
battle renderer does not import that reference. [Sky evidence](evidence/sky.json)
records finite HDR behavior, including the nonnegative output clamp required by
the reference material. The [post control](../raw-post/README.md) separately
compares the display transform. Historical full terrain comparisons belong to
[their pinned checkout](../terrain/README.md).

The shadow control tests cascade layer binding, overlap weights and terminal
fade using synthetic depth layers. Its tolerance is derived from float32 depth
precision and the overlap margin before measuring results. Layer and receiver
swap mutations must fail numerically with clean GPU validation; a broken GPU run
cannot certify a negative control. This does not verify caster fitting, moving
shadows, PCF softness or visual quality.

The impostor record control dispatches the production typed derivation on the
GPU and compares actual readback with the independent CPU packer. Changing only
the camera must change the derived records without republishing soldier state.
Tile equivalence is restricted to identical baked directions and equidistant
choices, with every difference reported. Numerical agreement does not establish
pixel or temporal parity.

[Tests](tests/) exercise the production owners directly. The verification
scripts beside each control define their inputs, report destinations and
failure gates. Browser controls require the coordinated GPU slot; unit tests and
builds do not. Readbacks and completion waits are diagnostic work, never part of
a performance claim.
