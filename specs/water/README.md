# Water — IFFT-ocean look across civsim's three water surfaces

Replicate the water effects from `Spiri0/Threejs-WebGPU-IFFT-Ocean` (a WebGPU ocean
using a JONSWAP wave spectrum + IFFT compute shaders — deep choppy open sea, whitecaps
everywhere, a sun-glint streak) across civsim's **three** water surfaces, in civsim's
own 2.5D tilted-ortho renderer and Bronze-Age Aegean palette.

Reference image (the compare-screenshots target):
[`assets/reference-ifft-ocean-dusk.png`](assets/reference-ifft-ocean-dusk.png).

---

## Next Agent Prompt

> **Status:** Slices 1–7 landed on **main** — the **open-sea look is complete in the lab**. The
> remaining integration + cleanup was **re-sliced** (2026-07-01) after a first battle-integration
> attempt hit a shoreline seam; three independent drafts converged on the plan below. Winner:
> **Gerstner** (see [`slices/01-bakeoff-decision.md`](slices/01-bakeoff-decision.md)). Last
> updated 2026-07-01.
>
> **You are picking up at Slice 8 — coastal FIELD water (the new first integration).** The old
> S8/S9 order is **inverted**: the reverted attempt proved the field↔sea shoreline seam is a
> *material mismatch* (the sea plane and the field water were two different shaders meeting at the
> shore), not a geometry bug — you cannot caulk a seam between two materials, you remove it by
> making both sides one material. So **S8 unifies the on-field battle water onto `waterShade`
> first** (defining a shared `waterShoreRamp` depth/haze helper), and **S9 drops the open-sea
> horizon plane onto that same material** so the seam cannot exist by construction.
>
> **Before you start:** read [`slices/08-integration-notes.md`](slices/08-integration-notes.md)
> (the attempt's verified findings + the exact blocker), then
> [`slices/08-battle-coastal-field-water.md`](slices/08-battle-coastal-field-water.md). Invoke the
> `aesthetics` and `renderer` skills. The whole look (clock, sun, geometry, foam, glint, colour,
> haze) is **frozen** — these slices reconcile seam/depth/MSAA/seating, not the look.
>
> **Load-bearing facts from recon (do not relearn the hard way):**
> - The **live battle does NOT use `terrainPass.ts`** — only `BattleHorizonPass` + `BattleGroundPass`
>   are wired (`web/src/battle/renderer.ts`). `terrainPass` water (kind-0/10) is **lab-fixture-only**.
>   Production field water is a **flat vertex tint (`groundPass.ts` `TINT_COLOR[1]`) baked into the
>   gameplay heightfield mesh that soldiers ride** — so field water **cannot be a separate displaced
>   pass**; it is a **per-fragment `waterShade` on the existing ground mesh**, keyed by a water-weight
>   vertex attribute, with the collision height field UNTOUCHED (a seating gate guards it).
> - `waterPlanePass` on main is **still lab-only** — the `baseZ` / `hazeNear/Far` / shore-keyed-depth
>   generalizations were in the reverted attempt and **must be rebuilt** (S8 builds them as the shared
>   `waterShoreRamp` helper; defaults = today's lab values so every `water-*.mjs` lab scene stays
>   byte-identical).
> - **Judge at the 3/4 gameplay camera (`view=field`), not the grazing `view=west`** — the grazing edge
>   view compresses every distance ramp into a false straight line. `view=west` is a regression-only snap.
> - **Gerstner won → IFFT and its compute plumbing are dead code** (no device ever selects `ifft`;
>   Gerstner is analytic and universal). Deleted in S11.
> - **`CampaignWaterPass` is dormant** (never wired to production); the campaign sea is the `mapPass`
>   raster mask. Deleted in S10; campaign gets subtle `waterShade` behaviour injected into `mapPass`.
>
> **Slices 6–7 result:** distance-keyed **haze** in `waterShade` dissolves the far sea into the
> preset sky (no hard horizon; glint fades with haze) — `water-haze` scene gates the soft seam.
> **Animation** rides `cam.time` (`shell.setTime`): the 20-wave Gerstner phases advance by
> dispersion, foam noise drifts, glint shimmers — judged (unprimed) a believable, coherent,
> pop-free open-sea cadence; deterministic at fixed `t` (the `water-rhythm` scene pins a
> filmstrip + emits `shots/misc/water/rhythm.gif`). **Known refinement (not a blocker):** foam
> could linger/decay a touch longer (true foam persistence needs a feedback buffer — a future
> polish, out of scope for the analytic field).
>
> **Slice 5 result:** water is now **neutral albedo × environment preset** — `waterPalette.ts`
> (Aegean turquoise→deep-blue albedo, depth-ramped by distance) × `waterEnvironment.ts` presets
> (golden / dusk / overcast: `keyColor`, `fillColor`, `hazeColor`, `exposure`, sun az/el). The
> plane pass injects the palette + chosen preset; `waterShade` lights the neutral albedo with
> warm key + cool fill, adds a broad warm sun-**glitter track** + sharp sparkles (the glint is
> the sun's own colour — the provisional warm constant is folded into `WATER_KEY`), and lays
> preset-lit foam. Unprimed aesthetics PASS: same sea re-lit three ways, believable Aegean blue,
> dusk dim not a dark diorama. The `water-albedo` scene proves two-light neutrality (golden reads
> warmer than overcast). Default lab preset is now `golden`; the S2–S4 scenes are colour-agnostic.
>
> **Slices 2–4 result:** the Gerstner field is a 20-wave discretised spectrum (isotropic swell,
> fine chop). `waterShade` (shared) shades the body by `normal·sun`, lays height-keyed granular
> whitecap foam, and adds a narrow specular **sun-glint** streak banded to the sun azimuth. The
> **sun direction lives in the camera uniform's last two pads** (`sunAz`/`sunEl`, `shell.setSun`,
> `sunDirection()` in `cameraWgsl`), defaulting to the battle sun — this moved zero existing
> pixels (battle snapshots byte-identical). Glint tracks the sun (proven by the `water-glint`
> scene sweeping `sunAz`) and carries a provisional warm tint so it separates from white foam in
> neutral grey. All judged PASS (unprimed). **Known:** the glint column concentrates near the sun
> and thins toward the foamy near foreground — it will read stronger once S5 darkens the water
> body; the IFFT *fallback* look is untuned (only shows on no-compute devices).
>
> **Before you start:** invoke the `aesthetics` skill (the visual north star) and the
> `renderer` skill (the build/debug workflow for GPU + WGSL work). Every visual slice
> ends with the `screenshot-critique` skill as its last check, and uses the
> `compare-screenshots` skill against `assets/reference-ifft-ocean-dusk.png` whenever it
> has a wave-geometry / foam / glint target.
>
> **GPU verification on macOS (important):** headless Chromium and SwiftShader have **no
> working WebGPU adapter** on this host — the only real adapter is Apple Metal, reachable
> **only headful**. Run GPU scenes as
> `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_HEADFUL=1 VERIFY_URL=http://localhost:<port> node scene.mjs <scene>`.
> (The `dpr2 freezeAtTick` check in `renderer-lab-routes` is a known headful-capture flake —
> re-run it; it passes at 0 diff.)
>
> **Active warnings:**
> - **Gerstner won and is analytic/universal, so IFFT is dead code** (nothing selects `ifft` in
>   production). Leave `water/ifftField/` alone until Slice 11 deletes it — do not build new work on
>   it. `createWaterField` / the `WaterFieldSource` seam are kept (the production firewall).
> - The camera BGL is now **`VERTEX | FRAGMENT`** and the camera uniform's first pad is the
>   `time` clock (`setTime`). This moved zero existing pixels (battle/campaign snapshots are
>   byte-identical) — keep it that way.
> - Battle runs **MSAA = 1** today (the "edges use 4" comment is aspirational). New water
>   pipelines must still call `gpuMultisample(shell.sampleCount)` to stay MSAA-safe
>   (`waterPlanePass` already does).
> - Animated pixels break `snapCheck` unless time is injectable. Use `shell.setTime(t)` with
>   a fixed `t`; snap every visual gate at a fixed `t` (the look scenes snap `?t=3.0`).
> - The displaced plane is a uniform grid (res 340) shaded per-fragment; that keeps the near
>   field crisp without a graded grid. Foreground faceting (the old S2 risk) is resolved.
>
> **Global TODO (each item → owning slice):**
> - [x] S1 — Technique bake-off spike + frozen seam + decision artifact → `slices/01-bakeoff-decision.md` (**Gerstner won**)
> - [x] S2 — Wave silhouette / displacement (open-sea plane, neutral grey) → `slices/02-wave-silhouette.md` (**20-wave spectrum + waterShade**)
> - [x] S3 — Whitecap foam coverage (granular height-keyed whitecaps) → `slices/03-foam-coverage.md`
> - [x] S4 — Sun-glint streak (banded specular, sun-tracking) → `slices/04-sun-glint.md`
> - [x] S5 — Water albedo + depth ramp × env preset (waterPalette + waterEnvironment) → `slices/05-albedo-depth-ramp.md`
> - [x] S6 — Horizon haze / aerial perspective (distance-keyed haze in waterShade) → `slices/06-horizon-haze.md`
> - [x] S7 — Animation rhythm (deterministic clock, believable cadence) → `slices/07-animation-rhythm.md`
> - [ ] S8 — Battle **coastal field water** onto `waterShade` (per-fragment on `groundPass`; the
>   shared `waterShoreRamp`; **the seam-foundation slice**) → `slices/08-battle-coastal-field-water.md`
> - [ ] S9 — Battle **open-sea horizon** plane onto the S8 material (seam closes by construction) →
>   `slices/09-battle-open-sea-horizon.md`
> - [ ] S10 — Campaign strategic sea (subtle, zoom/pitch-gated) + delete `CampaignWaterPass` →
>   `slices/10-campaign-sea.md`
> - [ ] S11 — Delete the IFFT loser + `close-spec` → `slices/11-cleanup-close.md`
>
> **Before you end your pass:** update this section — move the status/date, tick the TODOs you
> closed, note the next pickup point, and record any recon fact or decision that would save the
> next agent a wrong turn (like the `terrainPass`/seating/shore-ramp facts above).

---

## Locked product decisions (from the interview — do not relitigate)

1. **Scope = all three water surfaces:** battle open-sea horizon plane, battle coastal
   gameplay water, campaign strategic sea.
2. **Technique is decided by a bake-off, not up front.** Slice 1 builds **both** candidates
   behind one seam and picks the winner on visual + perf evidence:
   - **(A) Gerstner** — analytic sum-of-waves displacement + procedural foam/glint in the
     existing inline WGSL. No new infra.
   - **(B) IFFT** — JONSWAP spectrum → compute IFFT → displacement/normal/foam texture.
     Requires net-new WebGPU compute infrastructure.
   - **Prior:** at this camera (distant horizon plane, small coastal patches, 2.5D ortho)
     IFFT's true dispersion is largely invisible while its compute cost and weak-GPU risk
     are real, so Gerstner is the likely winner. The spike exists to disprove that
     honestly, not to rubber-stamp it.
3. **Palette = neutral albedo × environment preset.** Replicate the reference's wave
   **geometry, whitecap foam, and glint behavior**, but drive color from civsim's lighting
   preset (warm Aegean by day; dusk-capable). **Do not bake the dark dusk mood into the
   albedo.** Honor the aesthetics creed: "don't bake light into albedo" and "not a dark
   diorama."

---

## The seam that makes this safe: `WaterFieldSource`

All three drafts independently landed on the same firewall, so it is load-bearing:

```ts
// packages/game-renderer/src/water/waterField.ts
export interface WaterFieldSource {
  readonly id: 'gerstner' | 'ifft';
  wgslSample(): string;                          // injects `fn waterField(p: vec2f, t: f32) -> WaterSample`
  bindGroupLayout(): GPUBindGroupLayout | null;  // null for analytic Gerstner
  ensureFrame(enc: GPUCommandEncoder, t: number): void; // no-op for Gerstner; dispatches IFFT compute
  bindGroup(): GPUBindGroup | null;
}
// WaterSample = { height: f32, normal: vec3f, foam: f32 }
```

The candidate-agnostic `waterPlanePass.ts` only ever calls `wgslSample()` and binds
`bindGroup()` — it never knows which technique is live. The look slices (foam, glint,
color, haze) and all three production surfaces are written **against the seam, not the
technique**. Deleting a candidate = deleting its one producer file + its branch in the
factory.

**Asymmetry (resolved):** **Gerstner won** (Slice 1), so IFFT is deleted entirely in Slice 11.
Gerstner is analytic (no GPU compute, `bindGroupLayout()` returns null) and therefore runs on
*every* adapter — it is its own weak-GPU fallback, so nothing ever selects `ifft` in production.
The `WaterFieldSource` interface + `createWaterField` factory are **kept** (collapsed to a single
Gerstner producer): they are the firewall the production surfaces are written against, cheap to
retain, and keep consumers untouched.

---

## Package / module boundaries

```
packages/renderer-core/src/
  frameConstants.ts   NEW?  the clock+sun uniform (or reuse free Camera pads); Slice 1 picks the shape
  capabilities.ts     EDIT  add computeOceanSupported (compute + storage-buffer probe; reuse assertStorageBufferFits)
  frameShell.ts       EDIT  optional pre-render compute dispatch hook; write the clock; BGL visibility (see unknown #1)

packages/game-renderer/src/water/        NEW — the one home for water
  waterField.ts        the A/B seam (interface above) + the factory
  gerstnerField.ts     candidate A producer (analytic, pure-WGSL, no infra)
  ifftField/           candidate B producer (JONSWAP spectrum → compute IFFT → texture)
  waterPlanePass.ts    candidate-agnostic render pass consuming a WaterFieldSource
  waterMaterialWgsl.ts shared WGSL: waterShade(sample, sunDir, glintBand, depth01, haze01) -> color (all surfaces)
  waterShoreRamp.ts    NEW (S8)  shared distance-from-shore depth/haze ramp both field water + open sea call
  waterPalette.ts      neutral albedo + depth-ramp + foam/glint constants (kills the inline color sites)
  waterEnvironment.ts  {keyColor, fillColor, hazeColor, exposure, sunAzimuth, sunElevation} presets: golden / dusk / overcast

apps/renderer-lab/src/router.ts          EDIT  lab review routes (bake-off route deleted in S11)
web/scenes/{battle,campaign}/water-*.mjs NEW   gated visual scenes (VERIFY_GPU=1 hardware headful), snap at fixed t
```

The inline water-colour sites that collapse onto `waterPalette`/`waterShade` at the integration
slices — **2 production** (`horizonPass.ts:22-23` → S9; `groundPass.ts:23` `TINT_COLOR[1]` → S8) +
`mapPass.ts:~222` sea (S10) + **lab-only** `terrainPass.ts` water kinds (folded in S8 for lab
parity; the live battle does not use `terrainPass`).

---

## Slice graph

```
S1  bake-off spike ──┬─► picks technique (Gerstner) + freezes the WaterFieldSource seam + the clock
                     │
        (winner only, tuned on the open-sea waterPlanePass in the lab route)
                     ▼
S2 silhouette ─► S3 foam ─► S4 glint ─► S5 color/depth ─► S6 haze ─► S7 rhythm   [DONE, on main]
                     │   (one visual variable each; neutral grey until S5)
                     ▼
        (integrate the locked look into the three production surfaces)
S8 battle COASTAL FIELD water ─► S9 battle OPEN-SEA horizon ─► S10 campaign sea
   (defines the shared shore     (snaps onto S8's material;
    material + waterShoreRamp)     the shoreline seam cannot exist)
                     ▼
S11 delete IFFT loser + close-spec
```

Why this order: the look (S2–S7) is judged on the **open-sea surface in the lab** — the exact
subject of the reference, isolated from integration noise; each visual variable gets a clean
single-variable verdict in neutral grey (S2–S4) before colour (S5). **Integration was re-ordered
after the first attempt:** the field↔sea shoreline seam is a *material mismatch*, so S8 unifies the
on-field water onto `waterShade` **first** (both sides of every shore become one material via a
shared `waterShoreRamp`), then S9's open-sea plane meets an identical material at the shore and the
seam is structurally impossible. Integration reconciles seams/depth/MSAA/seating — it does not
re-litigate the frozen look.

---

## Review map (what the human looks at, per slice)

| Slice | Playable artifact | Reference compare? | Judged crop |
|---|---|---|---|
| S1 | `/renderer/water-bakeoff?tech=…&compare=1` + perf table | yes, both techs (geometry+foam+glint, not mood) | full open-water plane |
| S2 | `/renderer/water-bakeoff` (winner, grey) | yes (silhouette only) | mid-frame swell band |
| S3 | same | yes (foam coverage only) | open-water whitecap field |
| S4 | same | yes (glint shape/placement) | the sun-track band |
| S5 | `…?preset=golden|dusk|overcast` | dusk vs ref (behavior, not values) | near→far water gradient |
| S6 | `…` framed to the horizon | yes (soft horizon) | sea-to-sky seam band |
| S7 | `…&play=1` GIF | n/a (motion) | full plane over time |
| S8 | `/renderer/battle-terrain-3d?gate=coastal-scrub&view=field&t=…` + live river/lake battle | **shore-grade** target (shallow tan→turquoise→blue + swash foam), **not** the deep-ocean ref | shoreline / shallows band, 3/4 camera |
| S9 | `…?gate=coastal-scrub&view=field` (primary) + `&view=west` (regression) + live battle | yes, `reference-ifft-ocean-dusk.png` (geometry/foam/glint, not mood) | horizon sea + shoreline band over a beach battle, 3/4 camera |
| S10 | `/renderer/campaign-map` at near + far zoom | **subtle** target (campaign deliberately diverges from the deep-ocean ref) | coastline + sea-lane + coastal label, 2 zooms |
| S11 | full suite | — | — |

**Standing verification gate (every visual slice, S8–S11):** the last check before accepting any
shot is the [`screenshot-critique`](../../.claude/skills/screenshot-critique) skill — an unprimed
second opinion the regression snaps and the implementer's own eyes cannot supply. Where a slice
has a target to compare against (a prior look it changes, or the reference/shore-grade/subtle
target above), it also runs [`compare-screenshots`](../../.claude/skills/compare-screenshots) to
judge candidate-against-target (telemetry + a less-wrong verdict), not a match-the-reference check.
Judge at the **3/4 gameplay camera**; the grazing `view=west` is a regression snap only.

---

## Firewalls / scope guards

1. **The shoreline seam (the load-bearing firewall).** Field water (S8) and open sea (S9) MUST be
   the **same material at every shore** or a seam is inevitable — proven by the reverted attempt.
   S8 extracts a shared **`waterShoreRamp`** WGSL helper (depth/haze keyed on **distance-from-shore**,
   not camera distance) that *both* the on-field water and the open-sea plane call with identical
   `waterPalette`/`golden` constants. S9 must not invent its own ramp. Verify continuity at the 3/4
   camera first, then the grazing `view=west` regression snap.
2. **Field water cannot displace the collision surface.** Soldiers/props ride the `groundPass`
   heightfield mesh. S8's water is a **per-fragment `waterShade`** on that mesh (ripple normal +
   foam via a water-weight attribute), and must **not** alter `terrainHeightAt`/the seating height —
   a position-hash A/B seating gate proves units don't float or sink (memory: "golden hash has no
   cavalry"). Only the S9 open-sea plane (no units on it) displaces, through `projectWorld3d` +
   `civsimBattleWorldDepth3d`.
