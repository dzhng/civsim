# Battle atmosphere — one environment the whole battlefield recedes into

Today the battle renderer has **four surfaces, three suns, and no sky**: the rolling
ground, the distant cliff/wall/mountain blockers, the open-sea plane, and the on-field
water each carry their own hardcoded haze and light, and "sky" is a flat clear colour
(dark green in the live game, pale blue in the lab). Far terrain stays fully saturated
while the sea beside it recedes; the far sea dissolves toward a warm-grey the sky never
matches. This feature gives the battle **one shared environment** — a swappable preset
(sky, aerial-haze colour, sun, exposure) that every surface reads — plus a real
sky/horizon backdrop and a single distance-keyed aerial-perspective helper, so the whole
field recedes into one horizon and the sea melts into the sky. It closes the
[water spec's](../done/water/README.md) caveat and delivers the aesthetics creed's
rule 1 (aerial perspective) and "lighting is an environment, not a material" on the
battlefield.

---

## Next Agent Prompt

> **Status:** Plan drafted 2026-07-01 (three independent drafts synthesized). **Nothing
> built yet.** Start at **Slice 1**.
>
> **You are picking up at Slice 1 — the environment seam** (`slices/01-environment-seam.md`):
> the invisible, zero-pixel refactor that threads a `BattleEnvironment` (golden = today's
> exact values) through ground, blockers, and the battle water, so every later slice has
> one thing to read. Its whole point is that **no snapshot moves** — a moved pixel means
> the golden preset numbers don't match the current inline constants. Do that first; it
> de-risks the firewall for everything after.
>
> **Before you start:** invoke the `aesthetics` skill (the visual north star — the
> `references/` are the standard; the feature-owned copies are in
> [`assets/`](assets/)) and the `renderer` skill (GPU/WGSL/pass-graph workflow). Read the
> closed [water spec](../done/water/README.md) — its `civsimWaterColor` material and the
> **six frozen `water-*.mjs` lab scenes** are the load-bearing firewall this feature must
> never disturb.
>
> **Load-bearing facts from recon (do not relearn the hard way):**
> - **Keep `WATER_ENVIRONMENTS` (`environment/environment.ts`) frozen.** The six lab scenes
>   `web/scenes/system/water-*.mjs` render the open-sea plane through the `water-bakeoff`
>   route (`WaterPlanePass` **lab path**, `shoreX == null`) reading `WATER_ENVIRONMENTS`
>   directly, and `water-albedo` sweeps **all three** presets (golden/dusk/overcast) — so
>   editing ANY field breaks them. Current battle weather is an alias over the shared
>   `CIVSIM_ENVIRONMENTS` owner, so battle-facing names and water-facing names must stay
>   adapters over one preset family.
> - **Do not edit `waterShade`/`civsimWaterColor` (`water/waterMaterialWgsl.ts`).** The
>   sea→sky match is done by **identity**: set the battle water env's `hazeColor` equal to
>   the sky horizon colour, so its existing `mix(surface, WATER_HAZE, haze01)` dissolves
>   into the right colour with zero shader surgery.
> - **There is no sky.** "Sky" is the frame `clear` — live `{0.16,0.24,0.15}`
>   (`web/src/battle/renderer.ts:296`), lab `{0.74,0.83,0.90}` (`routeBattleTerrain3d`).
>   The only background primitive is the builtin grass `terrainBackdropRect` quad
>   (`frameShell.ts`, `TERRAIN_BACKDROP_WGSL`) filling the lower screen. A sky is a
>   **gradient behind everything** — recommended as a generic `skyGradient` on the
>   background underpaint (see Slice 2's known unknown for the ordering call).
> - **groundPass has no distance haze** and lights from a hardcoded sun
>   `(-0.38,-0.30,0.87)`; **horizonPass** uses a *different* hardcoded sun `(-0.40,-0.28,0.87)`
>   and two hardcoded greys (`HAZE=[0.80,0.81,0.83]` + a fragment `[0.74,0.79,0.84]@0.10`);
>   the battle **water** glint uses `sunDirection()` = the cam uniform's `DEFAULT_SUN`
>   (`setSun` is never called outside the lab). Three near-identical suns — the env unifies
>   them, but only where the slice's variable calls for it (see the sun decision below).
> - **The camera uniform is the runtime plumbing:** `cam.sunAz/sunEl/time`, `sunDirection()`,
>   `shell.setSun`/`setTime` (`renderer-core/src/cameraWgsl.ts`, `frameShell.ts`). Preset
>   colour swaps rebuild pipelines (already the pattern for `waterEnvironmentWgsl`); the sun
>   is a free runtime uniform.
> - **Baselines are headless installed Chrome on hardware/Metal** now:
>   `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node web/scene.mjs <scene>`,
>   re-bless with `UPDATE_SHOTS=1` (see `web/shots/README.md`). Snap animated water at a
>   fixed `?t=`.
>
> **The sun decision (a real divergence — recorded so you don't re-litigate):** the env
> carries one sun. It drives the **sky** and the **water glint** (already cam-driven). For
> **golden**, land and blockers KEEP their current hardcoded suns (byte-identical), so the
> golden slices move only their one variable. Land/blocker are relit *from the env sun +
> key/fill/exposure* only in **Slice 6**, because that is what the **overcast** mood needs
> (flat cool high-key light over the same albedos) — and that relocation is authored
> value-preserving for golden. The rejected alternative (unify all three suns in Slice 1
> and take a grouped golden re-bless up front, per draft C) is cleaner in theory but spends
> a re-bless on a non-feature variable and muddies the invisible seam; revisit only if the
> staged relight proves awkward.
>
> **Standing verification gate (every visual slice):** the last check before accepting any
> shot is the [`screenshot-critique`](../../.claude/skills/screenshot-critique) skill (an
> unprimed second opinion). Where a slice has a target — a prior look it changes or a
> reference in [`assets/`](assets/) — it also runs
> [`compare-screenshots`](../../.claude/skills/compare-screenshots) to judge
> candidate-against-target (telemetry + a less-wrong verdict), on the **named crop only**,
> not a match-the-whole-frame check.
>
> **Global TODO (each item → owning slice):**
> - [ ] S1 — Environment seam: `BattleEnvironment` + adapter threaded through, golden =
>   today, **zero pixels move** → `slices/01-environment-seam.md`
> - [ ] S2 — Sky/horizon gradient backdrop (golden) → `slices/02-sky-backdrop.md`
> - [ ] S3 — Sea dissolves into the sky (golden; fixes the water-spec caveat) →
>   `slices/03-sea-dissolve.md`
> - [ ] S4 — Land aerial perspective (golden) → `slices/04-land-aerial.md`
> - [ ] S5 — Blocker unification (golden) → `slices/05-blocker-unification.md`
> - [ ] S6 — Environment relight + **overcast** preset → `slices/06-overcast-preset.md`
> - [ ] S7 — Live-battle wiring + fold cleanup + `close-spec` → `slices/07-live-integration.md`
>
> **Before you end your pass:** update this section — move the status/date, tick the TODOs
> you closed, note the next pickup point, and record any recon fact or decision that would
> save the next agent a wrong turn.

---

## Locked product decisions (from the interview — do not relitigate)

1. **A full battle environment preset**, not a one-off haze constant: each preset carries
   sky (zenith + horizon), aerial-haze colour, sun az/el, and exposure. Two presets ship:
   **golden** (sun-drenched Aegean, subtle far haze) and **overcast** (cool, flat high-key,
   HEAVY fog swallowing layered ranges). Every battle surface reads it, and the battle
   water reads its haze/sun/exposure from it (via the adapter).
2. **A real sky/horizon gradient backdrop** — the far terrain and sea fade INTO it.
3. **Aerial perspective on land too**, not just sea — one distance-keyed helper applied to
   ground, sea, and blockers so the whole field recedes into one horizon.

## The seam that makes this safe

```ts
// packages/game-renderer/src/environment/environment.ts
export interface BattleEnvironment {
  id: 'golden' | 'overcast';
  skyZenith:  [number, number, number];   // top of the sky gradient
  skyHorizon: [number, number, number];   // where sky meets the far terrain/sea
  hazeColor:  [number, number, number];   // aerial-perspective target (= skyHorizon)
  sunAzimuth: number; sunElevation: number;
  exposure:   number;
  keyColor:   [number, number, number];   // warm/cool key for the land grade (Slice 6)
  fillColor:  [number, number, number];   // sky fill for the land grade (Slice 6)
  aerialNear: number; aerialFar: number;  // camera-distance haze ramp (metres)
}
export const BATTLE_ENVIRONMENTS: Record<BattleEnvironment['id'], BattleEnvironment>;
export function battleEnvironmentWgsl(env): string;          // injects BATTLE_SKY_*/HAZE/SUN_*/EXPOSURE/FOG_*
export const WATER_ENVIRONMENTS: Record<WaterEnvironment['id'], WaterEnvironment>; // alias over CIVSIM_ENVIRONMENTS
```

The battle and water names are aliases over `CIVSIM_ENVIRONMENTS`, reusing
`waterEnvironmentWgsl` verbatim, so the pipelines get `WATER_KEY/FILL/HAZE/EXPOSURE`
from one shared source with zero edits to the shared water shader.

The **one aerial helper** `battle/aerialPerspectiveWgsl.ts` emits
`fn battleAerial(col, worldXY) -> vec3f`, keyed on camera-space distance and mixing toward
the injected `BATTLE_HAZE`. Land and blockers call it; the sea reuses its own `haze01`
ramp pointed at the same horizon colour (by identity) — no second haze authority.

## Slice graph

```
S1 environment seam (invisible, byte-identical)
      │  BattleEnvironment.golden reproduces today; adapter feeds battle water
      ▼
S2 sky gradient ──▶ S3 sea dissolve (needs the sky horizon colour as its target)
      │
      ├──▶ S4 land aerial  ┐  (S4, S5 independent once battleAerial exists;
      └──▶ S5 blocker haze  ┘   land in order so each re-bless is one variable)
                 S3,S4,S5 ──▶ S6 relight + overcast (data + the value-preserving
                                 golden relocation overcast needs)
                                        │
                                        ▼
                                 S7 live wiring + fold + close-spec
```

Why this order: the look is judged **one variable per slice** on the `battle-terrain-3d`
lab route (sky, then sea seam, then far-land, then blocker ridge) in golden, each with its
own crop and reference; only Slice 6's overcast and Slice 7's live frame use whole-frame
comparison, after the variables have their own evidence.

## Review map (what the human looks at, per slice)

| Slice | Playable artifact | Compare target (crop) | Reference |
|---|---|---|---|
| S1 | `battle-terrain-3d?env=golden` (unchanged) | — (byte-identical gate) | — |
| S2 | `battle-terrain-3d?env=golden&view=field` | sky band (top third) | `battle-coastal-vista.jpg` |
| S3 | `battle-terrain-3d?gate=coastal-scrub&view=field` + `water-open-sea` | horizon band (sea→sky) | `battle-advance-coast.jpg` |
| S4 | `battle-terrain-3d?env=golden&view=field` wide | far-ground band (upper-mid) | `battle-coastal-vista.jpg` |
| S5 | `battle-terrain-3d?view=west\|east` + `battle-terrain-blockers` | far ridge/rampart band | `battle-coastal-vista.jpg` |
| S6 | `battle-terrain-3d?env=overcast` (all maps) | full frame + layered-range band | `battle-overcast-highland.png` |
| S7 | the live game (`battle-renderer-visual`) both presets | full frame | both references |

**Standing gate (every visual slice, S2–S7):** `screenshot-critique` is the last check;
`compare-screenshots` judges the named crop against the reference above.

## Firewalls / scope guards

1. **The six `web/scenes/system/water-*.mjs` stay intentional.** Never fork
   `CIVSIM_ENVIRONMENTS`, `WATER_ENVIRONMENTS`, `water/waterMaterialWgsl.ts`, or the
   `WaterPlanePass` **lab path** (`shoreX == null`). Battle atmosphere reaches water
   through shared environment aliases, not private constants. This is checked every slice.
2. **Seating is untouched.** The aerial helper is a `groundPass` **fragment** step; the
   mesh z stays the gameplay heightfield. `battle-terrain-elevation` (soldiers seat,
   `match=true`) stays byte-identical.
3. **Campaign is out of scope** — it has its own antique-chart sea (the closed water
   spec's S10). `battleEnvironment.ts` must not leak into `renderer-core` or `campaign/`
   (the one exception is a *generic* `skyGradient` on the background underpaint, which
   carries caller-supplied colours only, no battle knowledge).
4. **Soldier/model materials are out of scope** (skinned crowd, model sheets untouched).
5. **Determinism / MSAA.** Every battle atmosphere snap passes a fixed `?t=`; any new
   pipeline calls `gpuMultisample(shell.sampleCount)`.

## Known unknowns Slice 1 (and 2) must resolve

1. **Byte-identical threading.** Do golden's `BattleEnvironment` numbers, fed through
   `battleWaterEnvironment` + `battleEnvironmentWgsl`, reproduce the current inline
   constants exactly (land has no haze → trivially matches; the golden water preset; the
   blocker greys are Slice 5's variable, kept as-is in S1)? A moved pixel is the signal to
   fix the numbers before building on it.
2. **Snapshot census.** Enumerate which existing battle shots are *behavioral*
   (byte-identical forever) vs *look* (re-bless when their variable lands) before editing.
3. **Sky mechanism + ordering (Slice 2).** Is a screen-space vertical gradient enough at
   the near-fixed tilted-ortho battle camera, or must the horizon Y be a projected far
   world point? And does the gradient compose behind the builtin `terrainBackdropRect`
   grass quad — recommended as a generic `skyGradient` on the background underpaint
   (drawn before the backdrop); the `BattleSkyPass` (a game-renderer background pass drawn
   first in the `background` phase) is the fallback if the underpaint seam is awkward. The
   *dissolve* is carried by the aerial haze (`skyHorizon == hazeColor`), so pixel-perfect
   gradient placement is not required.

## First useful playable checkpoint

**Slice 2** (or 1+2 together): `battle-terrain-3d?gate=coastal-scrub&view=field&env=golden`
shows a real pale gold-to-blue Aegean sky over the field for the first time — the smallest
change that visibly answers "give it a sky and a horizon," and the first place a human
taste call pays off (compare the sky band against `battle-coastal-vista.jpg`).
