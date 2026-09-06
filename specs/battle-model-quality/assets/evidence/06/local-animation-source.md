# 06a source implementation

The approved [encoding experiment](./local-encoding-proposal.md) is implemented in the [single local-animation owner](../../../../../packages/soldier-assets/src/localAnimation.ts). Source samples and frozen snapshots share its packing. The original local-pose owner supplies exact-seconds sampling and all quaternion interpolation; the encoder introduces no competing quaternion math.

This is a prepared source prerequisite for coherent06b integration. Existing bundle formats, producers, assets and renderer paths are unchanged. The new module has no production runtime caller until that cutover; it is not a permanent optional/legacy reader. Parent owns registering the new bake test at integration and replacing all old matrix-animation consumers in06b.

## Numerical result

The committed `local-animation.test.mjs` loads all three source catalogs, shares rigs by resolved skeleton URL, and compares actual source and decoded skin positions across all three mesh tiers. Float32 stored local values and resolved fractions pass through the existing CPU quaternion/hierarchy/skin implementation. This does not simulate every future GPU arithmetic operation.

- 8,302,608 original-track versus decoded vertex checks: maximum error1.8506258364033728e-6m, below the approved current-fixture1e-5m gate.
- 100 mounted masked compositions,86,400vertices: maximum error2.388837865275353e-7m.
- Near-parallel antipodal quaternion keys, unrelated and simultaneous channel keys: maximum positional subdivision residual7.03083780010854e-7m. The residual is not called zero.
- Existing Blender-reference CPU test still passes all10samples/8,640vertices with maximum error3.916562555692296e-7m.
- Shared storage remains56,304GPU local-pose bytes,452STEP-mask bytes and1,112CPU timestamp bytes across four unique rigs. Production appearances share one rig, not20copies.

## Changed-test ledger

The new test first failed because the approved source module did not exist, then passed after implementation. It adds behavior coverage without weakening or deleting existing assertions:

| Test surface | Previous coverage | New observable contract |
| --- | --- | --- |
| STEP boundary | No encoded local-pose path | Immediately-left/exact/right values remain0/2/2, even when Float32 alpha immediately-left rounds to1; terminal phase1 holds the final value even for a loop clip. |
| Exact-seconds bake | Source phase sampling only | For key0.09s in duration0.17s, phase roundtrip lands at0.08999999999999998s and still sees the previous STEP; direct-seconds bake preserves the exact key's new value. No source phase semantics were altered. |
| Local channels | No local encoding | Mixed T/R/S STEP bits, bind-only joints, non-unit scale components, static zero-duration clips, antipodal shortest-arc rotations and nonlinear near-parallel subdivision are checked through decoded poses/positions. |
| Authored time range | Fixed-rate matrix bake | Keys beyond duration do not extend playback; duration's actual source pose is retained. Duplicate/non-increasing channel times reject. |
| Frozen storage | No shared GPU local packing | Authored samples and frozen locals produce the same packed values; packing does not mutate controller-owned snapshots. |
| Source geometry | Existing integer-matrix probes | All roster/diagnostic tiers and mounted local overlays satisfy the declared source-decoding geometric gate at fractional phases and key sides. |

Commands passed: dedicated local-animation and local-pose tests; full `web` bake tests; normal web typecheck; and explicit strict TypeScript checking of the new unintegrated local-animation module. Existing producer `--check` gates inside the bake suite prove no generated asset drift. No GPU/browser or snapshot baseline was run or changed.

## Review and remaining boundaries

Shape review keeps one local-animation format/packing/resolution owner and reuses existing pose math. There is no format version switch, sparse fallback or compatibility adapter. The current JSON container and runtime admission remain06b work, so this source pass does not claim malformed network payload admission coverage. Resolved samples are internal outputs of the exact interval resolver, not a second external API.

Independent Codex review `01a075cb-a7b8-7613-9733-bb13c84aa8c1` found no concrete source-only defects. It checked STEP boundaries, exact-time baking, endpoint clamping, quaternion subdivision, packing, mixed masks and the all-rig numerical claims against the approved contract. No findings were dismissed. The final pass added no compatibility path or runtime mutations.

The48byte GPU pose layout and per-source interval payload were explicitly approved. Future palette/shader work must preserve mixed channel STEP selection, exact boundary interval choice, endpoint holds, shortest-arc interpolation, local-before-hierarchy composition, visible/shadow agreement and frozen snapshot lifetime. It must also revalidate the analytic bounds' numerical allowance for its actual arithmetic.07 still measures instance preparation, snapshot/palette memory and synchronized interruptions; this numerical result does not accept GPU performance or new art budgets.
