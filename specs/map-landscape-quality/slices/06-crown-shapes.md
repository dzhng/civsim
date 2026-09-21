# 06 — Shared tree crown representation

Status: shared crown assets and campaign consumer accepted; TypeGPU battle consumer integration open. Depends on 01; regional planting and environment remain in 07/10.

## Contract

Both map pitches use the shared scenery registry and the same connected crown geometry. Close leaf surfaces add detail over that volume, so minification cannot hollow out a tree. Instance identity selects a stable variant; projected size chooses detail with hysteresis. Visible and shadow cutouts use one mask.

The accepted character is a solid, irregular canopy with readable lobes and connected trunks. Broad families use fewer main lobes; narrow aspen retains fuller coverage. Leaves intersect the crown instead of forming a loose fringe. Species dimensions and instance scale remain unchanged. Fixed geometry budgets and family/detail draw buckets are preserved.

## Acceptance state

| Accepted | Remaining | Evidence |
| --- | --- | --- |
| Shared connected crown design and campaign consumer; family sheets and campaign regional review | Preserve these results unless asset changes require their scoped gates again | [Model evidence](../assets/crowns/finish/README.md), [regional evidence](../assets/crowns/finish/integration/README.md) |
| TypeGPU visible/shadow leaf atlas and cutoff consistency | Stable variant selection and projected detail with hysteresis in the battle consumer | [Coverage/shadow checkpoint](../assets/slice-13/coverage-shadow/README.md) |
| Historical battle crown appearance through the retired backend | Current TypeGPU both-pitch/detail/return coverage and fresh production review | [Battle adoption](13-battle-adoption.md), [integrated matrix](15-acceptance.md) |

Battle still builds the default variant at full leaf detail. Finish that consumer
without redesigning the accepted crowns or changing placement policy. The common
leaf cutout is complete; it is a regression guard, not another implementation task.
Minor leaf fragments and scratchy conifer strokes were accepted at native campaign
size. Concealed trunks do not by themselves prove detachment.

## Protected scope

This accepts tree form, coverage and attachment, not forest density, tree-to-mountain scale, ground clutter or landscape shadow extent. Those remain with 07 and 10. Campaign and battle keep their placement policies while sharing asset identity and representation policy; drawing remains backend-local. Future asset changes must repeat the family and both-pitch consumer gates through the existing snapshot primitive, then use an unprimed screenshot critique before acceptance.
