> Historical read-only consultation. Contains hypotheses and rejected recommendations; [decisions](../../README.md) records verification and disposition. Not implementation instructions.

## Read-only consult — battle renderer performance plan

Nothing edited. I inspected the production path only; I did not run the gates (they need your Mac + `VERIFY_GPU_ADAPTER=hardware`).

---

## 1. The headline: the standing gate is not measuring your frame

| | gate (`perf:30k`) | your complaint |
|---|---|---|
| canvas | 1280×800, `deviceScaleFactor` unset → **dpr 1** (`web/scene.mjs:172`) | 1440×900 on a Retina Mac → **dpr 2** (`web/src/battle/renderer.ts:141-148` passes `window.devicePixelRatio` straight through) |
| backbuffer | 1.02 Mpix | **5.18 Mpix — 5.06×** |
| budget | 33 ms (30 fps), `battle-perf-30k.mjs:28` | 16.7 ms |
| GPU metric | `TimestampQuery.RENDER` **only** — `resolveTimestampsAsync(COMPUTE)` is awaited and then discarded (`packages/photoreal-renderer/src/world.ts:159-167`) | grass route compute + pose-palette compute are invisible to every number we have |
| sim | **paused** (`battle-perf-30k.mjs:144`) | live 30 Hz tick on the main thread |

Last hardware number on record: `gpuMedianMs` **22.5 / 30.74 / 22.84** at 30k soldiers, apple/metal-3 (`specs/done/living-meadow/slices/40-grass-perf-tune.md:39-46`). That is render-passes-only, at a fifth of your pixels, with the sim off. Any plan that starts anywhere other than "reproduce the actual frame" is optimizing a fiction. This is the fairness bias you asked me to hold.

---

## 2. Stutter hypotheses, ranked by evidence strength

**H1 — DPR: ~4× of your fragment cost is unmeasured and unbudgeted.**
Fragment-bound work (grass blade overdraw, bloom mip chain in `post/postChain.ts`, sky, aerial perspective, terrain) scales with pixels. There is no resolution-scale knob anywhere in the shell. Cheapest possible lever, largest possible win, zero look risk at 1.5× vs 2.0× on a 220 ppi panel.

**H2 — the shadow you can't see is costing you a second full crowd pass, and it defeats crowd culling.**
`resolveSunShadowMode` returns `"single"` unconditionally (`shadowRig.ts:83-96`) — CSM is off by default because it "costs roughly 25% of the battle frame". The `single` tier fits **one 1024² ortho map to the whole terrain rect** (`shadowRig.ts:195-218`). On a 2400×1600 map that is ~2.9 m/texel with `SHADOW_NORMAL_BIAS = 0.6` — a soldier is sub-texel, so you pay for it and see nothing.

Worse, that whole-map frustum is fed back into culling as a `CrowdProjectionView` (`battleWorld.ts:585`, `shadowRig.ts:229-265`). In `planPhotorealCrowdLods` every soldier on the map intersects it, so `visibility |= 2` for **all of them** (`crowdLod.ts:71-86`). Consequences:
- the shadow-audience buckets draw every soldier at LOD ≤ 2 (`lod.ts:6,97`; `crowdLayer.ts:129`);
- `group.pending` = main ∪ shadow, so the **pose-palette compute dispatch runs over the entire army, not the visible crowd** (`crowdLayer.ts:384-415`, `posePalette.ts:319-321`);
- shadow buckets hold a *second* independent copy of every tier geometry (`crowdLayer.ts:258-259`).

This is the finding that makes your constraint satisfiable: **fitting the shadow to the view makes shadows visible AND cheaper**, because the shadow frustum stops being a cull-defeating map-sized box.