3. **Campaign painted-chart vs animated-waves.** Owned by Slice 10: subtle, zoom/pitch-gated
   `waterShade` behaviour (glint+foam) injected into the `mapPass` sea branch, foam only at
   coastlines, a `seaAnimateMix` strength knob, additive-only fallback, **no displacement**. The
   deep-ocean reference is explicitly **not** the campaign target. The dormant `CampaignWaterPass`
   is **deleted**, not revived (it would be a second sea authority fighting the mask).
4. **MSAA / depth.** The battle water pipelines (S8 ground, S9 plane, `horizonPass`) must call
   `gpuMultisample(shell.sampleCount)` even though battle is MSAA=1 today; the horizon pipeline
   currently omits it. Campaign sea is a single depth-write map-fill mesh (Slice 10), no displacement.
4. **Determinism / weak-GPU perf.** Time is injectable (`fixedTime` pattern); every visual
   gate snaps at a fixed `t`. A `gpuTimeMs` perf gate (`enableGpuTimer` + `timestamp-query`)
   rides every surface slice; tessellation / IFFT resolution are the dials; Gerstner is the
   perf floor. Prove containment with a position/time-pinned A/B hash, not byte-identity
   (memory: "golden hash has no cavalry").

---

## Known unknowns Slice 1 must resolve

