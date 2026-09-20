# M6 — complete the shadow contract

Depends on M1b, M2 and M4. Selected backend: raw WebGPU.

[M6a](m6a-cascade-contract.md) specifies the pinned source split/fade behavior,
bounded texture/uniform layout and per-cascade phase ownership. Implement and
verify that contract before the final High visual/motion gates below.

The shared shadow policy owns fit/caster views; the promoted raw shadow module owns depth textures, uniforms and receiver bindings. Preserve default fitted single1024 and off modes, and implement the existing user-visible High mode: two2048 cascades with the required split/fade behavior and offscreen casters. Establish a renderer-neutral split owner from the actual current CSM behavior rather than a second ad-hoc camera. Materialize buffer/texture-array layout and per-cascade phase reads/writes before that implementation.

Require source/native default and High controls, real fit telemetry, depth/receiver and caster admission checks, and actual shadow on/off crops. Run slow/fast pan, reversal, zoom/cascade crossings, moving troops, resize and environment changes. Keep the whole-map measurement fallback distinct. This joins08/09; original outside-volume equivalence, A/B/C cost and continuous readability remain open.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.


Implementation is integrated at b89a806a from Claude c1e78391. Independent review
found no actionable regression and passed31 focused tests plus TypeScript.
Root confirmed the scene fits/culls the same camera, distinct caster buffers,
array receiver binding and M4 admission fixes after integration. Hardware WGSL,
single-map pixel preservation, cascade crossings and final cost are still open.
The unchanged-camera path avoids uploads but still computes candidate fits before
comparison; its CPU cost is not measured and no allocation-free claim is made.

[Implementation review](../assets/m6-high-implementation/README.md) records resource
variants, changed-test behavior and the still-open hardware gates.