**H3 — grass pan hitch: a 64 MB buffer reallocation every ~80 m of camera travel.**
Record stride is 16 floats = 64 B (`game-renderer/src/battle/grassField.ts:9-11`). The focus ring caps at 1,000,000 records (`battleGrassField.ts:156`) — 64 MB. On pan past the 80 m hysteresis (`:153,349-353`), `completeSampleTask` calls `applyPackedRecords(..., { incremental: false })` (`:633-635`), which copies the whole array and builds a fresh `createGpuRuntime` → new storage buffers, old ones disposed. The incremental upload path (`bladeFieldLayer.ts:1076-1120`, `settlePackedRecordUpload`) exists and is **deliberately bypassed** here. Plus `updateCpuMirrorTierCounts` then walks all ~1M records once (`bladeFieldLayer.ts:838-860`), and the CPU sampler burns 4 ms/frame slices in the run-up (`GRASS_SAMPLE_SLICE_BUDGET_MS = 4`, `:161,590-606`).

**H4 — grass steady-state is a fixed cost that doesn't care how many troops you have.**
`routeGpu` dispatches reset+route over every record every frame for base *and* ring (`bladeFieldLayer.ts:708-725`). Base ≈ 1M (`STATIC_GRASS_MAX_RECORDS`, `:151`), ring up to ~785k (radius 300 m / 0.6 m cell) → ~1.8M invocations × 2 passes/frame, entirely outside `gpuTimeMs`. The ring radius (300 m) is far larger than the ground actually on screen at tactical zoom. Grass and "many visible troops" are competing for the same frame, and grass wins by default.

**H5 — zoom is a staircase, not a ramp (your "horizon" symptom).**
`activeGrassVisibleRadiusM` picks from `[40, 90, 160, 260]` by `ceil(eyeZ/15)` with **no hysteresis** (`battleGrassField.ts:711-716`). Crossing eyeZ = 15/30/45/60 flips the radius, and `activeGrassTransitionProfile` rescales `denseBladeEnd`/`farGrassStart`/`farGrassEnd`/tier boundaries in one frame — a look pop *and* a cost step mid-zoom. `background.setStyle(zoom < 1.2 ? …)` is a second binary switch (`photoreal-renderer/.../battleWorld.ts:550`).

**H6 — a 30 Hz sim on the main thread against a 60 Hz present is a sawtooth by construction.**
`ACTION_TICK_SECONDS = 1/30` (`crowd-runtime/src/actionTimeline.ts:187`), `BATTLE_MAX_TICKS_PER_FRAME = 4`, and `game.advance_ticks` runs inline in `frame()` (`web/src/battle/battleLoop.ts:157-163`). At 60 fps that is a tick on every *other* frame. Native 30k developed-combat tick is 35 ms with 8 Rayon threads; **wasm is serial** (`specs/done/sim-perf/README.md:5-8,29-32`). At 7780 men in real combat this is a periodic multi-ms spike no GPU work can hide. Your memory note already records the sim-worker seam as scoped-not-built.

**H7 — camera input has no temporal filtering.**
`zoomAt` applies each wheel event immediately (`web/src/shared/cameraKeys.ts:45` → `web/src/shared/camera.ts:346-375`); `panWorld` is raw dt-scaled. A frame-time spike becomes a *position* jump, and trackpad wheel jitter reads as judder even at a stable 60. Some of "not smooth" is motion, not throughput — and it's the cheapest thing on this list to fix.

**H8 — per-frame JS garbage across the whole army.**
`timeline.sample(tick)` allocates a fresh `SoldierPlayback[]` per frame; `buildCrowdInstances` allocates `new Set(mountedClasses)` per frame (`crowd-runtime/src/instanceData.ts:64`); `observe()` allocates five typed arrays + clones every observation object per tick boundary (`web/src/battle/battleCrowd.ts:103-111`). GC pauses correlate with pan (more instances crossing frusta).

---

## 3. The shadow ledger (your explicit constraint)

You want visible default unit shadows at tactical zoom, paid for by savings elsewhere. Target texel density: ~10–15 cm/texel gives a readable soldier contact shadow; 2048² at 10 cm covers ~205 m, which is roughly the tactical-view ground footprint.

| item | today | proposed |
|---|---|---|
| shadow maps | 1× 1024² over ~2964 m (2.9 m/texel) | cascade 0: 2048² fitted to ~200 m of view (~10 cm/texel); cascade 1: 1024–2048² to the existing 1500 m fade |
| crowd in shadow frustum | **all soldiers on the map** | soldiers near the visible region only |
| palette compute dispatch | main ∪ shadow = whole army | visible ∪ near-cascade |
| what you see | nothing | grounded soldiers |