1. **Where the clock lives** — three free Camera-uniform pads + widening the camera BGL to
   `VERTEX | FRAGMENT`, vs a separate `frameConstants` bind group (the render graph already
   declares a `frameConstants` resource, `renderGraph.ts:49-53`). Recommended default: widen
   visibility + use a pad float (cheapest, no new bind group on every pipeline) — but it
   **must move zero existing pixels**. Record the choice in the decision artifact.
2. **Is IFFT compute supported and worth it** on the real target GPU(s) — the `gpuTimeMs`
   delta vs Gerstner at the battle *and* campaign cameras is the whole point of the spike.
3. **Deterministic snapshotting** of animated water (fixed-`t` injection that keeps
   `snapCheck` green).
4. **Depth/MSAA/perspective** behavior of a large displaced plane in the 2.5D ortho
   projector (z-fight, horizon seam).
5. **The `WaterField` WGSL sampling contract shape** both candidates satisfy — frozen as the
   seam so later slices and loser-deletion are mechanical.
6. **Can the single campaign map-surface mesh carry animated sea**, or does sea need its own
   overlay pass keyed by `seaAmount()`? (Confirm direction for Slice 10.)

---

## First useful playable checkpoint

The lab look (S1–S7) is complete: `/renderer/water-bakeoff?tech=gerstner&preset=golden|dusk|overcast&t=…`
shows the finished open-sea surface. The first **in-product** checkpoint is **the coastal battle
after Slice 8** (`/renderer/battle-terrain-3d?gate=river-and-crags&view=field&t=…`), where the
on-field river/shore water becomes the shared `waterShade` material; then **Slice 9** turns the
sealed ocean edge of a beach battle (`gate=coastal-scrub&view=field`) into a foam-and-glint sea that
laps the shoreline with no seam and reads warm under golden hour — the closest real surface to the
reference image. Judge both at the 3/4 `view=field` camera, not the grazing `view=west`.
