# Explicit manual life state

Target: changing life state must apply production corpse presentation while
leaving the selected clip, phase, geometry and camera unchanged. This is a harness
correction, not placeholder-art acceptance or a death-animation quality verdict.

The old fixture inferred life from `clip !== "death_a"`. Direct-authored `death`
therefore rendered alive. The fixture now requires a boolean and the existing
manual pose/control owner supplies it. Replay and gameplay continue to use engine
observations. No renderer, asset, lighting, simulation, balance or save change.

## Causal verification

The new CPU tracer failed before implementation (`true !== false`) for dead idle;
afterward both idle/death_a × alive/dead preserve exact clip/phase across16 bodies
and submit the expected production corpse strength. Focused7 tests and typecheck,
then all357 tests/60 files and typecheck passed before snapshot review.

The [initial browser run](initial.json) proves the checkbox changes pixels and
returns to byte-identical alive pixels, with clip/phase fixed. The new captures
show desaturation without geometry movement. Main inspected both full frames,
all old/current baseline pairs, and both control panels. The [fresh six-image
critique](visual-review.txt) confirms consistent geometry/camera and a legible
checkbox, with no panel overlap. Upright dead idle is deliberately a treatment
isolation probe, not an authored death pose. Placeholder anatomy, weak contact
shading and pre-existing clipped lab navigation remain outside this correction.

Five existing snapshot files were already stale. The [untouched4ab9d810
control](untouched-control.json) reproduces all six old snapshot failures (parity
is asserted twice). Its four world views are byte-identical to the changed tree.
The [one-expression diagnostic](shadow-diagnostic.json), in a separate detached
checkout, selects the main mesh tier for shadow submission instead of the shadow
planner's independent tier. Every existing snapshot becomes exactly0px different
from the old baseline. That temporary expression was restored afterward; no
diagnostic code ships. This proves the pre-existing shadow-tier split causes the
differences, not manual life state or new assets. Earlier rationale and isolated
caster coverage live in [projected LOD](../../07/projected-lod.md).

The old images are preserved under `reference/`; current images remain in the
workbench's normal baseline directory. Main sees subtle shadow changes without
model loss. The [independent eight-image review](baseline-review.txt) found no
material visible regression. Refreshing these snapshots accepts the already-owned
production shadow policy, not a new lighting treatment. All thresholds stay zero.

The [independent code review](code-review.txt) found only the needed controls
snapshot update, resolved with the reviewed capture. PATH CLI0.144.4 could not
run the configured model; the already-installed app CLI0.153.4 completed the
review without a model override or installation. Shape/diff review keeps life
state in the existing manual pose owner, removes the name heuristic, and adds no
compatibility path or dependency. The [final normal browser repeat](normal.json)
passes all49 checks and all8 snapshot assertions at0px (seven unique images),
with no page errors. Final full357 CPU tests and typecheck also pass. Geometry
and gameplay remain unchanged; no art or performance acceptance is implied.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `battleModelReplay.test.ts`: manual workbench life state | Clip name chose alive/dead; dead idle fails true!==false. | Both names obey explicit life state and retain clip/phase, all16 bodies. | Independent authoring names cannot define presentation state. **moved** |
| Workbench `manual-alive` / `manual-dead` and manual life control checks | No state control or snapshots. | Same idle frame changes production corpse treatment and returns exactly; phase remains.5. | Native checkbox handler drives the production world. **moved** |
| Workbench heavy-front | Untouched control11600 differing pixels. | Refreshed to independently selected shadow geometry. | One-expression diagnostic restores old0px exactly. **carried-in** |
| Workbench phalanx-side | Untouched control5328 differing pixels. | Same model with current shadow tier. | Same causal diagnostic. **carried-in** |
| Workbench formation | Untouched control47650 differing pixels. | Same16 bodies with current shadow tier. | Same causal diagnostic. **carried-in** |
| Workbench submission-parity, both assertions | Untouched control5652 differing pixels each. | Current shadow tier; battle/manual output remains identical. | Same causal diagnostic. **carried-in** |
| Workbench controls | Untouched control1602 differences; new checkbox99477 against old baseline. | Legible added row; current production shadow. | Existing shadow delta plus intentional panel layout change. **moved** |
