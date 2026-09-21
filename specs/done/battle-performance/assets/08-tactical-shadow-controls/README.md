# Tactical shadow controls on the production route

Target: clearly attached sun-direction shadows beneath the front and middle tactical ranks, with bright readable terrain and intact soldier detail. These captures approximate the user reference composition; they do not reconstruct an unknown original save.

The unchanged source renderer ran `/?map=A&ai=off` at frozen tick 30 with its default single map, and the existing `shadows=off` and `shadows=csm` overrides. Every capture uses 1440×900 CSS, DPR 2, identical recorded camera pose and 15,560 soldiers. All modes have the same 1,651 view-visible soldiers. Both shadowed modes retain all 15,560 L2 casters, including 13,909 shadow-only soldiers. The source production build is the fixed enabled/three artifact at `a72bb343`, hash `33e3c6599ff5405f3b31df891c5a28710659e2b130dafa8ff164461cfeb07fa4`.

All three modes completed without page errors. Each was captured twice through `snapCheck`; within-run decoded pixels match exactly. These new control captures do not re-bless an existing baseline. The rectangular crop bounds and grayscale/delta metrics live in `captures/region-metrics.json`; they include models and ground, not segmented shadow masks. The full report preserves mode identity, camera pose, populations and comparisons.

## Verdict

The default front-rank crop is effectively indistinguishable from shadows-off: grayscale mean absolute delta is only 0.000024/255. CSM changes that crop by 1.3313/255 and produces visible contact. The fresh reviewer judged CSM less wrong, while identifying merged/blurry rank-wide shadows, broad terrain darkening and possible detachment. The parent agrees with the relative contact improvement, but does not accept CSM as the final default: individual contact quality, bias/softness and motion still need work. The middle crop has measurable differences even where the reviewer could not distinguish default from off at displayed scale; their visual tie is not a claim of pixel equality.

Review labels map A=off, B=default single, C=CSM. Full frames and 2× nearest-neighbour front/middle crops are retained exactly as supplied to the independent reviewer. Its possible detachment finding remains a hypothesis to resolve with tighter contact diagnostics, not a proven bug. Default single is one 1024² map; CSM uses two 2048² maps. Both retain the current 0.6 world-unit normal bias and environment-derived softness.

This was a serialized shared-host visual control, not a timing run. No performance saving, acceptable shadow overhead, motion stability or final readability pass is claimed. Browser and preview server were closed. Production settings and shaders are unchanged. The result supports testing a view-focused fit with explicit texel density and contact criteria; it does not authorize dropping offscreen casters that affect visible receivers.
