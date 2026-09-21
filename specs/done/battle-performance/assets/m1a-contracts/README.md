# Independent battle contracts

Integrated f4ecbb1f from Claude pass aaaf9968. The frontend names its API,
receipts and diagnostic event shapes explicitly; camera and tactical data have
one renderer-neutral owner. No runtime code, event meaning or test assertion
changed. Optional native pass detail is now named rather than accepted only as an
extra property. Campaign and the source production constructor remain unchanged.

Root inspected every changed path, both telemetry producers and the source API.
Independent Codex review found no actionable regression and passed web and
renderer-lab typechecks; its focused test startup was blocked by its sandbox's
Vite temporary-file permissions. Root then passed the integrated full web
TypeScript check and 38 web plus21 native-facade tests. The web invocation named
three nonexistent test paths alongside seven real files:38 is the actual count,
not a claim that ten files ran. Worker reports retain broader checks separately.

The TypeGPU lifecycle fixture has five inherited failures from a missing
reproject mock; the worker retained baseline and candidate logs. Unrelated lint
and formatting failures are also recorded, not waived as globally green.

No visual or speed claim follows from type extraction. GPU/frame behavior is
unchanged. The package README describes the ownership principle, while the
active spec owns migration status. Compressed logs retain exact evidence.
