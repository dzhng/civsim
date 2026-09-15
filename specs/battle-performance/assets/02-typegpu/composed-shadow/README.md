# Library-owned shadow receiving

TypeGPU and vgpu now compose the current directional shadow map with their existing sky, terrain, twelve posed soldiers and post chain. One shared fit/PCF policy supplies the light camera and sample function. Each candidate owns its caster pass and sampling resources; the source fixture remains the Three control from `b29e522e`.

All eight enabled/disabled, 1x/4x runs complete with zero GPU errors, browser warnings, nonfinite values or live candidate textures after disposal. Every disabled-shadow display image is pixel-identical to its committed frame-port baseline. Enabling shadows changes 19,047 tactical pixels at1x and19,673 at4x, with no alpha changes; this is actual shadow receiving rather than a prepared-but-unused map. The horizon views change2,538/2,837 pixels. `effects.json` records decoded PNG RGB pixel comparisons, including counts above one code value and alpha changes.

The strict maximum-channel comparison against Three remains red. The source's first frame retains its known wrong-direction shadow; no warm-up was inserted or hidden. On later4x tactical frames, TypeGPU has one pixel above one display code (maximum5), while vgpu has two (maximum21). Both horizon4x results stay within one display code. At1x the existing sparse edge differences remain. This evidence is component integration, not full-scene equivalence or a performance result.

The previously observed initial native HDR change is retained. TypeGPU's enabled4x run also changes by0.000244140625 in the later tactical HDR repeats; its cause is not established and the report is not relabelled stable. Other later identical-camera repeats are exact. Camera changes are intentionally excluded from repeat stability interpretation.

TypeGPU uses an optional expanded environment layout in the existing beauty bind-group slot, plus a separate uniform-only caster layout and vertex variant. It does not require a fifth bind group and never samples the depth attachment while writing it. Its frame-owned public encoder contains pose preparation, caster, beauty and post work; the API remains publicly marked unstable. vgpu uses its public Frame passes, a uniform-only caster shader/binding subset and the already documented4MiB unused color attachment. Public pose dispatches retain their separate submissions. Both paths borrow device/environment resources and dispose owned dependents first. Disabled mode omits shadow allocations and passes.

The TypeScript control project, production control build and independent source review pass. Primitive shadow controls and their unchanged shared sample function were separately verified before this integration. A tactical4x output was inspected during this pass; fresh independent visual acceptance remains pending. Scenery, grass, impostors, broader caster audiences, full live replay and performance remain separate gates.

Reproduce using the frame Vite config on port5199 and the common verifier. Repeat for `typegpu`/`vgpu`, sample counts1/4, and remove `&shadows` for disabled mode:

```sh
FRAME_CHECK_URL='http://localhost:5199/frame-check.html?backend=typegpu&samples=4&shadows' FRAME_EVIDENCE_DIR='../../../../specs/battle-performance/assets/02-typegpu/composed-shadow/on/samples-4/' node apps/battle-perf-lab/src/raw/verify-frame.mjs
```

The verifier's nonzero exit preserves the strict image diagnostic. Runtime error arrays and disposal counts must still be checked independently.

[Fresh independent still review](review/findings.md) confirms matching soldier
coverage and plausible foot contact after the initial source shadow-direction
change. Both ports retain the same first-source leftward shadow versus subsequent
rightward shadow discrepancy. One-sample plain repeats differ within soldier
pixels; six other actual repeat pairs are pixel-identical. This is limited static
correspondence, with aliasing and stippling retained, not cold-frame, full-world,
interactive or performance acceptance.
