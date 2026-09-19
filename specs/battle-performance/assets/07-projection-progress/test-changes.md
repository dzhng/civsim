# Test-change ledger

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `photorealCrowdLod.test.ts`: multi-level jumps | With test thresholds40/20/10/5, old tier4 at41pixels stayed4, and old tier0 at4pixels stayed0. | Those cases reach tiers1 and3 respectively; four other assertions and the reversal history remain unchanged. | The old assertion pinned a stall across already-cleared boundaries. The correction preserves each adjacent1.5pixel deadband while allowing intermediate progress. **moved** |
| `projectedSpan.test.ts`: orthographic near crossing | Previously uncovered; the old function returns Infinity for the straddling span. | Crossing and distant spans have the same finite footprint; wholly clipped spans still return0. | Orthographic scale has no perspective divide. Root's old-policy run fails this new regression. **moved** |
| `photorealCrowdLod.test.ts`: shadow caster crossing near | Previously uncovered; the old bounds guard selects l0. | The caster remains visible and uses its finite measured size and l3 shadow mesh. | A second guard independently forced Infinity; both sites now use the projection-owned rule. **moved** |
| `photorealCrowdLod.test.ts`: large jump progresses | Previously uncovered examples include old tier0 at8pixels→0 and old tier3 at33pixels→3. | These reach2 and1; the19pixel jump reaches2 and adjacent deadband cases hold. | A bounded walk clears intermediate boundaries without retuning thresholds. **moved** |
| `photorealCrowdLod.test.ts`: held fitted extents | Fresh shadow selection is3 at3.95824/3.16659pixels, but old tier0 stays0. | Fresh and retained histories both select shadow tier3. | Reproduces the stuck-history defect at captured scales. Root corrected doubled width/resolution to the actual full width/default1024 map. **moved** |

The four new tests and one rewritten test all fail against the old policy and
pass after correction. Existing audience-sequence hashes remain unchanged.
There are no unit-stat, mechanics, saved-data or screenshot-baseline changes.
