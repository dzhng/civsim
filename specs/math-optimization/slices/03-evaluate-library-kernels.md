# 3. Adopt only library kernels that beat prepared existing math

## Entry and contract

Proceed only if slice 1 found an incremental library candidate and slice 2 has
established the production prepared-camera baseline. Otherwise record this
slice as rejected/not needed and close out the plan. Installing the skill is
already useful; adding the npm library is not a completion requirement.

The only question is whether verified `math` matrix/vector kernels improve the
same camera workload enough to justify the dependency. Do not recover a failed
result by expanding into crowd simulation, geometry generation, or other math.

## Seam and cutover

Use only the exact exports validated in slice 1, initially multiply, invert,
and homogeneous vector transformation where selected by its evidence. Keep the
prepared-camera interface and all consumers unchanged. Projection construction
and its reverse-Z semantics remain locally owned; upstream `perspectiveZO` is
not a replacement. `math/three` and scene extension remain excluded.

The package uses plain tuples while the existing matrices are Float32Array.
Maintain the established rounding boundaries and include tuple marshaling and
Float32 conversion in measurements. Never reinterpret typed arrays with type
casts, mix storage kinds through the same hot call, or share scratch across
worlds. If correctness needs an expensive adapter, the benchmark includes it.
If this makes the candidate lose, reject it rather than changing precision.

Add the exact verified package version to `web/package.json` and update its
existing lock only when integrating a passing candidate. This is an explicit
exception to renderer-core's current dependency-free rationale, justified only
by measured benefit. Update that rationale if adoption succeeds. Verify Vite,
TypeScript, tests, and the production build all resolve the dependency through
the current source-package layout; do not create a new workspace package just
for this import.

Replace each selected kernel at its existing owner in the same pass. Search
all consumers before changing an internal signature; keep legitimate cold
callers on the single implementation. No permanent old/new toggle, generic
math adapter, duplicate algorithm, or legacy wrapper. If shared callers make
the change exceed this seam, stop and reslice before broadening it.

## Verification and review surface

Run the exact same workload and admission policy as slice 2, using the shipped
prepared implementation as baseline. Report incremental library improvement
separately from total improvement over the original code. Include module/bundle
impact, preparation cost, allocation/GC evidence, and full-frame median/p95.
Fail correctness on any discrete visibility/picking difference. Preserve
existing numeric tolerances and GPU buffer layout.

Run the focused camera tests, full web tests, typecheck, lint, production build,
and the matching campaign browser scenes. Keep battle camera checks green
because the low-level math owner is shared, even though battle adoption is out
of scope. Open the same campaign review surfaces as slice 2. Visual variable,
matching captures, and crops are unchanged: placement and visibility only.
Run `compare-screenshots`, then an unprimed `screenshot-critique` as the **last
visual acceptance check**. Follow the README's non-blocking review protocol.

If the candidate fails, remove its imports, dependency/lock changes, and
experimental runtime code in this slice; retain slice 2. Preserve minimal
reproducible probes and concise verdicts, not competing production algorithms.
Raw artifacts and the isolated package install stay in ignored `throwaway/`.

Finish accepted work with the repo's `review` skill and required independent
review; use `change-report` if test behavior moved. Report unresolved checks as
unresolved. Close the spec with `close-spec` after all slices have an accepted
or evidence-backed rejected outcome.

## Decision budget

Delegated: choice among the specific kernels admitted by slice 1, private
scratch layout, and import style. No further API, precision, library-version,
threshold, workload, GPU quality, or ownership decisions are delegated. Human
feedback may reject the dependency cost despite a measured win; it may not be
used to manufacture a speedup claim without evidence.

## Result

Not started. Record adopted/rejected kernels, package identity, evidence, and
the clean final ownership before updating the README handoff.
