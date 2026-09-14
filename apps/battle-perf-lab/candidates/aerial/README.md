# Aerial numerical control

This isolated control compares the shared aerial WGSL with the production
`aerialPerspectiveNode`, applied through `scene.fogNode`. The reference receives
real world-position attributes, the real camera eye, and a separate ground-focus
uniform. Both implementations sample identical bytes from Three's baked sky LUT,
so a sky-port difference cannot disguise an aerial-math error.

The [recorded result](evidence/aerial.json) has exact agreement at RGBA16F precision
across the preset and geometry probes. The cases separate range, height, horizon,
sun direction and observer focus, and preserve partially transparent surface
alpha. They use ordinary nonzero view vectors. This is a function-level numerical
check, not full-frame visual or performance evidence.

The odd output dimensions exercise the common HDR row-unpacking utility also
used by the sky, PMREM and post controls. The candidate shader has no Three
runtime dependency; Three appears only in this reference harness.

Start `bun run --cwd web vite --config vite.aerialcheck.config.ts --host
127.0.0.1 --port 5196`, then acquire the coordinated GPU slot before running
`node apps/battle-perf-lab/candidates/aerial/verify.mjs`. The verifier closes its
browser on either pass or failure.
