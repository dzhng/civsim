# Slice 04 — One importance-ranked greedy pass over one budget

**Contract:** `arbitrateLabelOccupancy` ranks **all** arbitrating labels (city +
faction/league + army) by `importance` (with the deterministic emitter-index
tiebreak), single greedy pass, high→low, claim if the ink rect clears all prior
claims else cull. **One occupancy budget** — the per-kind `stageOf` ladder is
gone. Cards stay pre-claimed and outrank everything (unchanged); major faction
engravings keep their "ignore cards / background-scale" exception. Leagues run
the identical path — a league is just a faction with lower territory-size
importance, **no special text or style**.

**Slice variable:** placement *order* only (the score is Slice 03's, frozen).

**API seam / owner:** `packages/game-renderer/src/campaign/mapPass.ts` — replace
`stageOf` + its sort in `arbitrateLabelOccupancy` with the importance
comparator; `index` stays the stable tiebreak. Everything else (claim push,
`placeCityLabel` candidate walk, composed-army collision groups, the card
pre-claim) is preserved. **Growth in place, not a parallel system.**

**Determinism / cost:** the score is a pure function of tier / territory-size /
army-strength (zoom enters via `visibleLabels`' existing LOD size term, not the
sort key — see Slice 06); the sort is stable with index tiebreak; the greedy
loop is the same O(n²)-over-visible it runs today. No new state, no allocation
growth, identical frame-to-frame given the same camera.

**Deliverable:** overview is no longer a wall of text — the strongest realms and
top-tier cities survive, minor names cull, on one budget.

**Gates:**
- Re-bless `campaign-lod` + `campaign-collision` overview snaps; regional/close
  unchanged.
- The collision test (arbitration's own `inkRect`) stays green.
- `render-probe.mjs` marker gate (Slice 01) green — density must not re-offshore
  or detach any surviving label.
- **screenshot-critique** on overview + regional; **find-map-bugs** oracle at
  lane close (label-collision / label-detached classes) on the three canonical
  shots.

**Human checkpoint (non-blocking):** bless the new overview look; confirm
leagues read identical to powers (no special-case leaked in).

**Feedback that would change this:** if too few / too many names survive at
overview, that is Slice 03's normalization or Slice 05's margin, not a re-cut
here.

---

**SHIPPED.** Two coupled changes landed together (the arbitration reorder alone
does not declutter, because at overview leagues fade below `OCCUPANCY_MIN_OPACITY`
and never arbitrate):

1. **Sound faction power.** The slice-03 first cut (capped `radiusKm`) ranked
   Rome last and favoured sparse steppe leagues. Replaced with **owned-city
   tier-sum** (live, from `opts.cities`) — majors now rank 21–30 (Rome #3),
   substantial leagues (Mediolanum 26, Ierusalem/Ephesus 17) rank fairly, and a
   one-city steppe league (TANAIS = 1) drops to the bottom. All three importance
   helpers rescaled onto one owned-city-tier scale (city tier → 3/6/12, army →
   soldier mass). `powerKm` was explored and reverted (area is the wrong signal).
2. **Importance-ranked arbitration** (`stageOf` → importance comparator) **and
   an importance-driven league LOD** (`visibleLabels`): the minor-league opacity
   ramp moved off territory AREA (`screenR`) onto importance vs a zoom-scaled
   bar (`LEAGUE_IMPORTANCE_BAR_HI=14`, ramp 6) — high at overview, → 0 by
   mid-zoom (the reappearance mechanism slice 06 verifies).

Result: overview faction labels 34 → 13 (6 majors + ~7 strong leagues); the wall
of ~28 faint minor leagues is gone. Scenes pass (nothing overlaps, LONDINIUM
beside ARVERNI); only whole-map **political** snaps changed (0.83%) — natural /
regional / close are 0 diff; re-blessed. tsc clean.

**Open polish (unbiased screenshot-critique findings — deferred, taste calls):**
- **Duplicate name**: a league engraving and its lead-city label render the same
  string near each other (IERUSALEM league + IERUSALEM city). Pre-existing but
  more visible now that strong leagues show. Candidate: suppress the league
  engraving when its lead-city label is present.
- League engravings read sea-like when faint (they *are* faction-styled per
  David's "leagues == factions"; the faintness is the cause).
- Interior slightly sparse — `LEAGUE_IMPORTANCE_BAR_HI` could drop a point or
  two to show a few more leagues. Left for David's eye.
