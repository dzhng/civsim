# Reuse the unchanged friend-sample cutoff

When a full nearby-friend sample rejects a candidate, its worst retained entry
has not changed. Keep that entry's index until an accepted replacement or nearer
mounted body changes the sample. The original strict priority comparison and
last-equal-maximum slot remain authoritative; no list reordering or cross-tick
cache is introduced.

[Results and provenance](summary.json) preserve the early and later contact
windows. Both diagnostic builds match the production hashes at9000,9300 and9308;
all four arms also agree at12000 and12308. Raw reports are compressed alongside
the summary. Targeted tests preserve mounted updates, equal-priority rejection,
slot order, foot/mounted targeting and the existing golden state. Independent
review found no actionable issue.

| Uninstrumented Node window | Control ms/tick | Candidate ms/tick |
| --- | ---: | ---: |
| Initial contact | 26.66 | 25.91 |
| Later combat | 53.85 | 49.65 |

The instrumented baseline→candidate comparison locates the reduction in targeting
(later29.11→24.84ms), while the other major stages remain close. The uninstrumented
candidate→control comparison supports a later-window reduction of about7.8%.
These are bounded diagnostic runs, not a quiet repeated browser ranking. Later
simulation is still slower than30Hz; live frame cadence and the net-shadow
contract remain open. No thresholds or state hashes were changed.
