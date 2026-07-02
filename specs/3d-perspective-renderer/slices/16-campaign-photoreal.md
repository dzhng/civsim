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

## 16a RULING — **NO-GO** (recorded 2026-07-03; reversible until 16b lands)

**Verdict: campaign stays on the bespoke WGSL chart renderer as a deliberate,
permanent two-renderer exception.** The photoreal substrate cannot carry the
antique-chart register; per this slice's own Risks note, that makes NO-GO the
correct verdict, not a failure.

**The experiment.** Reused the photoreal substrate (`/renderer/photoreal-battle`,
the full production `PhotorealWorld` — SkyModel dome + aerial-perspective owner +
Gerstner `seaLayer` + CSM sun + ACES) framed at chart-like cameras: a strategic
near-top-down (`pitch≈1.4`, low zoom) and a low vista, golden-hour preset, hardware
adapter. Held side-by-side with the current bespoke chart at matched framings
(`campaign-lod-whole-natural` strategic, `campaign-lod-rome-close` close) and the
north-star reference (`aesthetics/references/campaign-map-aegean-wide.png`).
Opened for David with `preview-shots`; ~10-min active window.

**Evidence (four independent lines, all one direction):**
1. *References.* The campaign identity (aesthetics: "preserve and sharpen") is a
   FLAT painted parchment chart — matte slate-blue sea carrying faded italic
   sea-names, engraved Cinzel labels, cloud-vignette frame, painted relief. It is
   defined by the ABSENCE of a physical sky, wave sea, cast shadows, and ACES
   contrast.
2. *The photoreal substrate at a chart camera* renders a physically-lit ground
   plane whose edges fade into an atmospheric sky-haze band — a lit empty field,
   not a chart. No vignette frame, no muted palette, nowhere to letter a sea name.
3. *The photoreal sea* (`photoreal-sea/sea-horizon`) is a Gerstner ocean with
   whitecaps + blinding sun-glint — categorically "satellite/real render," the
   exact failure the slice names ("campaign must NOT become a satellite render").
   Calm painted water with italic "AEGEAN SEA" across it is impossible on it.
4. *Neutral unprimed judge* (fresh subagent, images only, neutral labels) — verdict
   unprompted: the bespoke chart reads as the antique chart; the photoreal render
   is "a fundamentally different register that grading cannot convert" (no flat
   orthographic chart projection, no painted land/sea separation, no sea lettering).

**The trade David saw.** *Chart identity vs photoreal consistency:* the photoreal
substrate's headline outputs (physical sky, Gerstner sea + glint, CSM shadows, ACES
relief) are precisely the register that converts the painted chart into a satellite
render — the opposite of the locked campaign identity. *Perf:* not a factor
(campaign is cheap either way; the headline gate stays battle). *17 payoff:* GO's
sole real upside — one substrate engine-wide, 17 deletes ALL bespoke passes. NO-GO
keeps the bespoke campaign renderer permanently; 17's sweep shrinks to battle-side
bespoke only. The maintenance win does not justify destroying the identity the
aesthetics skill exists to protect, on a surface that already hits its target.

**Consequences of NO-GO (this slice):**
- The bespoke campaign renderer is recorded as an intentional permanent exception
  in the README end-state invariants + the scaffolding ledger's last row.
- 16b/c (photoreal campaign world, entities/scenery) are **not built**.
- 16d re-scopes to bespoke-side critique touches only (the 05a-flagged items).
- `17`'s deletion inventory: battle-side bespoke world passes only; the campaign
  bespoke passes + `frameShell` world machinery are KEPT (the campaign renderer is
  their live owner), not swept.

## 16d (NO-GO branch) — bespoke-renderer critique touches

The 05a-flagged look items, landed on the bespoke campaign renderer:
- **ROMA as army sub-label** — already shipped: `campaignArmyLabels` sets
  `subText: occupiedCity.name.toUpperCase()` (`web/src/campaign/renderer.ts`).
- **Label anchors below the model** — already shipped: relief-aware
  `cityLabelOffset` + `cityReliefRisePx` seat the name a fixed gap below the raised
  model. (Verified against a fresh close capture; no change needed.)
- **Low-contrast selection ring** — DONE. `CampaignSelectionPass` city ring (kind 0)
  was a 0.68-alpha green washed 40% toward parchment-gold → read as faint grey over
  turf. Raised to 0.90 alpha + 0.20 wash + a small brightness lift; the green
  allegiance ring is now legible (before: no visible ring on selected Roma; after: a
  clear green ring). Verified in `campaign-lod-selected-city` before/after.
- **Glowing beach rim** — DONE (conservative). The land-side coastal sand in
  `mapPass` `naturalCampaignColor` was a bright `(0.85,0.78,0.60)` over a wide
  `0.05..0.6` shore band → glowing rim. Muted to `(0.77,0.71,0.56)` and tightened to
  `0.04..0.42`; the waterline reads as a soft beach, not a lit edge. Sub-budget
  across the campaign suite (floors untouched); the coast `campaign-lod` naturals
  re-blessed deliberately.
- **Roads through city models** — AUDITED, no code change this pass. Roads are
  `depth:read` decals correctly drawn AFTER the depth-writing city entities, so
  depth already governs occlusion; the residual "through" read is road geometry
  terminating at the city NODE center *under* the model footprint. The right fix
  (per `renderer` skill: never cut endpoint gaps around occluders) is to terminate
  road polylines at the city footprint radius and let the model occlude — a
  contained follow-up left for a road-geometry pass; recorded here so `17`/polish
  can pick it up. Not churned blind under this slice.
