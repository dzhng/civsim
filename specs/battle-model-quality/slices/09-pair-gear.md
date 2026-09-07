# 09 — First-pair equipment geometry

Status: IN PROGRESS, candidate authoring only. Source fitting uses the provisional
[08](./08-anatomy.md) body/rig; acceptance still depends on completed08 and its07
envelope. Body or rig changes require refitting and recapturing affected gear.

Author heavy sword0 first and review its complete neutral-clay kit before using
it as the working convention for medium phalanx14 and related equipment states.
Candidate surfaces and locomotion may proceed on a fixed geometry/rig revision;
they do not accept that revision or excuse its defects. Curved helmet/shield, layered
garment, belt, sword/scabbard and footwear form the first recognizable candidate.
Mail surface finish belongs to10. No production promotion or accepted baseline
is implied by this source-authoring checkpoint.

## Contract and ownership

Heavy sword and medium phalanx read as distinct roles through shape and attachments.

API seam: Blender modular equipment on human rig; appearance IDs 0,14 and related rest/sidearm render variants 17,19.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Neutral-clay sheets and small formations with curved helmets/shields, layered armor, sword/scabbard, correctly held long pikes and two-hand grips.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Equipment silhouette**.

Crop/mask: Head/torso/shield/pike masks at fixed close and gameplay cameras; surface colors/maps held neutral.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

No floating gear, disconnected hands or pike clipping through body during fixture bends; attachment/bounds probe includes pike tip. Compare supplied reference; no palette-only class distinction.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/09/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Historical styling within reference: heavy mail versus medium leather. Pike/shield relative dimensions may be refined visually without changing sim reach or hitboxes.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

## Current authoring checkpoint

Heavy infantry has an editable Blender kit and production-rendered candidate
sheets. It remains **unaccepted**. The retained suspended scabbard is documented
in its [focused review](../assets/evidence/09/scabbard-suspension/review.md);
thin rear straps remain open but are not the next dominant silhouette problem.
The [combined helmet refit](../assets/evidence/09/combined-helmet/review.md)
replaces the closed bowl and buried plates on the integrated head. Author the upper-body garment as
one coherent worn assembly: shoulder coverage, neckline, underarms, sleeve ends
and hanging hem. The whole soldier must improve visibly, not only a detail crop.
Follow with actual sword/shield grips and bent/pronated arm deformation before
propagating equipment conventions to the phalanx. Further isolated facial detail
is lower priority; that does not accept unfinished anatomy.
The [candidate review](../assets/evidence/09/heavy-kit-review.md) owns source
iterations, exact captures and the independent failure verdict. Do not propagate
unresolved heavy defects into the phalanx or treat the cloth-covered body as08
acceptance. Independent candidate work retains explicit refit/rebake obligations.

From the repository root, build/export with installed Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-heavy-kit.py
node packages/soldier-assets/bake/heavy-kit.mjs
VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 node web/scene.mjs heavy-kit
```

The Vite server must serve this worktree. Use the normal production workbench with
`catalog=/assets/soldiers/candidates/heavy-kit/catalog.json` for manual inspection.
The build consumes the committed08 `.blend`; fitting must be revisited when that
source changes. Root owns human Preview presentation after integration.
