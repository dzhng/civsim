# Slice 05 consolidated change ledger

The authoritative final frames are the current files under `web/shots/battle`.
The six `assets/slice03-narrowed-gate` copies are dated slice-03 provenance; four
of them differ from the final baselines by 43–151 pixels after slice 04 and are
not claimed to be byte-identical.

| Test or baseline | Previous behavior | Final behavior | Why |
|---|---|---|---|
| `battle-genmap-smoke.png` | High-contrast open-ground mottle | Restrained meadow macro/canopy under the same battle | Slice 02 contrast correction **[moved]** |
| `dusk-shadow-scenery.png` | Blotchy grove substrate | Calmer meadow beneath unchanged dusk lighting | Slice 02 contrast correction **[moved]** |
| `golden-hour-shadow-scenery.png` | Blotchy grove substrate | Calmer meadow beneath unchanged golden lighting | Slice 02 contrast correction **[moved]** |
| `noon-shadow-scenery.png` | Blotchy grove substrate | Calmer meadow beneath unchanged noon lighting | Slice 02 contrast correction **[moved]** |
| `overcast-foggy-shadow-scenery.png` | Blotchy grove substrate | Calmer meadow beneath unchanged overcast lighting | Slice 02 contrast correction **[moved]** |
| `ground-turf/full-close.png` | No production ownership baseline | Real blades over shared macro/canopy | Slice 03 near-field contract **[added]** |
| `ground-turf/full-rts.png` | No production ownership baseline | Full tactical-pitch turf and formations | Slice 03 RTS contract **[added]** |
| `ground-turf/full-topdown.png` | No production ownership baseline | Full overhead turf and formations | Slice 03 top-down contract **[added]** |
| `ground-turf/ground-only-close.png` | No blade-off production control | Substrate control with blades held off on every draw | Slice 03 ownership proof **[added]** |
| `ground-turf/ground-only-rts.png` | No blade-off production control | RTS substrate control | Slice 03 ownership proof **[added]** |
| `ground-turf/ground-only-topdown.png` | No blade-off production control | Top-down substrate control | Slice 03 ownership proof **[added]** |
| `ground-turf/dirt-edge.png` | No mud-feather baseline | Irregular narrow turf↔mud edge with interior churn | Slice 04 earth ownership **[added]** |
| `ground-turf/road-edge.png` | No road-feather baseline | Narrow grass spill over a classified road edge | Slice 04 earth ownership **[added]** |
| `ground-turf/road-scree-rts.png` | Road and scree lacked a joint control | Road feathers while adjacent scree remains hard | Slice 04 category proof **[added]** |
| `ground-turf/edge-ruler.png` | No visual width telemetry | Metre ruler pins bounded feather width and zero islands | Slice 04 width proof **[added]** |
| `photoreal-lighting/golden-hour-crowd-mid.png` | Stale high-frequency substrate remained under the lighting fixture | Final calm turf under unchanged golden-hour lighting | Full-sweep reconciliation of the slice 02 contrast move **[moved]** |
| `photoreal-lighting/noon-crowd-mid.png` | Stale high-frequency substrate remained under the lighting fixture | Final calm turf under unchanged noon lighting | Full-sweep reconciliation of the slice 02 contrast move **[moved]** |
| `battle-map-style` production-mid structure oracle | Full-resolution edge energy gated “grass” even though it combined blades and substrate noise | Edge energy remains reported diagnostically; retention, contrast, occupancy, vertical runs, and production blade-profile stats own the pass | Synthetic substrate detail was deliberately removed, so the old edge floor confounded the mechanism it claimed to measure **[moved]** |
| `battle-ground-turf` production substrate ownership check | Required an undeclared `fineMode` property to remain `undefined` and separately checked a hardcoded owner list | Removed; source ownership checks and rendered snapshots cover the actual ground, vista, and terrain-quad paths | Both assertions restated implementation declarations instead of observing rendered behavior **[moved]** |
| `meadow palette reproduces every pre-refactor color` | Duplicated every production palette literal in the test and froze the refactor's old values. | Replaced by normalized finite-color and shared-base derivation invariants; rendered scenes own the player-visible palette result. | A second literal table drifted with production and taxed harmless palette refactors without proving a visible outcome. **[moved]** |
| `keeps churn on mud interiors while the visual feather stays narrow` | Its name implied production-material coverage, though it exercised only pure CPU mirror functions. | Renamed to state its actual scope: pure churn and edge-coverage math; browser edge shots remain the production wiring proof. | Test names should not overstate the mechanism they observe. **[moved]** |

Intermediate baked-spike shots, term-off attribution baselines, and the sampler
performance shot were created only as diagnostic evidence and then removed when
their implementations failed the binding visual gate. Their behavior changes are
enumerated in `slice02-change-ledger.md` and `slice03-change-ledger.md`; none is a
final production baseline. No battle snapshot was deleted from the inherited
suite, and no campaign snapshot or sim/balance expectation moved.
