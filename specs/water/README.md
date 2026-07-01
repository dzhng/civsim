# Water — IFFT-ocean look across civsim's three water surfaces

Replicate the water effects from `Spiri0/Threejs-WebGPU-IFFT-Ocean` (a WebGPU ocean
using a JONSWAP wave spectrum + IFFT compute shaders — deep choppy open sea, whitecaps
everywhere, a sun-glint streak) across civsim's **three** water surfaces, in civsim's
own 2.5D tilted-ortho renderer and Bronze-Age Aegean palette.

Reference image (the compare-screenshots target):
[`assets/reference-ifft-ocean-dusk.png`](assets/reference-ifft-ocean-dusk.png).

---

## Next Agent Prompt

> **Status:** Slices 1–7 landed on **main** — the **open-sea look is complete in the lab**.
> Slice 8 (battle integration) was **attempted and reverted** (kept off main); its plan and the
> one unresolved blocker are captured in
> [`slices/08-integration-notes.md`](slices/08-integration-notes.md). Winner: **Gerstner** (see
> [`slices/01-bakeoff-decision.md`](slices/01-bakeoff-decision.md)). Last updated 2026-07-01.
>
> **You are picking up at Slice 8 — the first PRODUCTION integration (battle open-sea).**
> **Read [`slices/08-integration-notes.md`](slices/08-integration-notes.md) first** — it has a
> verified working approach (swap the `role:'ocean'` gradQuad in `battle/horizonPass.ts` for a
> per-edge `WaterPlanePass`; the plane already gained the `baseZ` / `hazeNear/Far` /
> shore-keyed-depth generalizations it needs, defaulting to the lab values) AND the one blocker
> that stopped it: a **shoreline seam** where the sea's distance ramps (depth/haze/shore-fade)
> compress into a straight screen line at the grazing `view=west` edge test and must reconcile
> with the field's own aerial haze + water tint. **Strong recommendation: do S8 together with
> S9 (coastal field water), or first unify the field water onto `waterShade`** so both sides of
> the shoreline are the same material and the seam cannot exist — and verify at a real gameplay
> 3/4 camera, not only the grazing edge test. The whole look (clock, sun, geometry, foam, glint,
> colour, haze) is **frozen** — integration reconciles seams/depth/MSAA/seating, not the look.
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
> - **Gerstner won; IFFT is retained only as the capability/weak-GPU fallback through Slice 8
>   and is deleted in Slice 11.** The look slices must read acceptably off *either* field
>   (the pick is reversible via `createWaterField({ tech })`).
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
> - [ ] S8 — Integrate: battle open-sea (first production surface) → `slices/08-integrate-battle-open-sea.md`
> - [ ] S9 — Integrate: battle coastal gameplay water → `slices/09-integrate-battle-coastal.md`
> - [ ] S10 — Integrate: campaign sea (subtle / chart-respecting) → `slices/10-integrate-campaign-sea.md`
> - [ ] S11 — Loser deletion + close-spec → `slices/11-cleanup-close.md`
>
> **Before you end your pass:** update this section — move the status, tick the TODOs you
> closed, record the bake-off winner once Slice 1 lands, and note the next pickup point.

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

**Asymmetry (a locked firewall):** if **Gerstner wins**, IFFT is deleted entirely. If
**IFFT wins**, Gerstner is **kept as the capability/weak-GPU fallback** and is never
deleted — which is why the look slices must read acceptably driven by *either* field.

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
  waterMaterialWgsl.ts shared WGSL: waterShade(sample, env, depth01) -> color (identical for both candidates + all surfaces)
  waterPalette.ts      neutral albedo + depth-ramp + foam/glint constants (kills the 4 inline color sites)
  waterEnvironment.ts  {sunDir, keyColor, fillColor, hazeColor, exposure} presets: golden / dusk / overcast

apps/renderer-lab/src/router.ts          EDIT  /renderer/water-bakeoff + per-slice review routes
web/scenes/{battle,campaign}/water-*.mjs NEW   gated visual scenes (VERIFY_GPU=1), snap at fixed t
packages/game-renderer/src/renderGraph.ts EDIT add the animated-water skeleton entries
```

The 4 inline water-color sites that collapse into `waterPalette.ts` at Slice 5:
`horizonPass.ts:22-23`, `terrainPass.ts` kind-0 (~91-102), `groundPass.ts:23`
(`TINT_COLOR[1]`), `mapPass.ts` (~222).

---

## Slice graph

```
S1  bake-off spike ──┬─► picks technique + freezes the WaterFieldSource seam + the clock
                     │
        (winner only, tuned on the open-sea waterPlanePass in the lab route)
                     ▼
S2 silhouette ─► S3 foam ─► S4 glint ─► S5 color/depth ─► S6 haze ─► S7 rhythm
                     │   (one visual variable each; neutral grey until S5)
                     ▼
        (drop the locked water pass into the real product)
S8 battle open-sea  ─►  S9 battle coastal  ─►  S10 campaign sea
                     ▼
S11 loser deletion + close-spec
```

Why this order: the look is judged on the **open-sea surface rendered in the lab** (the
exact subject of the reference, but isolated from full-scene integration noise). Geometry,
foam and glint are judged in neutral grey (S2–S4) *before* color (S5) so each is a clean
single-variable verdict. Integration (S8–S10) then only has to reconcile seams, depth,
MSAA, and prop/label seating — not re-litigate the look.

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
| S8 | `/renderer/battle-terrain-3d?gate=coastal-scrub&view=west` + live battle | yes | horizon band over a beach battle |
| S9 | `…&view=field` + live battle | shore-grade target (not deep-ocean ref) | shoreline / shallows band |
| S10 | `/renderer/campaign-map` at 2 zooms | subtle target (campaign deliberately diverges) | coastline + sea patch |
| S11 | full suite | — | — |

---

## Firewalls / scope guards

1. **No-compute-infra risk (IFFT).** All compute lives behind
   `capabilities.computeOceanSupported` (compute + `maxStorageBufferBindingSize` via the
   existing `assertStorageBufferFits`). Runtime falls back to Gerstner when unsupported, so
   weak/no-compute adapters always get *some* water. The fallback is a **Slice 1 gate**,
   not an afterthought. If IFFT wins, Gerstner is retained as that fallback.
2. **Campaign painted-chart vs animated-waves.** Owned by Slice 10: subtle, zoom/pitch-gated
   treatment, foam only at coastlines, a strength knob, and an additive-only fallback. The
   deep-ocean reference is explicitly **not** the campaign target. Decide
   revive-or-delete on the dormant `CampaignWaterPass` here.
3. **MSAA / depth / perspective.** New battle water pipelines must call
   `gpuMultisample(shell.sampleCount)` even though battle is MSAA=1 today. Displaced water
   goes through `projectWorld3d` + `civsimBattleWorldDepth3d` in the world-depth slot;
   Slice 2/8 check no z-fight with horizon blockers and no seam at the shore. Coastal
   `terrainPass` water uses flat `projectGround` today and **cannot displace** until moved
   to a z-bearing path (Slice 9). Campaign sea is a single depth-write map-fill mesh
   (Slice 10).
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

`/renderer/water-bakeoff?tech=…&preset=dusk|golden&t=…` from **Slice 1** — both techniques
A/B against the reference at dusk *and* neutral albedo proven at golden hour, with live
`gpuTimeMs`, in one route. The first **in-product** checkpoint is **battle open-sea after
Slice 8** (`/renderer/battle-terrain-3d?gate=coastal-scrub&view=west`), where the sealed
ocean edge of a real beach battle becomes a foam-and-glint sea that matches the reference
while still reading warm under golden hour.
