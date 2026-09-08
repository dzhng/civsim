# Held production-clock comparison

Target: displayed soldiers, ground rings and unit standard remain complete and
coherent through ordinary fractional pause, explicit endpoint freeze, and
restored pause. This is a diagnostic presentation integration check, not final
character art or moving-contact acceptance.

A is root `f06a0260` in `/Users/david/dev/game-live-consumer-control` (Vite5463).
B is the live-consumer candidate in `/Users/david/dev/game-delayed-root-phase-policy`
(Vite5464). Identical read-only `stats.clock` and submitted `debugSoldierAnim.root`
diagnostics are installed in both. Identical scene SHA256:
`d1094a9d2116947e2980c5e202c891e55049fdb6da6b36a03dd36b25478f11d1`.
Both use bundled headless Chromium/SwiftShader, 1280×800, identical camera,
seed/order and generated WASM SHA256
`8ab9bd8ea4cfd2d3de456bc0ca25d7f33a6f941d2b51babf0bfc493638e2a8a5`.
No engine source, asset, simulation clock or capture tolerance changes.

The existing real-clock study installs Playwright's clock before navigation,
then drives the actual production clock through its catch-up cap and pause key.
The held state is tick4124/alpha.18. Soldier106 is nearest the unit centroid;
its projected height is105.91px. Earlier index0 framing missed the standard
despite nonzero submitted counts. Those initial `fractional/frozen/restored`
PNGs and reports remain preserved in both worktrees, not marker evidence.

Corrected B preflight70521 exited0. Main and parent viewed the actual frame
before proceeding: the complete cloth, crossbar, pole and nearby full rings
are visible. A41281 and repeat30563 exited1 only on the intended restoration
assertion. All three A repeat snapshots were exact0px. B90617 and repeat51376
exited0; all three B repeat snapshots were exact0px. No page errors. GPU/browser
was released after51376; no start/contact film was run.

At the same authoritative endpoint `[2.3704540729522705,-92.19778442382812]`,
A's held root `[2.355783462524414,-92.20025634765625]` becomes the endpoint
after freeze/unfreeze. B's held/restored root is exactly
`[2.3592629432678223,-92.19966888427734]`, phase `.07787354230649854`.
The whole returned observation is identical across B's pause/restoration.

[Exact decoded RGBA comparison](metrics.json): A/B fractional367026px,
frozen0px, restored417595px. A held/restored313338px; B3619px. **The latter is
not whole-image identity:**2807 pixels lie outside the standard's approximate
rectangle and differences span the frame. Existing world time, including
standard and vegetation wind, remains wall-clock-driven (`renderer.ts` and
`battleWorld.ts`); this was an explicit scope exclusion. We did not prove exact
pixel attribution and do not call the entire difference cloth-only or claim
restored environment time. Per-state fresh-run repeatability is separately exact.

Main inspected all six full images and all six2× crops. No new gross missing
geometry is visible; dense diagnostic figures/rings and banner occlusion limit
individual ground-center/bearer attribution. The standard is a unit-centroid
marker, not a newly authored hand-carried prop. [Fresh neutral review](fresh-review.txt),
CLI8878/session `01a07fe8-c7ca-7053-b1e0-ea9a49cc078d`, exited0 after viewing
all12 images: overall A/B indeterminate, slight B restoration-consistency edge;
no obvious missing sections/gross layering failure; dense rings and hidden
bearer/grip remain ambiguous. These stills do not prove sliding, jitter or
moving root/pose synchronization. No final visual acceptance or baseline UPDATE.

Reproduction, from each arm's `web/`, choosing its port/report name:

```sh
SNAP=centroid- VERIFY_GPU=1 VERIFY_URL=http://localhost:5464 SCENARIO_REPORT_JSON=../throwaway/live-consumer-capture/b-centroid-repeat.json node scene.mjs battle-delayed-root-phase
```

Comparison/crop generation is an ignored local derivative command:
`node throwaway/live-consumer-capture/compare-held.mjs`; full PNGs here are
the unmodified shared-snapshot outputs. Crops are `[510,55,350,390]` at2× nearest
neighbor. No scratch comparison owner is added to product code.

## All-submitted follow-up

Root requested that restoration cover every submitted body, not just soldier106.
Scratch read-only prototype wrapper48231 exited0, with all three existing PNGs
still exact0px. [Raw inputs](all-submitted.json) and [runner report](b-input-probe.json)
prove all480 complete body instances (including roots, angles and playback),
standard packed pose/meta/field, selected rings, cues/effects and camera are
exact across held/restored. World time is3600.288 versus3600.352. The wrapper
calls the original draw unchanged and copies its post-draw inputs; no clock or
render setting was modified. Browser closed and GPU released at terminal.

Source localization identifies separate time consumers: `renderer.ts:236`
supplies ordinary wall time; `terrainLayer.ts:514–527` advects terrain noise;
`standardLayer.ts:165–167` deforms cloth; `battleWorld.ts:535` updates vegetation
wind. These are supported candidate causes for the remaining pixels, not a
proven per-pixel attribution. No all-scene equality claim follows from exact
submitted soldier/marker inputs. Further causal render mutation needs a separate
approved diagnostic slot.

First approved time-isolation attempt34654 exited0 but **did not establish
causality**: setting held world time then calling `world.render()` directly
without advancing the paused frame produced the unchanged restored image,
still3619px from held. Original three checks and actual-time restoration were
exact. Three's `PassNode.updateBeforeType=FRAME` and `NodeFrame` frame-id guard
can reuse the already-rendered post scene texture in this same frame; therefore
this result is not a valid negative test of animated terrain/cloth. The failed
diagnostic [report](b-world-time-probe.json) is retained. No direct frame-id or
production clock modification was made.

Corrected approved probe37570 ran one **actual paused RAF** with a scratch
world-time override before the original draw, then removed that override and
ran a real RAF at ordinary current time. It exited0, browser closed. The
held-world diagnostic PNG is **byte-identical / exact0 RGBA pixels** to the
original held image. Every one of480 body instances and all marker/camera
inputs remained exact; simulation pause/alpha.18 remained unchanged. Held world
time was3600.288; after removal, ordinary world time was3600.384. See
[report](b-world-raf-probe.json) and [complete observed inputs](all-submitted-world-raf.json).
This proves the3619-pixel held/restored delta comes from world-time presentation
in this fixture, without claiming a per-material breakdown. The production
environment clock is intentionally unchanged. No frame-id mutation, permanent
override or canonical diagnostic baseline is shipped.
