# 05 — closeout: sweep, perf ledger, spec close

**Visual variable:** none. This slice composes accepted variables and may not tune them —
except one optional recorded calibration pass over `TURF_CONTRAST` if 03/04 logged
cross-slice observations, judged one variable at a time against the same crops.

## Contract unlocked

The feature is one system with no sediment: single owners hold, evidence is archived,
every moved baseline is ledgered, perf is proven, and the spec is closed.

## Work

1. **Refactor-clean audit:** grep-verify no consumer retains a private meadow color,
   contrast amplitude, strand-shape constant, or edge constant outside the two owners
   (meadowPalette / groundDetail); the rejected spike helper and its transitional params
   are gone while its evidence remains; decide whether WIDE_DETAIL_TERRAIN_STYLE
   still earns its existence now that flecks are replaced — collapse if not.
2. **Full sweep:** all battle scenes without UPDATE_SHOTS; inventory intentional diffs vs
   unexpected diffs vs unchanged; fix unexpected movement (never hide with tolerance);
   bless only reviewed frames; campaign must be byte-identical; carried-red ledger
   (`reports/carried-red-at-start.md`) reconciled — anything still red must be red for its
   original reason.
3. **Perf ledger:** paired hardware `battle-perf-30k` vs `reports/perf-before.json` →
   `reports/perf-after.json`. All 33 ms assertions green; cumulative feature cost
   ≤ +0.3 ms median GPU / +1.5 ms rAF p95; zero new texture resources,
   uploads/readbacks, or draw calls; strand-off attribution recorded in stats.
4. **Final contact sheet** (`visualizations/final-contact-sheet.html`):
   before/reference/final for top-down and RTS; close mud edge; road edge; playable→vista→
   quad seam; golden-hour + overcast preservation; one composed battle frame with units.
   Run **compare-screenshots** (final vs before vs reference) and a final unprimed
   **screenshot-critique** per shot class.
5. **Ledger + docs:** change-report ledger of every moved test/shot
   ({test/shot, previous, new, why}); update the aesthetics-relevant notes if any constant
   moved that the aesthetics skill names.
6. **close-spec:** archive `specs/battle-ground-turf/` to `specs/done/` rewritten as
   rationale (why analytic anisotropic detail replaced both isotropic fine noise and the
   rejected bake, the attribution evidence, and the edge-mechanism decision), pointing at
   the code for the how.
7. Non-blocking preview-shots checkpoint on the contact sheet (~5 min), then done.

## Stays green

Everything in the README firewall list, all slice telemetry, cargo suite, campaign
byte-identical.

## Feedback routing (post-ship)

- Weak/noisy/repeating strands → groundDetail's analytic strand field.
- Camo or flatness → groundDetail TURF_CONTRAST.
- Hue anywhere → meadowPalette anchor/factors.
- Hard or haloed edge → TURF_CONTRAST.edge / coverEdgeNode.
- Perf → groundDetail's analytic octave/direction count; never shadows or blade density.
