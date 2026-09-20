# Convert the selected renderer without losing capability

Keep the existing TypeGPU lab world runnable while closing its gaps against the
promoted renderer. The final package has one selected implementation; temporary
raw comparison owners remain lab inputs and leave the production graph at cutover.
No wholesale restoration of the older candidate, production selector or compatibility
layer. Shared camera, terrain, palette, animation and shadow policies stay shared.

Independent active passes:

- Typed colour functions: actual shader bodies for soldier and impostor consumers,
  canonical faction palette, negative type checks and independent old-WGSL GPU
  comparison. This establishes useful body-level type safety without claiming
  other retained string bodies are checked.
- High shadows: typed array texture and receiver schema, separate camera per
  cascade, real caster routing, current single/High/off allocation and lifecycle.
  Reuse existing shadow policies and numerical controls; preserve all thresholds.

Then integrate frame/depth/resize/resource ownership, crowd reload and diagnostics,
followed by terrain/grass/water/atmosphere/effects/post capability mapping. A shared
TypeGPU root may simplify resolution and teardown, but must preserve component
replacement lifetimes. Public encoder interop is supported by installed types;
verify command order, borrowed-pass behavior and runtime cost in actual consumers.
Do not build global registries or compatibility adapters on assumed collisions.

Each pass states which schemas, bindings and shader bodies are typed, which bodies
remain WGSL and why, and the tests that guard each boundary. Convert remaining
bodies in bounded equivalence-tested steps. Compile-time protection supplements
GPU validation, disposal and visual/motion checks; it replaces none of them.

The original migration exits and final live/net-shadow acceptance still apply.
Raw-only wins, held battles, reduced content or lower framebuffer scale cannot
substitute for selected-renderer live acceptance.
