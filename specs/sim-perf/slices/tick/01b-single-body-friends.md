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

Current trial: golden and the existing friend-recording test pass; the
duel/sandbox combined hash remains `8d21ca62c2a920c4`. Independent static
review found no defects. The long AI oracle is running. The first timing
comparison was stopped when the unchanged control took 88.422 ms under
load, versus about 39 ms in the earlier gate. That partial run is invalid
for judging the candidate, which remains uncommitted in its worktree.
