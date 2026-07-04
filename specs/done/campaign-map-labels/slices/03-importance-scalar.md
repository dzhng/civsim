# Slice 03 — Importance scalar on every arbitrating label (no visual change)

**Contract:** every label that enters arbitration carries a single scalar
`importance ∈ ℝ` on one scale comparable across cities and factions/leagues.
Placement is byte-identical to today — the score is computed and emitted in
telemetry only. This is pure plumbing; the render must not move.

**API seam / owner:**
- `packages/game-renderer/src/campaign/mapPass.ts` — add `importance?: number`
  to `CampaignLabel`; thread it through `visibleLabels` → the measured label →
  debug telemetry.
- Assembled at the emitters in `web/src/campaign/renderer.ts`:
  - **city** → `f(node.tier)` (the one baked input).
  - **faction / league** → `g(factionRadiusKm, armyStrength)` where
    `factionRadiusKm` already flows from `territory.ts` (`sqrt(cells)·cell`,
    runtime territory size) and army strength is summed per faction from
    campaign army data (new term).
  - **army** → `f(army.soldiers)`.
  Normalize cities and factions onto one comparable scale — **the calibration
  constants are the reviewable knob** (a top realm vs a tier-3 city).

**Fog resolved:** faction power is *runtime*, not baked (territory + armies
shift every turn; baking would freeze conquest). City tier is the only baked
importance input. So importance is assembled per frame at the emitter that
already holds the map, the armies, and `Territory` — never written to JSON.

**Deliverable:** a telemetry table (extend `__campaignGpuStats`) listing every
visible label with `{text, kind, importance, survives}` — inspectable, zero
visual change.

**Gates:** all campaign scene snaps **byte-identical** to pre-slice (pure
addition); `render-probe.mjs` cull list unchanged; a unit/telemetry test pins
the ranking (Rome > a small league > a tier-1 town).

**Human checkpoint (non-blocking):** approve the importance formula and the
city-vs-faction normalization before Slice 04 consumes it. This is *the* balance
decision — open the telemetry table with preview-shots.

**Calibration finding (SHIPPED plumbing, formula deferred to Slice 04):** the
first-cut faction formula used `label.radiusKm` directly, but that value is
**capped at 1.5× Rome (292)** for the territory wash — so the 6 majors and ~9
big leagues all tie at 292 and **Rome ranks last (195)**, below tier-3 cities.
Consuming that as-is would cull Rome. The scalar + telemetry threading are
correct and inert (zero visual change), so they ship; the **formula** is
resolved in Slice 04, where it drives placement and can be validated on the
overview. The fix: faction power = **uncapped** territory size (`sqrt(cells)·cell`
before the wash cap, exposed as a new `powerKm` on the faction label) **plus a
per-faction army-strength term** (the `armyStrength` half of `g(...)` deferred
here) — army strength is what keeps a strong-but-territorially-small major like
Rome ranked above a minor neutral league. City-tier km-equivalents get
re-checked against that corrected faction scale.

**Feedback that would change this:** the normalization curve (how steeply
faction power beats city tier) is tuned against the Slice 04 overview.
