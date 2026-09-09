# GPU atlas admission

Submission, admission, and presentation are different boundaries. Submitting a
draw does not establish that WebGPU accepted its resources. Conversely, admission
need not wait for every submitted draw to finish appearing on screen.

Atlas preparation now brackets the synchronous bake with device error scopes for
validation, internal errors, and allocation failure. The bake restores renderer
state; all three scopes are popped immediately, before awaiting any result. Thus
live frames that run during admission are outside those scopes. Every result is
settled before the atlas can be returned; a failure disposes the prepared target.
No device completion wait was added to live playback. This uses the initialized
WebGPU device seam already used by the production world's device diagnostics.

Three creates an inner validation scope around pipeline construction and logs
its failures rather than rejecting a promise. The browser probe therefore makes
a **real invalid pipeline**, not a fake error-scope result: it duplicates a shader
attribute location in one newly compiled atlas pipeline. Three consumes the
initial pipeline validation error, but the outer admission scope captures use of
that invalid pipeline in the submitted rendering commands. Preparation rejects,
texture count remains 102, the original target is restored, and the last admitted
frame remains byte-identical. There are no uncaptured device errors. The test
allows exactly the deliberately generated nested-pipeline diagnostic; unrelated
console or page errors still fail it.

Before this correction, the unit's asynchronous validation and rejected-scope
cases resolved an atlas instead of rejecting. Five focused tests now pass: the
existing facing/anchor test, plus synchronous render failure (including a falsy
thrown value), asynchronous GPU validation, and rejected error-scope cleanup.
Independent review found no remaining admission/lifetime defect. Typecheck and
the real browser admission probe pass.

The existing `bakeMs` metric now measures preparation **through admission**. It is
not CPU-only submission time, GPU execution time, or presentation latency. The
earlier far-property report's timing labels describe its pre-admission revision;
do not apply that meaning to new captures. No unrelated baseline was refreshed
for this correction.

The caller still owns its final active-pose/catalog revalidation when the real
asynchronous preparation completes. This pass does not replace that transaction
guard or claim full material-fidelity acceptance.
