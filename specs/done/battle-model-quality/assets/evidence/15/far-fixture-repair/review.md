# Projected far-fixture repair

This pass repairs verification inputs, not production LOD policy or model art. The frozen base is `2c25b775`. The earlier [upstream control](../../11/upstream-merge/far-control.md) already reproduced the stale failures before the upstream merge.

## Contract and choices

The scalar zoom hint does not determine physical projection. The shared fixture camera now changes the actual perspective field of view for far admission; a CPU consumer tracer checks production projected LOD selection. The original close camera is then restored without another crowd upload for explicitly magnified material inspection. This diagnostic is not a claim that far bodies are naturally large or that the atlas passes a complete LOD transition review.

The three added physical-far context images show the small admitted bodies on the complete ground patch. Existing near, diagnostic, roster and material snapshots remain in their original owners. Main impostors and mesh shadow casters are independent audiences: the magnified far images now visibly include mesh-caster shadows. Grounding property controls modify only the main bucket, preserving that shadow audience. No shader, asset, simulation, LOD threshold, pixel tolerance or default coverage is removed.

## Verification and disposition

- Root integration: source diff reviewed; representative full comparisons from
  all three fixture owners inspected directly, with the independent review
  covering all15. Merged run90245 passed all24 images/111 checks exactly and
  closed its browser; `merged.json` retains the result. The merged web suite
  passed383 tests/63files. No default image threshold changed.
- CPU red: `red.txt` shows the new production consumer expecting far L3 but receiving near L0 from scalar zoom alone.
- CPU green: 383 tests in 63 files passed, session40927 terminal0; typecheck86943 terminal0. An initial full-suite attempt lacked a sparse-excluded committed campaign probe; restoring that input resolved the setup failure without a code change.
- First browser13319 terminal1: all functional, allocation, material, handedness and immediate repeat checks passed; nine old snapshots differed. `first.json` retains the red result. No UPDATE was used. Three new physical-far baselines were created for subsequent review.
- Living grounding interior: 3557 samples, max/p99 channel error1; dead:3593, max/p99 1; precision:4018, max/p99 1. Active property control:4024 samples, max16, mean1.8877. Existing thresholds are unchanged.
- `old/` and `candidate/` preserve all nine paired full images. `exact-pixels.json` counts every differing decoded RGBA pixel, separately from the snapshot checker's anti-alias classification. For example front-near has3591 exact RGBA differences but3364 checker differences; neither is described as exact equality.
- Author inspected all nine full pairs, three unchanged near grounding controls, and all three actual-far context images. Complete body/weapon silhouettes remain; magnified far changes are predominantly added ground shadows. These blocky diagnostic assets are not accepted final art.
- Independent code review90644 found no actionable defect in the initial four-file scope. Follow-up88521 reviewed far-properties and the shared helper: no actionable findings; static tracing and syntax only, no browser or visual approval.
- Properties18506 terminal1/browser closed: all material, normal, faction, allocation and immediate repeat checks passed. Three near snapshots remain exact; six far snapshots differ, each13077 decoded RGBA pixels/max22. `properties-first.json` preserves that red result. All six full pairs and unchanged near controls were inspected by the author.
- Fresh neutral image review12733 terminal0 inspected all15 full pairs, their2x crops and3 distant contexts; exact verdict in `fresh-visual.txt`. B is less wrong in12 shadow-added pairs; three near/roster pairs are visually indistinguishable. No new missing geometry/equipment/depth defect was seen. The author agrees. Diffuse striped shadows, weak apparent contact and merged side-view limbs remain diagnostic limitations, not reasons to start cosmetic refinement. Two front crops clip a spear tip; their full originals contain it and are authoritative for completeness. Tiny true-far contexts prove framing/admission only.
- Root approved only the15 intentional old-baseline updates and3 new contexts. Session82081 terminal0 ran that selective UPDATE then a normal full24-image/111-check repeat: every snapshot0px, all immediate frozen repeats exact, all functional checks pass, no page errors. `update.json` and `repeat.json` preserve the distinction. All15 refreshed baselines decode exactly to the previously reviewed candidate images; the six unchanged near controls were not refreshed.
- One curated Preview window opened09:13:23UTC and was confirmed visible; it was closed after the five-minute interval at09:18:58UTC with no response. Its three images were the front far full pair, matte far full pair and true-far context. Silence is not user approval; this was a nonblocking functional checkpoint, not final-art approval.

## Changed assertion ledger

| Test / owner | Previous behavior | New behavior | Why / provenance |
| --- | --- | --- | --- |
| `farInspection.test.ts` projected admission tracer | No regression covered a close physical camera carrying a far zoom hint. | Actual production planner selects near L0 then visible far L3; source camera and orientation remain unchanged. | [agent] Red-first diagnostic of the reproduced stale fixture. |
| `battle-model-far-bundles.mjs` representation and snapshots | A scalar hint attempted far admission while the physical camera remained close. | Actual far admission plus two exact physical-context snapshots precede the existing magnified diagnostic. Independent mesh shadow audience is asserted. | [spec] Current projected main/shadow contract; [user] bounded fixture repair. |
| `battle-model-far-grounding.mjs` property controls and snapshots | Obsolete iterable buckets aborted after the first near image; far admission also used only zoom. | Main-bucket controls run, true far admission adds one context image, then existing magnified material thresholds run unchanged. | [spec] Main/shadow bucket ownership; [agent] reuse the shared admission helper. |
| `battle-model-far-properties.mjs` representation and matte control | Scalar-only far setup also persisted in the faction/seed reupload. | Both uploads use the same actual far projection before camera-only material magnification. Existing nine snapshots and material assertions remain. | [user] Extend the same bounded repair to the stale sibling fixture. |

## Reproduction

From `web/`, with the frozen source served on5475:

```sh
npm test
npm run typecheck
VERIFY_GPU=1 VERIFY_URL=http://localhost:5475 SCENARIO_REPORT_JSON=../throwaway/far-fixtures/first.json node scene.mjs battle-model-far-bundles battle-model-far-grounding
VERIFY_GPU=1 VERIFY_URL=http://localhost:5475 node scene.mjs battle-model-far-bundles battle-model-far-grounding battle-model-far-properties
```

Default bundled Chromium/SwiftShader, frozen clocks and existing shared snapshot owner are retained. The model-only scenes use the copied current WASM SHA256 `04aa7834b861ce266205f1072aec5b27ac2c53eaf76191f638221392f19497ce`; no simulation behavior is claimed. This closes the stale fixture failure, not slice15's complete production LOD/art/performance acceptance.
