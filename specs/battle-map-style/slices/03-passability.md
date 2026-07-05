# 03 — Passability derived from the landform

Passability becomes gameplay truth by construction: one surface, one
derivation, machine-checkable certificates.

## Contract unlocked

`genmap/passability.rs` — the Rust re-expression of the salvaged algorithms —
turns the slice-02 heightfield into `speed`/`rough`/`tint`.

## API seam

- Central-difference slope field → cliff mask (slope-threshold seeds + radius
  dilation to close speckle gaps) → **edge-connected highland cap**: BFS from
  the map borders over a height threshold marks whole edge-connected plateaus
  impassible, so flat mountain *tops* are blocked without painted masks →
  speed synthesis (cliff/water 0, scree/slow band, else 1) and tint (rock,
  scree apron, grass).
- All thresholds live in one `SlopeBands` parameter struct on the recipe.
- Everything computes on the canonical true-meter surface (slice 02's rule).

## Human can run

`battle-genmap-passability.mjs`: cells colored **directly from the sim's
`terrain_speed_ptr` data** over the clay render — green passable, amber slow,
near-black blocked, blue water. The visual mask cannot drift from the sim mask
because it *is* the sim mask.

## Verification

- Cargo certificates over a ≥32-seed sweep (`genmap/certify.rs`):
  - N–S corridor: BFS over `speed > 0` connects the south deployment band to
    the north at ≥ 700 m min-width (army frontage, twice over per the maps.rs
    contract).
  - W/E flank bands (outer ~90 m) unreachable from the corridor.
  - No orphan walls: every speed-0 land cell is justified by slope, dilation,
    or the highland cap.
  - No isolated passable pocket above a size threshold.
- Determinism goldens re-pinned deliberately.
- Judged surface: the passability-mask scene (screenshot-critique on whether
  the mask reads where the eye expects blockage). Out of scope: everything
  aesthetic.

## Stays green

Slice-02 clay verdict (this slice must not reshape the landform to make
passability work — if it needs to, reslice), hand maps, elevation tripwire.

## Landed (2026-07-05)

- `genmap/passability.rs`: slope field -> cliff seeds (>=0.32) + 6-cell
  dilation -> edge-connected highland cap (>=35 m) -> speed/tint/rough.
  SlopeBands justified by measured stats (corridor slope p95 0.062 vs flank
  min p50 0.156). Crag-circle seals DELETED on generated maps - the ridge
  landform itself seals the flanks; 32-seed certificate sweep green; seed-7
  golden re-pinned (0x8ceb1a8a243ea756); hand maps untouched.
- Passability-mask scene green with honest windows (passable 0.62, slow
  0.06, blocked 0.32); the mask shows black flank walls, ragged amber scree,
  wide green corridor, open N/S - the reference topology's gameplay skeleton.
- Slice-02 debts closed: apron falloff is a wide smootherstep (dish imprint
  gone from hillshade); real-pipeline clay landed as `?clay=1` on the
  photoreal battle route. Orchestrator fixes during review: clay also strips
  `scene.fogNode` (haze must not hide silhouettes - predecessor rule) and
  uses flatShading (the ground mesh carries no vertex normals); the clay
  scene shoots under `golden` sun (overcast shades nothing).
- Horizon at the locked vista camera measured 0.169 (pinned) - the 0.50
  centered target needs the slice-14 vista-apron silhouettes; at eye level
  the corridor truthfully reads flat (+/-6 m over 2 km) with the flank
  ranges as corner silhouettes. Family verdict deferred to 13/14 evidence.

## Feedback that would change it

Corridor width or flank-band depth feeling wrong in play — both are recipe
parameters backed by certificates, so retuning is cheap.

## Landed 2026-07-05 (code/cargo; browser blessing pending)

- `genmap/passability.rs` derives speed/rough/tint from the slice-02
  true-meter landform: central-difference slope field, cliff seeds, radius
  dilation, edge-connected highland cap, scree slow band, and a final
  deployment-reachable flood that seals isolated passable islands as rock.
- `SlopeBands` defaults on `MapRecipe`: `flatMax=0.035`,
  `rollingMax=0.115`, `slowMin=0.135`, `cliffMin=0.320`,
  `cliffDilateCells=6`, `highlandCapMinM=35.0`.
  Measured 32-seed slope stats: corridor max p95 `0.062`, corridor max
  `0.135`; flank min p50 `0.156`, min p95 `0.548`, min max `1.288`.
- Generated-map slice-01 crag-circle seals were removed. E/W flanks are now
  sealed by the ridge landform itself: cliff slope seeds plus the edge-connected
  highland cap.
- Cargo certificates now sweep seeds `1..=32`: S-N deployment corridor,
  E/W side seals, N/S open edges, deployment bands >=95% passable,
  E/W flank bands unreachable, no speed-0 cells without rock/water tint, and no
  isolated passable pockets over `96` cells. Seed-7 mask ratios:
  passable `0.619`, slow `0.057`, blocked `0.324`, water `0.000`.
- Seed-7 generated terrain hash re-pinned to `0x8ceb1a8a243ea756`; hand-map
  hashes stayed pinned. Superseded by BMS17B-A6E9: current seed-7 generated
  terrain hash is `0x5b0bcb8dd7e7f22f`.
- Slice-02 debts closed here: apron falloff changed to a wider smootherstep;
  `?clay=1` on the photoreal battle route provides real-pipeline neutral-clay
  generated-map review at the locked vista camera.
- New scene: `battle-genmap-passability.mjs`, drawing top-down cells directly
  from wasm `terrain_speed_ptr` / `terrain_tint_ptr`. Reworked scene:
  `battle-genmap-clay.mjs`, now a real photoreal route capture.
- Orchestrator TODO: rebuild wasm in an unsandboxed environment if
  `wasm-pack` needs to install `wasm-bindgen`; run and bless
  `battle-genmap-passability`, `battle-genmap-clay`, and the existing generated
  smoke/elevation gates; record the clay horizon measured pin/target verdict.
