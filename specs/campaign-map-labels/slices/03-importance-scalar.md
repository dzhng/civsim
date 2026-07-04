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

**Feedback that would change this:** the normalization curve (how steeply
faction power beats city tier) is expected to be tuned against the Slice 04
overview.
