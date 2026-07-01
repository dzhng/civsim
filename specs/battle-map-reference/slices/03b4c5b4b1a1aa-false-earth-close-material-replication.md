# Slice 03B4C5B4B1A1AA - false-earth close material replication

## Contract

Stop approximating the close grass body inside the civsim renderer until we know
what the target architecture actually produces. Build a dedicated spike that
replicates the close-up false-earth grass material as directly as possible from
the referenced article and `momentchan/false-earth` code, then compare that
native result against the supplied close-material reference screenshot.

This slice owns one question: **can we reproduce the dense, glossy, overlapping
near-camera grass body from false-earth in a tiny standalone lab surface?**

## Reference

- Article: <https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/>
- Code: <https://github.com/momentchan/false-earth>
- User-provided close material target:
  `assets/03b4-evidence/03b4c5-close-foreground-lab/false-earth-close-material-reference/false-earth-close-material-reference.png`

## Approach

- Prefer a Three.js/WebGPU/TSL implementation for the first spike. That is the
  native shape of false-earth, and it is more useful to reproduce the source
  architecture faithfully before translating it into civsim's lower-level
  renderer.
- Build the spike as an isolated lab route or small first-class workbench, not
  as the production battle route. It may depend on Three.js/TSL if the package
  already exists or can be added behind this lab only.
- Copy the false-earth grass architecture first, with no civsim art direction
  tuning:
  - camera-snapped grid around the viewer;
  - deterministic world-position blade seeds;
  - packed four-`vec4` blade data: position/type, width/height/bend/wind,
    rotation/seeds, compressed terrain normal plus push vector;
  - Voronoi/clump parameter blending;
  - Bezier blade spine with wind/sway;
  - terrain-normal alignment;
  - view-dependent thickness for flat blade planes;
  - procedural blade shading: width-shaped normals, height AO, seed variation,
    roughness/lighting response, and distance desaturation;
  - LOD tiers or a documented no-LOD high-detail mode if the first visual proof
    is intentionally single-camera and bounded.
- Use the screenshot above as the visual target for this spike, including its
  low camera, horizon grass ridge, dense lower foreground, glossy directional
  blade highlights, and reddish false-earth material colour. This slice is
  allowed to use the false-earth colour/material because it is replicating the
  reference technique, not shipping civsim palette.
- Keep the lab deliberately artificial. Do not wire the result into battle map
  composition, terrain relief, water, fog, cliffs, units, or gameplay.

## Fixed Inputs

- Do not tune civsim's B4B1A0 close lab, field-owned meadow material, target
  close-hero crop, camera, palette, fog, terrain, atlas, or battle renderer
  implementation during this slice.
- Do not translate to civsim-native WebGPU until the native Three.js/TSL spike
  has a captured result and decision note.
- Do not port false-earth's character controller, cosmic waves, flowers, Leva UI,
  post-processing stack, story content, or final colours into civsim. Only copy
  enough to reproduce close grass body/material.

## Accept / Reject

Accept if the isolated spike produces a close-up grass shot that clearly has the
same architectural qualities as the reference screenshot: dense overlapping
blade body from the bottom foreground to the horizon ridge, continuous grass
mass with visible individual strands near camera, glossy directional highlights,
non-flat depth pockets, no exposed painted ground in the lower crop, and no card
wall/stamp/repeated-clump artifacts.

Reject if the spike cannot get close while using the source architecture, if the
repo code proves the screenshot depends on unrelated post-processing or assets
that are out of scope, or if the Three.js/TSL route cannot run inside this repo
without broad build-system churn. In that case, record the exact missing source
piece and reslice before returning to civsim-native grass.

## Verification

- Archive source notes, route URL, full lab shot, tight lower-foreground crop,
  target/candidate contact sheet, stats JSON, and a decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/false-earth-close-material-replication/`.
- Use `compare-screenshots` against
  `false-earth-close-material-reference.png`. Judge only the false-earth close
  material variables: foreground blade density, overlapping blade body,
  directional strand highlights, depth pockets, visible element scale, and
  absence of flat painted ground. Civsim palette, cliffs, water, sky, fog, and
  battle readability are out of scope.
- Run unprimed `screenshot-critique` scoped to: "Does this standalone
  false-earth-style grass material recreate dense close-up overlapping grass
  body like the reference screenshot, or does it still read as flat paint,
  sparse cards, repeated stamps, or screen noise?"
- Open the target/candidate sheet with `preview-shots` as a non-blocking human
  checkpoint. If there is no response, decide on the evidence, close Preview,
  record the decision, and continue.
- Keep `bun run --cwd web typecheck` green. If adding Three.js/TSL dependencies
  changes install/build state, document the exact package and why it is lab-only.

## Next Slice

If accepted, update the follow-on plan before implementation: either translate
the reproduced source architecture into a civsim-native close-body slice, or
replace `03b4c5b4b1a1ab-field-owned-foreground-occlusion-blade-layer.md` with a
new porting slice that preserves the reproduced false-earth variables one at a
time. If rejected, reslice around the exact missing source subsystem before
returning to B4B1A1AB or perf/coverage work.
