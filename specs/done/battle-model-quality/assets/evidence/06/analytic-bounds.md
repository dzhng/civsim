# Continuous local-pose bounds prerequisite

Scope: producer bounds only, based on59d69b5c. Meshes, materials, skeletons, clip data and VAT encoding are unchanged. Integer sampled poses remain the mapped-tangent admission gate, never the conservativeness argument.

## Mechanism and numerical scope

For each joint, gather bind plus every source key translation, rotation and scale. Translation uses the per-component interval box; scale uses the maximum absolute component. Range-preserving CPU interpolation retains those intervals at arbitrary interruption depth. Masking selects another admitted local value. Rotation uses the operator bound `sqrt(1+4*q²*max(0,q²-1))`. The [local-palette revalidation](gpu-rounding-bounds.md) supplies the admitted near-unit endpoint and normalized-intermediate numerical limits. This does not depend on frame rate or enumerate pose combinations.

Center the sphere on the Float32-rounded midpoint of the root-translation envelope. Propagate each joint's maximum linear operator norm and origin distance from that center through its ancestors. For each influenced vertex, transform its bind position by that joint's inverse bind, then bound its distance by origin distance plus world linear norm times inverse-bind point length. Sum four nonnegative weighted distances and account for the actual weight sum's deviation from one. Maximize over every vertex of all three tiers; the fixed far mesh is the first tier. This also permits nonuniform scale and preserves all authored translations.

The implementation uses outward positive arithmetic: every positive intermediate advances one Float32 beyond its nearest Float32 value. Norms are scaled before squaring. With `gamma(n)=nu/(1-nu)`, the allowance follows current operation counts: six rounded operations/storage for a TRS coefficient, seven for a mat4 dot. The local-palette revalidation uses portable WGSL `u=2^-23`, distinct from CPU nearest-even storage `2^-24`. A 3x3 coefficient-error bound gives Frobenius/operator error at most three times the coefficient bound; affine dot error uses `sqrt(3)*linearNorm*translationNorm + parentTranslationNorm`. Each hierarchy multiplication and inverse-bind multiplication gets its own allowance; parent absolute translation is bounded separately from centered distance. Inverse-bind operator norm uses `sqrt(||A||1*||A||infinity)`, not an assumption of perfectly orthogonal serialized matrices.

Skinning carries three rounded stages, covering both current orders: CPU per-joint point transform then weighted point accumulation/store, and GPU weighted matrix columns then point dot. Its relative factor is `(1+sqrt(3)*gamma(7))^3-1`. Absolute underflow terms use the smallest Float32 **normal**, `2^-126`, so flush-to-zero is covered; lost matrix coefficients are amplified by vertex length, not treated as a constant positional epsilon. Nonfinite or unrepresentable bound arithmetic rejects instead of returning an infinite sphere. These conservative counts dominate the existing Float64 CPU arithmetic followed by Float32 stores.

This is a model-local guarantee for the current mat4 skin path. Renderer world translation/yaw and culling-plane arithmetic have their own owner. Future06 GPU local quaternion interpolation, hierarchy/palette arithmetic and packing must revalidate or revise this numerical allowance. The analytic envelope survives that change; this implementation-specific rounding allowance is not advance certification of it.

## Changed-test ledger and evidence

- New `animated-bounds.test.mjs`: two integer poses give old center `[0,0.5,0]`, radius1.118033988749895; a half-turn's midpoint lies1.5 from that center. The observed red was `quaternion arc escapes bounds: 1.5 > 1.118033988749895`. New center `[0,0,0]`, radius1.0000261068344116 contains that midpoint at distance1; FPS1 andFPS60 produce identical bounds.
- New adversarial controls:200 deterministic fractional, blended and alternating-mask poses with four weights and scaled ancestry pass both actual CPU skinning and rounded GPU weighted-column arithmetic. Largest distance/radius0.44717157553664855.
- New retained-source controls:174,960 vertex checks across all20 production appearances plus diagnostics40/41/42, with random fractional clip pairs/blends/masks. Maximum distance/radius0.9521221077875921. These controls supplement the proof, not replace it.
- Existing mapped-frame rejection is retained; the new test pins a zero mapped tangent rejection and a scale outside finite Float32 bounds rejection. No pre-existing test assertions or snapshot baselines were weakened.
- Self-review added an affine admission regression: an inverse bind with bottom-row X9e-6 and root translation1e6 was previously admitted (red: missing expected exception). The bounds owner now requires exact `[0,0,0,1]` inverse-bind bottom rows; the importer's approximate TRS reconstruction check is insufficient for this proof. All retained source matrices satisfy this condition. This rejects projective inputs rather than quietly treating them as affine.

