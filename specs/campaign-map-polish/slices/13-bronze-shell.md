# 13 — Bronze shell + single-root convergence

**Contract unlocked:** the campaign DOM shell wears the battle bronze material,
and the two parallel mount systems are converged onto one single-root imperative
architecture (locked decision 5 — David: "use the same react component
architecture as well"). This is the proof-of-look checkpoint and unblocks the
city card (17).

## API seam (single owner — bronze tokens invariant 6; UI root invariant 8)
- Import `web/src/ui/theme/bronze.css` into the campaign surface. Replace the
  slate webapp `<style>` in `web/src/campaign/panels.ts` `campaignDomHtml()`
  (53-139) — semi-transparent `.cmp-top`, floating rounded `.cmp-panel`, slate
  pill buttons — with `.hud-chassis` / `.hud-chassis--tray` housings + bronze
  tokens. **No brass variant, no forked token file.**
- **Root convergence:** today two systems mount campaign React: `scene.ts`
  (`campaignDomHtml`, game — roots at 746-750) and `uiLayer.ts` (`CampaignUiLayer`,
  the `/renderer` lab — roots at 67-70). Introduce `mountCampaignHud(container,
  cb)` analogous to `BattleHud.tsx`'s `mountBattleHud` (single root, `forwardRef`
  stateful islands, imperative `useImperativeHandle` + `flushSync`). Both the game
  and the lab resolve the same shell so bronze can't drift.
  - **Recorded fallback (Planner B):** if the single-root port proves too costly
    mid-build, keep multi-root and only share a bronze *shell factory* both callers
    invoke — the bronze look does not depend on root count. Record the call here
    if you take the fallback.
- **Firewall:** chrome material + mount topology only — zero campaign logic/data
  change. Battle HUD scenes are a HARD firewall (shared `bronze.css`).

## What the human can see
- New scene `campaign-ui-bronze-shell`: the empty campaign shell + panel housings
  in bronze.

## ★ Human checkpoint (non-blocking)
Open the bronze shell shot with **preview-shots**; David confirms the campaign
chrome now reads like the battle HUD. If silent ~5 min, decide on the
compare-vs-battle evidence, record, proceed.

## Verification
- **compare-screenshots** vs a battle HUD shot (token/housing identity) and vs the
  aesthetics `ui-cardbar-tw.png`.
- **screenshot-critique** last — must show NO webapp tells (transparency, floating
  rounded cards, slate pills, no frame).
- `web-design-guidelines` review on the converted markup.

## Stay green
- Battle HUD scenes (shared `bronze.css` must not regress); the `/renderer`
  campaign-lab scene; all campaign panel interaction scenes.

## Feedback that would change this slice
- If David finds the single-root port destabilizing, take the recorded multi-root
  fallback and note it.
