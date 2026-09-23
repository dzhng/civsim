# Material region probe

Rejected; no production code or baselines change. The bounded candidate adjusted
partially exposed rock with broad triplanar breakup, added loose-stone coverage
at the transition, and lightened neutral rock/scree values. Existing geometry,
fine normal detail, planting, environment and water were fixed. The exact patch
is retained only to make the comparison reproducible.

The target was readable regional grass/bedrock/scree separation and naturally
broken transitions. The [fresh critique](critique.md) finds a small improvement
in rock/grass contrast, but no convincing third material or regional geological
structure. The close boundary remains evenly feathered and the face remains
cloudy. The candidate is therefore removed rather than retained as another
marginal checkpoint. Increasing palette contrast or broad mask noise alone is
not supported as the next solution.

Both regions and near/far fixtures use the existing frozen routes, 1280×800 DPR1
and SwiftShader. Six material/region snapshots change as expected. Campaign and
battle equivalent inputs have identical RGBA; authored semantic tint and source
geometry controls pass. The water snapshot has zero changed pixels and both
consumers sample [76,134,151]. GPU validation and page errors remain clean.
The scene selector also ran the geographic overlay fixture; its functional
checks pass, but newly created local shots are not accepted baselines.

[Comparison telemetry](comparison/visual-parity-diff.json) locates the changes;
it measures distance from the previous output, not reference quality. Regional
grayscale MAE is 5.96 (Alps) and 3.14 (Italy); near/far is 1.47/0.18. This largely
brightness-driven movement agrees with the visual finding. The Alps full-frame before/candidate pair is retained beside the report;
redundant rejected-probe frames and crops were removed during closeout.

Both TypeScript checks and targeted lint pass. 499 CPU tests passed in the full
run; two suites initially lacked sparse-checkout fixtures, then their existing
six tests passed after restoring those inputs. No tests or thresholds changed.
[Independent static review](code-review.txt) found no actionable issue. No
hardware performance or repeat-baseline claim follows from this rejected pass.

Review shape: the experiment changed only the existing material/profile owner,
without new APIs, schemas, texture assets, dependencies or gameplay behavior.
Reverting it leaves no maintained implementation or new decision to inherit.
