# Library-owned directional shadows

The TypeGPU and vgpu depth owners reproduce the existing directional shadow primitive control through their own resources, pipelines and public command APIs. Shared `shadowFrameData` owns the unchanged fit and packed camera/sampling data; shared WGSL owns projection, bias and five-tap PCF. Devices remain borrowed, and caster passes never bind the sampled depth they write.

All three backends pass all four source cases. Maximum HDR difference from Three is 0.00146484375, the shadow pixel counts match exactly, and identical local repeats are exact. Outputs are finite, with zero GPU errors, console warnings or live candidate textures after disposal. Every actual and expected PNG is byte-identical to the previously reviewed native primitive control; `image-identity.json` preserves the hashes and comparison. The TypeGPU local image was also inspected in this pass. Existing visual findings therefore remain applicable to these unchanged images; no new user-visible improvement is claimed.

TypeGPU owns a depth-only pass and uses its public, explicitly unstable command encoder API. vgpu requires a color target and fragment stage: its caster writes depth with an empty color write mask and a trivial fragment result. The unused 1024-square RGBA8 attachment consumes 4,194,304 bytes. Both primitive controls submit caster and receiver work in one library-owned command stream. The extra vgpu attachment is a candidate cost, not a hidden raw fallback.

The source fixture remains the same box, plane, local/horizon/whole-map fits and real Three shadow node from `c758b59d`. The pinned declaration workaround explicitly converts that node to vec3 and asserts only that public conversion's known output type. Native comparison images remain byte-identical after both this conversion and the pure-data extraction.

Two existing orthographic behavioral tests, the raw control TypeScript project and the shadow control build pass. Independent source review found no actionable defects. Real crowd/terrain receivers, source cold-frame behavior, broader caster audiences, full-world fidelity and performance are subsequent integration gates.

Reproduce with `shadow.vite.config.mts` served on port5199, then repeat this command for `raw`, `typegpu` and `vgpu`:

```sh
FRAME_CHECK_URL='http://localhost:5199/shadow-check.html?backend=typegpu' FRAME_EVIDENCE_DIR='../../../../specs/done/battle-performance/assets/02-typegpu/shadow-ports/' node apps/battle-perf-lab/src/raw/verify-frame.mjs
```