The saving is structural, not a tuning tweak: it comes from the cull, not from cheaper shading. Everything in §2 (H1, H3, H4) is additional headroom on top. I'd underwrite the shadow out of H2 + H1 alone and bank H3/H4 as margin.

Caveat to hold: `CSM_CASCADES = 2` was already tried and rejected at ~25% of frame — but that was CSM splitting the *live* camera frustum out to `SHADOW_MAX_FAR = 1500` while still re-rendering the map-wide crowd. A view-fitted near cascade is a different workload. The spike must prove it, not assume it.

---

## 4. Engine question: three vs raw WebGPU vs TypeGPU vs vgpu

Holding the hidden-integration-cost bias you asked for:

**None of H1–H8 changes if you swap engines.** Whole-map shadow frustum, DPR policy, 1.8M grass records, a 30 Hz main-thread tick, unfiltered wheel input — every one of those is our workload and our scheduling. An engine swap can only buy back *fixed per-frame engine overhead*, and the draw-call count here is roughly 100–250, not 10,000.

What a swap costs, concretely: `packages/photoreal-renderer` is ~11k lines across 32 files, all three/TSL — Hosek sky (`atmosphere/skyModel.ts`), aerial perspective, PBR+IBL soldier response, CSM, bloom + AgX tone map, terrain/sea/grass materials, octahedral impostors, overlays/readouts/standards. Plus every committed PNG under `web/shots/` is a **zero-tolerance** pixel gate; a rewrite invalidates the entire verification apparatus at once. (Your memory already flags battle verify baselines as stale-red at HEAD, which compounds this.)

The one honest argument *for* is that the repo is already fighting three's internals in at least four places — the reverse-Z render-list reversal workaround (`world.ts:102-115`), reaching into `renderer._attributes` / `backend.data` to free storage (`posePalette.ts:45-75`), the `PaletteStatement` hack for a dropped void expression (`posePalette.ts:20-36`), and `perDrawBindings` + per-draw `onBeforeRender` rebinding (`bladeFieldLayer.ts:683-695`). That is real friction and it should be *measured*, not argued about.

On the two typed layers: TypeGPU and vgpu emit the same WGSL and the same WebGPU calls. They buy typed bindings and authoring ergonomics — **not** frame time — and neither ships a PBR/IBL/shadow/post stack. Choosing either means paying the full raw-WebGPU rewrite cost *plus* a dependency. (I'm not confident about vgpu's current WebGPU scope from memory; pin that in the spike rather than take my word.)

**My recommendation:** run the spikes, but sequence them so they're decisive and cheap, and gate them behind the measurement slice. The spike that matters is *frame-cost attribution* — split the measured frame into (a) fixed engine overhead and (b) our workload. If (a) is small, the comparison spikes end there and you've spent two days instead of two months. If (a) is large, you'll know exactly which subsystem to port first, and you can port it behind the existing `BattleRenderer` seam (which survived hand-rolled WebGL → Babylon → bespoke WebGPU → three; see `README.md:345-364`) rather than big-bang.

---

## 5. Slice graph

