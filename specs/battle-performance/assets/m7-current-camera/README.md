# Current-camera banner and readout sizing

Integrated63999a8d asb1818420. Overlay preparation now binds the canonical camera's
CSS-pixel scale once, before drawing. It no longer queries the renderer's previous
camera. The shared Euclidean-distance/FOV approximation and visual thresholds stay;
obsolete facade/world sizing methods are removed. The scene comparison uses its
own already-submitted canonical pose through the same pure helper.

Hardware regression at three zoom transitions and DPR1/2: all six controls submit
incorrect banner scales first and correct them on a second draw at the **same
camera**; all six candidates submit the settled values immediately. For example,
a zoom first produces scale5 in the control before correcting to roughly2.5.
The candidate needs one draw rather than two in this frozen-state probe. This is
not a claim of doubled live FPS: live frames already draw continuously.

Shared snapCheck first/settled captures prove an actual image change. Independent
review prefers the smaller first-frame banners because soldiers are unobscured,
and sees no material first/settled candidate difference. Settled DPR1 pixel changes
are confined to the army-card HUD (max12); two DPR2 zoom-in pixels differ by up to38.
Those small differences are retained rather than reblessed or wholly attributed.
Other DPR2 settled pairs are exact. All runs have tick30/hash15927906182668164452
and no page errors. Both comparison arms use the integrated golden lighting.

Root22 focused tests and full TypeScript pass. Independent code review finds no
actionable regression and passes18 targeted tests. The complete-scene source/raw
controls pass audience/error/lifetime checks before/after:15 of16 images are exact,
including every settled image. Raw tactical initial differs at36 pixels, max18;
initial variability remains explicit. The initial runner invocation omitted the
required catalog URL and failed before rendering; retained separately, then
corrected without changing the test.

The combined lighting/camera source30k floor passes all18 unchanged checks:
30,560 soldiers,585 scenery; GPU medians11.83/13.54ms, pan p95=18.26ms,
wheel p95=20.13ms. Owned builds/tests/GPU work are serialized for that timing.
This is the standing source regression floor, not raw/live60fps acceptance.

## Test behavior ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| battleCrowd / battleCrowdHeld | Renderer stub provides80px/m | Camera-bound sampler provides80px/m; assertions unchanged | Camera owns current projection |
| Immediate overlay zoom/pan | Previous renderer pose could drop/readjust readouts | Current pose supplies scale before any draw | Prevent one-frame sizing lag |
| Repeated build | Stable | Stable | No new stateful smoothing |
| CSS/DPR and near hide | Could read old renderer viewport/pose | Current CSS viewport and pose determine scale/visibility | Preserve pixel sizing during camera changes |

Worker's restored-old-path probe fails4/5; restored fix passes5/5. Root hardware
first/settled comparison independently reproduces the bug and verifies the fix.
