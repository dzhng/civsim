# Slice 05 full battle sweep

## Commands

The final-tree sweep selected every scene whose name contains `battle`, including
full-tier scenes, with deterministic SwiftShader verification and no shot updates:

```sh
env -u UPDATE_SHOTS \
  VERIFY_URL=http://127.0.0.1:5193 \
  VERIFY_GPU=1 \
  SCENARIO_REPORT_GENERATED_AT=2026-07-16T00:00:00.000Z \
  SCENARIO_REPORT_JSON=../specs/battle-ground-turf/reports/scenario-runs/turf-final-full.json \
  node scene.mjs battle
```

That run selected 39 scenes and completed 463 checks: 459 passed, four failed,
and there were zero page errors. The immutable runner report is
`scenario-runs/turf-final-full.json`.

After classifying and reconciling the three branch-caused failures, the exact
affected contracts were rerun together without shot updates:

```sh
env -u UPDATE_SHOTS \
  VERIFY_URL=http://127.0.0.1:5193 \
  VERIFY_GPU=1 \
  SCENARIO_REPORT_GENERATED_AT=2026-07-16T00:00:00.000Z \
  SCENARIO_REPORT_JSON=../specs/battle-ground-turf/reports/scenario-runs/turf-final-focused-reconciled.json \
  node scene.mjs battle-map-style battle-photoreal-lighting
```

The focused run selected three scenes (`battle-map-style-grass-close`,
`battle-map-style`, and `battle-photoreal-lighting`) and passed all 45 checks
with zero page errors. Its report is
`scenario-runs/turf-final-focused-reconciled.json`.

## Failure reconciliation

| Initial final-tree failure | Classification | Reconciliation |
|---|---|---|
| `battle-map-style: production mid-zoom grass keeps the close-gate structure family with looser battle-camera floors` | Branch-caused stale assertion. A clean `8c34d402` baseline run passed with raw edge `0.445`; the final turf branch measured `0.276` after deliberately removing synthetic substrate grain. The production-mid snapshot remained at zero changed pixels. | Raw full-resolution edge energy is now diagnostic because it combines blade edges with substrate detail. Retention, contrast, occupancy, vertical runs, sampling profile, blade width, tier segments, and transition softness remain asserted. Focused rerun passed. |
| `battle-photoreal-lighting: snapshot photoreal-lighting/golden-hour-crowd-mid` (`5,731` pixels / `2.7983%`) | Intended downstream visual movement from the real-blade/clean-substrate turf result. | Candidate and diff were inspected, the exact golden-hour snapshot was reblessed, and the focused no-update rerun reported zero changed pixels. |
| `battle-photoreal-lighting: snapshot photoreal-lighting/noon-crowd-mid` (`7,237` pixels / `3.5337%`) | Intended downstream visual movement from the same turf result. | Candidate and diff were inspected, the exact noon snapshot was reblessed, and the focused no-update rerun reported zero changed pixels. |
| `battle-smoke: snapshot battle-initial` (`2,376` pixels / `0.2320%`) | Carried red: the same check was already red in the pre-change ledger (`858` pixels). | An isolated no-update rerun reproduced exactly `2,376` changed pixels. No turf snapshot was blessed for this timing-sensitive smoke frame. |

The baseline classification used a clean detached worktree at `8c34d402`, its
own Vite server, SwiftShader, and `UPDATE_SHOTS` unset. It passed every selected
map-style check; the only contract movement was therefore caused by the turf
branch rather than an unrecorded pre-existing red.

## Seven-item carried-red ledger

| Pre-change ledger item | Final battle-name sweep |
|---|---|
| `battle-overlays / overlays/rings-close` | Passed (`19,333` pixels / `1.8880%`). |
| `battle-renderer-effects / battle-projectiles-dpr2` | Passed (`58,629` pixels / `1.4314%`). |
| `battle-smoke / battle-initial` | Still red and isolated as carried (`2,376` pixels / `0.2320%`). |
| `battle-smoke / battle-manual` | Passed (`201` pixels / `0.0196%`). |
| `water-sea / water/campaign-sea-far` | Not selected: the scene name does not contain `battle`. |
| `full-game-rendering-performance` SwiftShader hardware assertion | Not selected by the battle-name sweep. The selected `battle-perf-30k` correctness load passed all seven checks and correctly skipped millisecond gating on SwiftShader. |
| `menu-renderer-shell` intermittent unsupported-route exception | Not selected: the scene name does not contain `battle`. |

## Snapshot inventory against `origin/main`

No snapshots were deleted.

Added battle turf snapshots:

- `ground-turf/dirt-edge.png`
- `ground-turf/edge-ruler.png`
- `ground-turf/full-close.png`
- `ground-turf/full-rts.png`
- `ground-turf/full-topdown.png`
- `ground-turf/ground-only-close.png`
- `ground-turf/ground-only-rts.png`
- `ground-turf/ground-only-topdown.png`
- `ground-turf/road-edge.png`
- `ground-turf/road-scree-rts.png`

Modified battle snapshots:

- `battle-genmap-smoke.png`
- `photoreal-lighting/golden-hour-crowd-mid.png`
- `photoreal-lighting/noon-crowd-mid.png`
- `photoreal-shadows/dusk-shadow-scenery.png`
- `photoreal-shadows/golden-hour-shadow-scenery.png`
- `photoreal-shadows/noon-shadow-scenery.png`
- `photoreal-shadows/overcast-foggy-shadow-scenery.png`

The scene `battle-genmap-browser` unconditionally rewrites its durable seed
browser artifact even when `UPDATE_SHOTS` is absent. That generated PNG was
restored immediately after the sweep and is byte-identical to `HEAD`; it is not
part of this inventory.

## Campaign and simulation isolation

```sh
git diff --quiet origin/main -- crates web/src/campaign web/shots/campaign
```

The command exited zero. Simulation/campaign Rust source, campaign frontend
source, and every campaign snapshot are byte-identical to `origin/main`.
