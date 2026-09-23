# Change ledger

| Test | Previous behavior | New behavior | Why it changed |
|---|---|---|---|
| `vista_coast_interpolates_continuously_between_offshore_columns` (`crates/sim/tests/genmap.rs`) | New regression fails on binary source at x=1424: y=552 and previous y=552, a flat step in a widening coast. Binary-control reconstruction also fails with the final tolerance. | Signed interpolation follows the widening coast within 20% of a source cell per column, allowing the existing reach-taper variation while rejecting full source-cell jumps. Both vista resolutions pass. | The renderer receives subcell shore information instead of binary wet/dry samples. **carried-in** defect, newly pinned by this test. |

`web/tests/battleTerrainSeam.test.ts` only migrates its dry fixture from zero water coverage to negative signed shore distance. The seam assertions and behavior are unchanged. Existing physical hash and passability assertions were neither changed nor re-pinned. No unit stats changed. No screenshot baselines have been updated.
