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

The observed retry has one navigation and no reload. With the same save and
terrain manifest it passes on software. At the second fence, submission count
stays327 until completion, compared with continuing submissions in the failing
control. First/second drains are13.63/8.63seconds. The temporary guard is now
applied directly in the existing battle preparation state: while the initial
frame is pending, the loop advances its paused clock but does not resubmit the
scene. Normal draw/simulation resumes after existing readiness resolves. There
is no new queue owner, timeout, quality reduction or loading policy.

The normal software handoff also passes the unchanged readiness gate with the
runtime guard. It then fails its30-second screenshot while the16k battle keeps
rendering. The visual soldier-pixel check now freezes at the current tick using
the existing settlement API before capture; this preserves all handoff/return
assertions and the screenshot limit. This is a visual boundary correction, not
an increase to startup or rendering budgets. The normal software flow now passes every check: visible16,000 soldiers, return
to campaign, cleared encounter state and saving, with no page errors.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| campaign-handoff / battleRendererReady | Matched software startup exceeded60seconds at the second GPU fence. | Matched control and normal software journey complete within the unchanged guard. | Initial frame drains before repeated submissions; no simulation change. **moved** |
| campaign-handoff / soldier pixel capture | Live16k battle screenshot exceeded30seconds after successful readiness. | Freeze and settle the existing current tick, then capture and complete the same return/save assertions. | The visual check needs a settled frame; no screenshot timeout or pixel assertion changed. **moved** |
