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

## Feedback that would change it

Corridor width or flank-band depth feeling wrong in play — both are recipe
parameters backed by certificates, so retuning is cheap.
