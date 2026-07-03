# Campaign Map Probe Tools

`render-probe.mjs` is the deterministic red-baseline probe for
`specs/campaign-map-bugs` slice 00. It is a standalone Playwright tool, not a
`web/scenes/` scene, because the baseline is intentionally red and must not join
the default screenshot gates.

Run it against a Vite server for this worktree:

```sh
VERIFY_URL=http://localhost:5173 VERIFY_GPU=1 \
  node specs/campaign-map-bugs/tools/render-probe.mjs --out /tmp/campaign-map-probe.json
```

`VERIFY_URL` defaults to `http://localhost:5173`. The script uses the same GPU
flags as `web/scene.mjs`, freezes the campaign renderer, fixes the viewport to
`1600x1000`, and measures two canonical framings: whole-map political and
regional Italy.

What it measures:

- City marker footprints: every on-screen city is projected through
  `window.__campaign.project`; the marker radius comes from renderer stats, and
  a disc of samples goes back through `screenToWorld` and `renderLandAt` to a
  per-city `landFraction`. This is the area-average the player's downsampled
  view approximates: a sub-pixel island blends into sea, so "marker floats on
  open water" = low `landFraction`, while an ordinary port keeps a solid land
  share. Cities with `landFraction == 1` and a land center are omitted.
- Sea labels: the actual post-layout, post-collision sea-label rects exported
  by the renderer are sampled through `renderLandAt`.
- City labels: the drawn city icon+name rects exported by the renderer
  (`visibleCityLabelRects`), deflated to the ink band (the exported `padPx`
  halo margin is transparent), sampled through `renderLandAt` per framing.
- City cards: visible DOM city card rect corners plus center are converted
  through `screenToWorld` and sampled with `renderLandAt`.
- Scenery: the renderer's full static candidate set
  (`window.__campaign.sceneryCandidates()`) is classified through
  `renderLandAt` twice per instance — center (margin 0) and footprint
  (margin `size/2`, matching the builder's land gate) — with per-kind counts.
  Measured once (world-space data, framing-independent); violations carry
  whole-map screen coordinates.

Reconciliation vs the vision audit (slice 00): the audit's "12 offshore
cities" mixes two defect classes. Square-marker-on-open-water is what
`landFraction` captures (Cnidus 0.20, Tainaron Pr. 0.21, Rhodos 0.23 … at the
whole-map framing). The `b1-tarraco`/`b1-corinthus` evidence crops actually
show the *house-icon + label* anchored far out at sea while the square marker
hugs the coast — that is the B2 anchor defect slice 04 owns; its gate extends
this probe to city icon+label rects. Sea-label and card measurements reproduce
the audit exactly (Adriatic 1.00 / Black Sea 0.96 land; Ostia, Minturnae,
Cosa, Tarracina, Capua, Roma card overhangs).

Green meanings by slice:

- Slice 01: no city marker with `landFraction < 0.5` (majority-water marker)
  at either framing, except named port exemptions; every city center stays
  land with the re-baked margin.
- Slice 03: sea labels are at least `0.95` water, so `landFraction <= 0.05`.
- Slice 04: every visible city icon+label ink rect is mostly-land
  (`landFraction >= 0.95`) at both framings, and the visible-label counts stay
  at the pre-placement baseline (whole-map 10, regional 21 — no collision
  bloodbath). One named exemption: CORINTHUS at the whole-map framing holds
  `>= 0.80` — its label box spans ~270 km at that zoom and a measured offset
  sweep found no `>= 0.95` placement within 100 px of the isthmus marker
  (first fully-clean spot is ~285 km away, which would be the worse
  label-detached class).
- Slice 06: `scenery.onWaterTotal` and `scenery.footprintOverWaterTotal` are
  both 0, and `scenery.total` stays within 10% of the pre-gate baseline
  10,791 (no mass extinction).
- Slice 07: visible city cards are mostly land; card overhangs should be named
  and driven down before slice close-out.