Commands: `node packages/soldier-assets/bake/animated-bounds.test.mjs`; all three existing producers and their `--check` modes; `cd web && bun run bake:test`; `cd web && ./node_modules/.bin/tsc --noEmit --pretty false`. The new test is registered in the shared bake command. Source and merged runs pass; the original source-only pass performed no GPU capture.

## Radius impact

Metres, rounded here for review; manifests retain exact values. Ratios compare the former sampled-box circumsphere, not measured rendering cost.

| Appearance | Previous | Continuous | Ratio |
| --- | ---: | ---: | ---: |
| archers |1.442791|2.036901|1.411778|
| artillery-crew |1.810951|2.021607|1.116324|
| heavy-phalanx-rest |2.534369|2.798215|1.104107|
| heavy-phalanx-sidearm |2.534369|2.798215|1.104107|
| heavy-spear |2.163692|2.475815|1.144255|
| heavy-sword |1.610480|1.826131|1.133905|
| horse-archers |2.019645|2.015837|0.998115|
| light-spear |2.110185|2.394688|1.134824|
| light-sword |1.513891|1.826131|1.206250|
| longsword |1.592791|1.879444|1.179968|
| medium-infantry |1.533939|1.826131|1.190485|
| medium-phalanx-rest |2.534369|2.798215|1.104107|
| medium-phalanx-sidearm |2.534369|2.798215|1.104107|
| medium-phalanx |2.613495|2.911464|1.114012|
| medium-spear |2.165945|2.475815|1.143065|
| peasant |1.450330|1.826131|1.259114|
| phalanx |2.613495|2.911464|1.114012|
| shock-cav-sidearm |2.707122|2.792674|1.031602|
| shock-cav |3.328227|3.443055|1.034501|
| skirmishers |1.666430|1.946226|1.167902|
| human-diagnostic40 |1.293385|2.659076|2.055905|
| mounted-diagnostic41 |1.403466|2.312289|1.647557|
| six-material-swatches42 |2.512700|3.854023|1.533817|

The largest production squared-radius area proxy is1.9931; diagnostic40's is4.2268. These are not measured culling work or frame-time ratios.07 must measure retained instances and frustum-edge workload;15/28 still own final distance/readability acceptance. A slightly smaller horse-archer sphere is possible because this is not the old box's circumsphere and uses a different center.

## Integration and audit recommendations

All20 production centers become `[0,0.09000000357627869,0.6150000095367432]`; diagnostics become `[0.3700000047683716,-0.23000000417232513,0.10999999940395355]`. Root translation is deliberately retained: placeholder death lowers/advances hips, mounted diagnostic horse-body translation is vertical bob, and imported ancestor translation is part of the retained source hierarchy. Generic node-zero/root stripping would change authored motion.

The sole direct scene dependency was `battle-model-material-swatches.mjs`, which used candidate42's culling center as its camera target. Integration43c7bd72 anchors the exact prior target `[0.4382672905921936,-0.5502896159887314,1.6100001335144043]` in the fixture. Its strict snapshot is unchanged before and after the bounds cutover. Far atlas projection derives from actual mesh positions and does not consume this sphere.

Decision audit recommendations: retain this single bounds producer; do not reintroduce sampled-extrema fallback, per-clip lookup or an arbitrary radius multiplier. Treat root-centered diagnostic inflation as an explicit07 measurement cost, not reason to silently relax conservativeness. Keep numerical arithmetic and future GPU implementation acceptance separate.

Independent review01a075b3-30dd-74f0-9b38-85338f341e0a found no actionable counterexample in the current hierarchy/Float32 allowance and independently ran the new test. It explicitly excluded GPU/browser execution and future GPU-local sampling. A focused follow-up review of the subsequent affine guard also returned clean: current glTF, placeholder and basis-conversion producers emit or preserve exact affine bottom rows, and the new regression rejects projective inverse binds. Full bake tests, typecheck, the dedicated bounds test and all three deterministic producer checks passed again after the guard.

## Merged prerequisite verification

The [merged browser report](bounds-scenes.json) passes the workbench, swatch
oracle, far bundles/admission, reload disposal and default battle checks. Existing
snapshots remain unchanged; no baseline was refreshed for bounds. This validates
current consumers, not the future palette implementation.

The [standing hardware gate](bounds-hardware.json) passes on Apple Metal3 at
1280×800 with30,560 soldiers and150 GPU samples per stop. Mid/vista medians are
11.67/12.79ms; pan, zoom sweep and wheel rAF p95s are19.17/21.41/20.01ms, within
the unchanged33ms budget. This remains a paused-simulation renderer gate;07 owns
live animated loads, new palette costs and diagnostic-sphere inflation.
