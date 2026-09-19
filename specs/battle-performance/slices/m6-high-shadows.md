# M6 — complete the shadow contract

Depends on M1b, M2 and M4. Selected backend: raw WebGPU.

The shared shadow policy owns fit/caster views; the promoted raw shadow module owns depth textures, uniforms and receiver bindings. Preserve default fitted single1024 and off modes, and implement the existing user-visible High mode: two2048 cascades with the required split/fade behavior and offscreen casters. Establish a renderer-neutral split owner from the actual current CSM behavior rather than a second ad-hoc camera. Materialize buffer/texture-array layout and per-cascade phase reads/writes before that implementation.

Require source/native default and High controls, real fit telemetry, depth/receiver and caster admission checks, and actual shadow on/off crops. Run slow/fast pan, reversal, zoom/cascade crossings, moving troops, resize and environment changes. Keep the whole-map measurement fallback distinct. This joins08/09; original outside-volume equivalence, A/B/C cost and continuous readability remain open.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.
