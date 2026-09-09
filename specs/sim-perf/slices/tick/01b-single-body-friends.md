# Exact friend-recording trial

The developed profile leaves targeting as the largest cost after scratch
reuse. Operation counts show over 36 million friendly-record attempts in
300 ticks. Before introducing concurrency or changed idle behavior, test a
small exact reduction in that existing work.

Targeting visits each hashed bucket at most once. A foot soldier contributes
one body, so its owner cannot already be in the friendly record set when
that body is visited. Horses contribute two bodies and retain the original
owner lookup and nearest-body replacement. Record ordering, capacity,
priority ties and all bearing/distance calculations remain unchanged.

Trial gate: unchanged golden, duel and long AI hashes, followed by a bounded
baseline/candidate/candidate/baseline developed-window comparison. Both
binaries use the identical harness and measured interval. Retain only if
the comparison establishes a useful gain. Independent review and integrated
checks follow before completion; a prototype is not a shipped result.

The axis-distance and deferred-bearing ideas remain unimplemented. Their
operation counts do not establish a speedup, and expanding the trial would
hide which change paid for itself.

Trial closed without shipping: golden and the existing friend-recording test pass; the
duel/sandbox combined hash remains `8d21ca62c2a920c4`. Independent static
review found no defects. The long AI oracle also matches through 9,000 ticks,
ending at `dda9a54e95963dbd`. The first timing
comparison was stopped when the unchanged control took 88.422 ms under
load, versus about 39 ms in the earlier gate. That partial run is invalid
for judging the candidate.

A second bounded comparison also became contaminated. The baseline averaged
90.588 ms; the first candidate averaged 99.371 ms, with a 42.539 ms per-tick
standard deviation in its second repeat. Whole-process user CPU time was
201.06 seconds versus 195.44 seconds, including identical preparation, but
that small difference cannot establish a stable benefit under these conditions.
Load reached 23.88 before the next candidate run. The remaining runs were
stopped and the prototype removed. [Raw partial evidence](../../assets/friend-trial-inconclusive.txt)
is retained; it proves neither a speedup nor a slowdown. Existing friend
recording remains unchanged. A future trial requires usable measurement
conditions before implementation effort is repeated.
