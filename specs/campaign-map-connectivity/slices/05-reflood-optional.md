# S5 — (Optional) Ownership re-flood for reconnected power-claimed cities

A decision slice, **default NO**. Do not build without an explicit call from David.

## The question
`overrides.json` lists some now-reconnected cities under a power's `cities` (e.g.
`Panormus` under Carthage), implying that power "should" own them. But ownership
floods over roads at `build::build` time — *before* descope/reconnect exist — so
Sicilian cities are road-degree-0 there and fall to `independents` → neutral
`league_*`. Reconnecting *after* the flood leaves them neutral (conquerable,
muted, no visual change — matches "keep the muted neutral look").

## Default (recommended): NO re-flood
Reconnect-after-flood. Reconnected mainland cities and all islands stay neutral
holdings. Zero political-map change. This is what S3 ships.

## If David says YES
Absorbing power-claimed reconnected cities into the flood requires reconnection to
run **before** `build`'s ownership flood — a pipeline reorder (compute reconnect
roads on the carved raster pre-build, feed them into the flood). This:
- makes `M` partly circular (the flood would depend on kept lanes as routes
  pre-build) — needs its own recon before committing;
- re-blesses the political-map baselines (Sicily et al. change color);
- risks a distant exclave (Carthage owning Sicily across the Rhegium↔Messana lane)
  — the exact thing the current flood deliberately avoids by not forcing distant
  `cities` seeds.

## Verification (only if built)
`cargo test -p mapgen` green; re-blessed political baselines reviewed; find-map-bugs
confirms no disconnected owned exclave reads as a bug.

## Firewalls inherited
Bake determinism; battle untouched; never hand-edit artifacts. If not built, this
file records *why* reconnected cities are neutral — not an oversight, a decision.
