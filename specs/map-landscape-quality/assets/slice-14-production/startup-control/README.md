# Matched first-frame startup

Constructor seed1234567 and encounter tick4117 produce identical save and
manifest hashes on hardware and software. Hardware completes; software reaches
all16,000 uploaded soldiers but times out at the second submitted-work fence
under the existing60-second guard. The first software fence took12.8seconds,
with additional submissions while it waited. Reports retain the exact hashes
and per-queue milestones.

A temporary preparation guard was then tested through module interception.
That run is invalid: after a correct initial terrain identity, battle globals
vanished and queue instrumentation restarted with only campaign submissions.
No runtime change follows that result. Record navigation/reload events across
the next controlled run before interpreting it. The shared renderer and scene
readiness thresholds remain unchanged.
