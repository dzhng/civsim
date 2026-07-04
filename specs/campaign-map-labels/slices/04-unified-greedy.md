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
