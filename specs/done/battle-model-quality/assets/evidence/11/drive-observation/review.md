# Movement observations are not a voluntary-step signal

Read-only investigation on the unchanged simulation at `bebe5991`. Its purpose
is to constrain locomotion selection, not repair gameplay or accept an animation.

The steering pass combines formation forces, pressure response and cruise drive
before damping and terrain projection. Its final position write is therefore not
pure intention. `kin_v` measures displacement before separation; the final body
position also contains solver movement. Neither can simply be called leg speed.

## Controlled one-tick evidence

The probe used public spawning and move orders, with controlled initial overlap,
stun and momentum injections. All cases start at seed `0x5150` and advance one
ordinary `Sim::tick` (1/30 second). The overlap places two friendly heavy infantry
at (0,0) and (0.2,0); the free walker instead receives a move to (20,0). These
are mechanism controls using current class defaults, not balance assertions or
evidence of typical fight frequency. The six raw force traces are retained here.

| Case | Total displacement (m) | Steering trace (m) | Separation trace (m) |
| --- | --- | --- | --- |
| Free walk | (.001333, 0) | (.001333, 0) | (0, 0) |
| Conscious overlap | (-.275033, -.056556) | (-.073333, 0) | (-.201700, -.056556) |
| Stunned overlap | (-.238978, -.065348) | (0, 0) | (-.238978, -.065348) |
| Stun expires in this step | Same as stunned | (0, 0) | Same as stunned |

The last case starts with half a tick of stun. The end-of-step timer is no longer
positive, but ordinary steering was skipped during the interval. End-state
incapacity alone cannot explain the movement that has just occurred. Bowling
shares the adjacent early-return branch; this probe did not inject its private
timer and claims no measured bowling case.

A separate single cavalry control starts with momentum equal to mass times
3m/s. The trace records +.10000001m of momentum movement in both conscious and
stunned cases. Final displacement is zero for the conscious case and +.10000001m
for the stunned case. `prepare_soldier` saves the starting position before adding
momentum, and normal `finish_soldier` later writes that saved position plus its
steering displacement. Thus subtracting the recorded momentum from `kin_v` is
not a sound decomposition. No momentum behavior was changed by this work.

## Consequence for animation

A conscious man can retain protection during external displacement, but the
current observations do not prove that all of that distance should advance a
walking cycle. A later read-only observation may describe which movement stage
ran and its output; it must not invent a new gameplay state or claim pure
voluntary drive. Any interval measurement must cover every tick the adapter
spans, rather than relabel the final tick as the whole interval.

Displayed motion is another independent boundary: `BattleCrowd` currently
smooths live root positions after observing engine positions, while frozen
captures snap directly to engine positions. Start/stop/reversal acceptance must
measure submitted roots and ground-relative feet in that live path. The existing
frozen centroid film is not that proof.

The scratch probe and existing native
`force_trace_steering_conserves_pre_collision_displacement` test both completed
successfully. Root independently reran all six probe controls and reproduced the
reported values exactly. That existing heavy-clash test does not establish cavalry momentum
conservation. Source and instrumentation remain outside production; only these
bounded findings and raw traces are durable evidence.
