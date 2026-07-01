# Slice 16 — Campaign photoreal (register GO/NO-GO, then surfaces)

## Contract unlocked

The campaign question answered honestly: campaign's target is an **antique painted
chart** (aesthetics: preserve-and-sharpen), not battle photorealism — so this slice
opens with a GO/NO-GO register spike, and **campaign may legitimately stay bespoke**
if the chart register is better served that way. If GO: one renderer substrate
engine-wide, the chart look preserved *as a grade*, not a different engine. Deps:
`09`–`12` owners + `15` grade infra. **This is the first slice allowed to move a
campaign pixel — campaign byte-identity deliberately ends here IF go.**

## API seam

- **16a — register GO/NO-GO spike + parity flip.** Spike one still: the campaign map
  on the photoreal substrate (relief-lit terrain, slate sea via `seaLayer`'s calm
  preset, chart grade as a post node) vs the current bespoke render.
  `compare-screenshots` vs `campaign-map-aegean-wide.png`. **Explicit non-blocking
  human checkpoint:** open both with `preview-shots` (~5 min); if silent, decide on
  the evidence, record the ruling here.
  - **GO →** `packages/photoreal-renderer/src/campaign/campaignWorld.ts` mirrors
    `08`'s playbook for `web/src/campaign/renderer.ts` (atomic flip, same-canvas,
    overlay ports; picking/`clampCam`/panel flow untouched — already camera3d).
  - **NO-GO →** campaign stays bespoke, recorded as an intentional two-renderer
    exception; 16b–d re-scope to bespoke-side lighting touches only and `17`'s
    deletion inventory shrinks accordingly. This is the one deliberately two-doored
    slice.
- **16b — chart terrain/sea material + painted grade** (if GO): relief terrain +
  calm sea through the photoreal owners, then the **antique-chart grade as a post
  node** — parchment tint, lifted shadows, grain, edge-cloud vignette. Satellite
  literalism is explicitly NOT the target.
- **16c — entities/scenery:** city models, armies, roads at campaign scale through
  the crowd/scenery owners.
- **16d — territory/labels/atmosphere:** faction washes/hatch (**two-color rule
  audit** — aesthetics), Cinzel label port with halo intact, cloud vignette — and
  the **05a-flagged look items land here by name**: label anchors below-left of
  models, ROMA as army sub-label, low-contrast selection ring, roads passing
  through city models, glowing beach rim.

## What the human can run / see

16a: the two stills side by side. If GO: the campaign map (`bun run dev`) at every
zoom, every campaign scene.

## Verification

- 16a: `compare-screenshots` photoreal-vs-bespoke against
  `campaign-map-aegean-wide.png` — the judge asks "which reads as an antique chart?",
  not "which is more real". `screenshot-critique` on every shot with that register
  prompt.
- If GO: full campaign suites green (alignment/visual/lod/production/handoff/
  save-load/conquest/reinforcements/polish/water-sea); `campaignPicking.test.ts`
  untouched-green; `campaign-lod` gate floors re-derived, never loosened; all
  `web/shots/campaign/**` re-blessed deliberately, diffed individually. Crops:
  **`map-overview`**, **`city-close`**.
- `compare-screenshots` vs `campaign-map-aegean-wide.png` +
  `campaign-map-political-borders.png` per sub-slice.
- Standing gates: battle scenes byte-identical during `16`; perf gate (campaign is
  cheap — the headline gate stays the battle one); cargo test.

## Must stay green

Standing gates 08b→17, with the campaign-byte-identity gate replaced (post-16a-GO)
by the campaign suite + deliberate re-bless.

## Risks

Register drift — campaign must NOT become a satellite render. The grade is the
identity; if the photoreal substrate can't carry the chart register, NO-GO is the
correct verdict, not a failure.

## Research

The aesthetics skill campaign references (`campaign-map-aegean-wide.png`,
`campaign-map-political-borders.png`, `ui-cardbar-tw.png` for panel adjacency);
`15`'s grade-node infrastructure.

## Human feedback that would change this slice

The 16a GO/NO-GO is David's most consequential remaining call — surface it clearly
(preview-shots + a one-paragraph recommendation), but do not block: decide on
evidence if silent, record, and keep the door explicitly reversible until 16b lands.
