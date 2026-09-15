# The battle authority

One battle, one `Game`, one tick owner, one command authority — running in a
worker, not on the thread that draws. This is the contract the battle shell and
the simulation now meet through, and the reasons it is shaped this way.

## One authority, described rather than handed over

A battle begins as a *description*: seed, map choice, armies, which sides the
commander drives, and any opening orders. The authority builds the single `Game`
from that description; nothing constructs a battle `Game` on the drawing thread
and hands it across. That is what makes "one authoritative `Game`" checkable
rather than aspirational, and it is why every battle entry names a setup.

**Unmet migration item.** A campaign encounter is not describable this way:
starting one needs the live `Campaign`, and reporting its result needs the
campaign and the finished battle in one address space. Until the simulation
boundary offers a serialisable battle setup and result, campaign battles cannot
reach the authority, and the shell says so instead of pretending otherwise.

## A publication is one completed tick, owned by one side at a time

Every completed tick is copied into one buffer and handed to the consumer, which
owns it until it hands it back. Nothing is read while the other side may be
writing it, and no array in a publication comes from a different tick than its
neighbours. The layout has a single owner so the producer and the consumer never
describe the bytes separately; offsets are derived from the counts in the
message, so a steady tick rate ships no layout and allocates nothing.

Overlay records the simulation exports as copies — the queued-order chain, the
formation-drag ghost — ride the publication only when something is actually
drawing them. An idle battle publishes neither.

## Backpressure is visible slowness, never lost transitions

The authority runs exactly as far ahead as it owns storage for, and then stops.
It never drops a tick's observations to keep up: a release, a death or a weapon
switch that nobody drew is still a transition the animation timeline must see in
order. A consumer that cannot keep up therefore makes the battle run *slow*,
which is a fact the telemetry reports, rather than making it run *wrong*.

The pool is two publications deep — enough for the producer to fill one while
the consumer holds the other, so neither waits on an animation frame. A deeper
pool would buy nothing but staleness.

## Render cadence and tick cadence are unrelated

Completed ticks are consumed the moment they arrive, not when a frame is drawn.
Drawing happens whenever the browser offers a frame, sampling the presentation
timeline between the two most recent completed ticks. A slow tick cannot stall
the camera, and a skipped draw cannot skip a tick.

Presentation time is derived from when completed ticks actually *arrived*, so a
stalled authority freezes the pose rather than extrapolating motion that never
happened. A tick republished because an order was accepted into it does not
restart the interval the camera is already part way through.

Everything a frame reads out of the newest publication happens in one
uninterrupted window, so no two consumers in a frame can disagree about which
tick they are looking at.

## Commands are ordered intent, acknowledged with an application tick

Orders leave as a sequence-numbered log. A burst issued inside one input handler
travels as one ordered message, so the authority applies it in the order the
player made it, and nothing posted afterwards can overtake it. Each command is
acknowledged with the completed tick it was applied after — it first influences
the tick that follows. That stamp is what lets a directly run battle and a
scheduled one replay the same accepted log and agree tick for tick.

Questions that belong to the simulation stay there. "Which unit is at this
point" is the simulation's rule, so a click asks the authority and acts on its
answer rather than re-deriving the rule from published records. The cost is a
round trip, which the input layer absorbs by deferring only the decision that
needs the answer.

## Honest numbers

Worker costs are intervals inside the worker's own clock. Ages are main-thread
receipt times. The two clocks do not share an origin, so the offset between them
is *measured*, reported with its uncertainty, and never used to clamp a
publication age into a flattering shape. Moving a slow tick to a worker does not
make the tick faster, and nothing here reports it as if it had.

## Explicit outcomes

- Nothing ticks behind the loading cover; the battle starts when it is on screen.
- A hidden tab stops the authority rather than banking ticks to replay on return.
- A scripted advance (a capture, a benchmark preparation) runs in yielding
  batches, can be cancelled, and resolves only once its tick has been consumed by
  the shell — so a caller that awaits it reads the state it asked for.
- Disposal frees the one `Game`, retains no publication, and ends the worker.
- An authority failure surfaces to the scene instead of leaving it waiting.