```
M. Measure (blocks everything)
   M1 ─ honest frame: 1440×900 @ real dpr, 7780 men, tactical zoom,
        sim LIVE; publish RENDER + COMPUTE timestamps + rAF histogram
   M2 ─ attribution: per-subsystem GPU/CPU split (crowd main, crowd shadow,
        grass raster, grass compute, palette compute, post, sky/terrain,
        sim tick, JS build/upload) — the ledger every later slice is scored against
        │
S. Spikes (parallel, both gated on M2; decided together)   ── comparison first, per your ask
   S1 ─ engine-overhead spike: fixed per-frame cost of three's render list +
        node rebinding on THIS scene vs a hand-rolled submission of the same draws
   S2 ─ shadow spike: view-fitted near cascade — texel density, cull collapse,
        measured delta vs today's whole-map 'single'
        │
A. Free headroom (no look change, no baseline re-bless)    ── needs M2 only
   A1 ─ render-scale knob (dpr policy + quality ladder entry)         [H1]
   A2 ─ shadow-frustum cull fix: stop feeding a map-sized ortho
        into planPhotorealCrowdLods                                    [H2]
   A3 ─ ring rebuild off the incremental bypass; kill the 1M-record
        CPU mirror walk on activation                                  [H3]
        │
B. Smoothness (motion, not throughput)                     ── independent of A/S
   B1 ─ zoom/pan temporal filter; wheel event accumulation             [H7]
   B2 ─ continuous grass radius/transition ramp (one owner, keep it —
        just make the staircase a ramp with hysteresis)                [H5]
        │
C. Budget (needs M2 + A; look-affecting, David-gated)
   C1 ─ grass record/ring budget vs visible ground footprint           [H4]
   C2 ─ ship the visible shadow on S2's evidence                       [H2]
        │
D. Main thread (largest, needs M2 to justify)
   D1 ─ sim tick off the 60 Hz frame (worker seam or amortization)     [H6]
   D2 ─ crowd-path allocation removal                                  [H8]
```

Order: **M → (A ∥ B ∥ S) → C → D**. A and B are the ones I'd expect to land 60 fps on their own; S runs alongside so the engine question is answered with numbers rather than deferred; C and D are where it stops being free.

---

## 6. Evidence paths

Production path
- `packages/photoreal-renderer/src/battle/battleWorld.ts` — frame composition; note `updateGrass()` runs twice per frame (`:456` and via `prepareRender` → `battleGrassField.ts:356-358`)
- `.../battle/crowdLayer.ts`, `.../battle/crowdLod.ts`, `packages/crowd-runtime/src/lod.ts` — culling, LOD, main/shadow audiences
- `.../battle/shadowRig.ts` — the shadow tier decision and the whole-map ortho fit
- `.../battle/battleGrassField.ts`, `.../battle/bladeFieldLayer.ts`, `packages/game-renderer/src/battle/grassField.ts` — grass sampling, ring, route compute, record stride
- `.../battle/posePalette.ts` — per-frame skinning compute
- `.../src/world.ts` — the RENDER-only GPU metric; `.../post/postChain.ts` — bloom + AgX
- `web/src/battle/battleLoop.ts`, `battleCrowd.ts`, `renderer.ts`, `web/src/shared/camera.ts`, `cameraKeys.ts` — main thread, DPR, camera input

Harness / prior art
- `web/scenes/battle/battle-perf-30k.mjs` (gate), `battle-cpu-profile.mjs` (CPU tool), `web/scene.mjs:170-175` (viewport defaults)
- `specs/done/living-meadow/slices/40-grass-perf-tune.md` (the only hardware GPU numbers on record + the documented knob map)
- `specs/done/sim-perf/README.md` (35 ms native / serial wasm / worker verdict)
- `specs/done/3d-perspective-renderer/assets/impostor-spike-notes.md`, `sea-spike-notes.md` (prior spike format)
- `README.md:345-392` (the camera-seam principle that makes an engine swap survivable, and the "library owns the loop" trap)

---

## 7. What I'd want from you before M2 locks

1. **The real frame.** Confirm 1440×900 at dpr 2 (not a scaled display mode), and which zoom stop + map you're judging on — I'd rather pin your actual case than assume the gate's `zoom 3.0 @ (0,-310)`.
2. **Shadow style.** Contact-only under each man, or full-length sun shadows across the field? That sets the cascade budget and it's a look call, not a perf call.
3. **Render-scale acceptability.** Is 1.5× DPR with everything else intact an acceptable default, or is native-2× a hard requirement? This single answer changes how much the rest of the plan has to find.
4. **Spike depth for S1.** Cheap version measures three's overhead on the existing scene (~1–2 days). Expensive version ports one subsystem (crowd) to raw WebGPU for a like-for-like (~1–2 weeks). I'd start cheap and only escalate if M2 shows fixed overhead is material.

One flag before any of this ships: your memory records battle verify baselines as stale-red at HEAD. Anything in B or C re-blesses screenshots, and re-blessing on top of a red baseline loses the gate. Worth clearing that first, separately.
