# Campaign Map Polish

Polish the campaign map (the grand-strategy overworld) from David's screenshot
feedback: fix visual bugs, recolor to a natural antique-chart palette, redesign
the on-map city info UI, and convert the campaign DOM UI to the battle **bronze**
style and React architecture.

This spec was cut from three independent draft passes, synthesized into one
ladder. The recon that seeded them (exact fix-sites for every item) is baked into
the slice files.

---

## Next Agent Prompt

**Status:** 2026-07-03. DONE & committed: 00–06, 11 (foundation look, camera,
carts, road-cull relax, data diagnosis) + the 10→08 reslice. Foundation presented
at its checkpoint; David away, proceeded on evidence (palette + 0.35 wash kept).
Next is `07` mapgen re-bake (Rust build — a clean fresh-context boundary; the fix
targets are recorded in the slice file).
**You are implementing this spec.** David's standing goal: work through the
slices in order and **use `/codex` for implementation work wherever possible**
(delegate the mechanical edits to Codex via `codex exec`; you drive verification,
screenshots, and the human checkpoints yourself).

**Next pickup point (two independent clean starts):**
- `07-mapgen-rebake`: the Rust fix + JSON re-bake. Fix targets are in the slice
  file (snap 37 on-water ports to land + Cnidus, drop 17 stubs/83 dead junctions/
  25+5 orphan road components). Confirm the re-bake command
  (`cargo run -p mapgen --release`) writes `web/public/data/campaign-map.json` +
  dist copy, then `bun run build:wasm`. Re-bless position scenes only.
- `08-capital-labels`: occupied-capital names at low zoom + garrison label-far +
  the garrison-disc "shadow ring". Diagnostic groundwork done (see slice file: the
  disc is a light ground decal specific to garrisoned cities).

Remaining after those: `09` sea labels, `12` selection ring, `13–15` bronze UI,
`16–18` city card + allegiance re-channel, `19` docs.

**Reliable verification recipe (proven this session):** start your own dev server
`cd web && node node_modules/.bin/vite --port 5199 --strictPort &`; iterate visuals
with the standalone probe at `scratchpad/probe.mjs` (fresh browser, no baseline
machinery — dodges the HMR-lag that makes the scene runner show 0-diff right after
a shader edit); gate with `VERIFY_URL=http://localhost:5199 VERIFY_GPU=1 node
scene.mjs <scene>` and bless with `UPDATE_SHOTS=1`.

**Verification setup (learned in slice 01 — READ THIS):**
- The scene runner (`cd web && node scene.mjs <scene>`) targets a dev server at
  `VERIFY_URL` (default `localhost:5173`). **5173 is occupied by another
  worktree's server** — always start your OWN dev server for this tree and target
  it: `cd web && node node_modules/.bin/vite --port 5199 --strictPort &` then
  `VERIFY_URL=http://localhost:5199 VERIFY_GPU=1 node scene.mjs <scene>`. Verifying
  against the wrong server silently tests stale code. (A dev server on 5199 may
  already be running from slice 01.)
- Bless baselines with `UPDATE_SHOTS=1`; filter with `SNAP=<substr>`.
- Codex's sandbox can't bind localhost, so it can't run scenes — delegate the
  code edit to Codex (`codex exec --sandbox workspace-write`), then YOU run the
  scene + screenshot-critique.

**Slice 01 notes:** camera clamp now uses the real frustum footprint (`screenToWorld`)
instead of an orthographic `cosP` estimate — the projection is the single owner.
The raised `minZoom` shifted `campaign-lod`'s `whole-*` shots (map now fills the
frame); those baselines were re-blessed. Foundation (02–04) will re-bless again for
palette. New scene: `campaign-frame` (asserts no off-map black at wide/tall aspect).

**How to work each slice:**
1. Read the slice file. Confirm the seam in the real code.
2. Delegate the edit to Codex (`/codex`) when the change is well-defined; review
   its diff.
3. Rebuild if you touched `crates/` (`bun run build:wasm`) or re-baked mapgen.
4. Run the slice's verification scene (`cd web && VERIFY_GPU=1 node scene.mjs
   <scene>`), inspect the PNG, run **screenshot-critique** (unprimed second
   opinion) as the last check on any visual shot, and **compare-screenshots**
   whenever there's a target/prior look to judge against.
5. At a human checkpoint: open shots with **preview-shots**, give David ~5 min,
   and if silent decide on the evidence, record the decision + rationale here,
   close the shots, and proceed. Never block the build on sign-off.
6. Update this section (status, next pickup, checklist) before ending your pass.

**Active warnings:**
- Foundation (02–04) **re-blesses the entire campaign snapshot baseline set** at
  the Foundation checkpoint. Every later visual slice diffs against the new
  palette — do not bless downstream baselines before the checkpoint passes.
- Camera (01) lands before the foundation review so foundation shots aren't
  captured through black corners; but 01 is a *mechanical* gate, not the human
  checkpoint (locked: foundation is the first human checkpoint).
- The mapgen re-bake (07) is the only cross-cutting serialization point — it
  regenerates `web/public/data/campaign-map.json` (+ dist copy) and shifts city
  positions; re-bless position-asserting scenes only after it lands.
- Bronze DOM edits touch the shared `web/src/ui/theme/bronze.css` — **battle HUD
  scenes are a hard firewall**; keep them green.

### Global TODO checklist
- [x] `00-setup` — scaffold + palette reference copied to aesthetics references
- [x] `01-camera-clamp` — real-frustum-footprint clamp; no off-map black; zoom-ceiling const unified
- [x] `02-terrain-grade` — global grade muted (sat 1.06→0.84, wash removed, warmed)
- [x] `03-terrain-biomes` — grass hue kelly→olive; baselines re-blessed
- [x] `04-faction-fill` — de-mud (tint removed, 3 alpha owners → 1 = pass alpha 0.35)
- [ ] ★ **Foundation human checkpoint** (David) — shots presented; awaiting review, proceeding on evidence
- [x] `05-roads-cull-relax` — cull 0.68→0.5, land slack 10.5→16; +516 road tris recovered, none over water
- [x] `11-cart-size` — carts 6.0→1.3 (road width)
- [x] `06-data-diagnosis` — DONE: 0 misplaced non-port cities; 36 ports at waterline + Cnidus (14km) the one real bug; roads = 17 stubs/83 dead junctions/25+5 orphan components (all in slice files)
- [ ] `07-mapgen-rebake` — one Rust fix + one re-bake: snap on-water ports to land (+ Cnidus override), drop road stubs/orphan components. Targets recorded in slice file.
- [ ] `08-capital-labels` — occupied-capital name at low zoom + garrison label-far fix
- [ ] `09-sea-labels` — mask-fit so labels stay inside their sea with margin
- [~] `10-shadow-ring` — RESLICED: the ugly "ring" is the garrison-footprint disc (occupied cities only), folded into `08`; city model shadow reads fine, left as-is
- [ ] `11-cart-size` — carts ≈ road width
- [ ] `12-selection-ring` — brighten/thicken + drape over terrain height
- [ ] `13-bronze-shell` — bronze tokens + shell + single-root convergence (proof-of-look checkpoint)
- [ ] `14-bronze-topbar` — top bar → bronze wells, Phosphor icons, no emoji
- [ ] `15-bronze-panels` — City/Army/Diplomacy/ClassBuilder/Sieges → bronze (sub-sliced)
- [ ] `16-city-card-design` — HTML contact sheet, 2–3 variations (human checkpoint)
- [ ] `17-city-card-impl` — own-city bronze card as DOM overlay (garrison strip below)
- [ ] `18-allegiance-rechannel` — enemy red sword + icon→faction flip, atomic (no signal gap)
- [ ] `19-aesthetics-doc` — palette target + rewritten two-color rule (lands after its code)

---

## Locked decisions
1. **One spec** — everything here; bronze-UI is a slice-group inside it.
2. **Exact battle bronze** — campaign DOM reuses `web/src/ui/theme/bronze.css`
   tokens and the battle components (`HudPanel`/`Toolbar`/`Tooltip`). No brass
   variant, no forked token file.
3. **Roads fixed at both layers** — renderer cull relax (05) *and* mapgen stub/
   fragment cleanup + re-bake (07).
4. **Foundation look is the first human checkpoint** — terrain palette + faction
   fill gate every later screenshot.
5. **React architecture** — David asked to "use the same react component
   architecture as well," so campaign adopts battle's **single-root imperative-
   handle** mount (a `mountCampaignHud` analogous to `mountBattleHud`), retiring
   the two parallel `createRoot` mount systems. *Recorded alternative (Planner B):
   keep multi-root and only share a bronze shell — fall back to this if the
   single-root port proves too costly mid-build; the bronze look does not depend
   on the root count.*

## Slice ladder (dependencies)
```
00 setup ─┐
01 camera │  (mechanical gate; before foundation review)
          ▼
02 grade → 03 biomes → 04 faction-fill ──► ★ FOUNDATION CHECKPOINT (re-bless baselines)
                                              │
   ┌──────────────────────────────────────────┼───────────────── parallel after foundation
   ▼                    ▼           ▼          ▼            ▼
05 roads-cull      08 capital    10 shadow  11 cart     13 bronze-shell
   ▼                  labels      ring       size          ▼
06 diagnosis (human) 09 sea-labels          12 sel-ring  14 topbar → 15 panels
   ▼                                                        ▼
07 mapgen re-bake                                    16 card-design (human)
                                                            ▼
                                                     17 card-impl  (needs 13 tokens)
                                                            ▼
                                                     18 allegiance-rechannel
                                                            ▼
                                                     19 aesthetics-doc (part 2 after 18)
```
The mapgen re-bake (07) is the one serialization point (shifts positions). City
card (17) depends on bronze tokens (13). The icon→faction flip lands **atomically**
with the card/sword replacement (18) so allegiance is never unreadable mid-build.

## Refactor-clean — single-owner invariants
The plan must read as the shape the code would want if designed today, not the
old shape with fixes bolted on. Each concept has **one owner**; no slice may fork
a parallel abstraction or leave a compatibility layer a later slice must delete.

1. **Map projection** — `crates/mapgen` (`geo.rs` Lambert + `sources.rs project`);
   `node.pos` is read verbatim on the frontend. No frontend coordinate transform
   may appear (07 fixes in-pipeline or via `overrides.json`).
2. **Terrain palette** — `grade()` + `naturalCampaignColor()` in `mapPass.ts` is
   the one color path. The faction fill (04) must not re-tint terrain to
   compensate.
3. **Faction-fill material** — net alpha is today a product of THREE owners
   (`territoryPass __TERRITORY_ALPHA__` × renderer `alpha` × `territory.ts FILL_A`).
   04 collapses to **one** authoritative knob and neutralizes the others. All C
   tweaks live in this material.
4. **Label / marker system** — the `CampaignLabel[]` emitter (`campaignCityLabels`/
   `campaignArmyLabels` → drawn in `mapPass`) is the one owner for items E/F/G/
   I-label. The own-city DOM card (17) *moves* own entries out of the canvas pass
   into a DOM overlay — never drawn by both, never a parallel React city loop.
5. **World→screen projector** — `renderer.toScreen()` already exists; the DOM
   card reuses it, not a parallel anchor computation.
6. **Bronze token set** — `web/src/ui/theme/bronze.css` is the one owner (locked).
7. **Zoom-ceiling `8`** — duplicated at `scene.ts:501` + `renderer.ts:161`; 01
   collapses to one exported constant.
8. **Campaign UI root** — two mount systems exist today: `scene.ts`
   (`campaignDomHtml`, the game) and `uiLayer.ts` (`CampaignUiLayer`, the
   `/renderer` lab). 13 converges them onto one single-root pattern so bronze
   can't drift between game and lab.

## Verification
- **Runner:** `cd web && VERIFY_GPU=1 node scene.mjs <scene>`; snapshot baselines
  in `web/shots/`; bless with `UPDATE_SHOTS=1`; filter with `SNAP=<substr>`.
  Ready-gates: `window.__campaignReady`, `__campaignGpuStats`, `__campaign`.
- **wasm:** `bun run build:wasm` after any `crates/` change.
- **mapgen re-bake:** `cargo run -p mapgen --release` (writes
  `web/public/data/campaign-map.json` + dist copy; runs leagues + prune-cities).
  *Confirm the exact invocation in 07 before running.*
- **Existing campaign scenes (reuse):** `campaign-lod` (snaps `whole-political`,
  `whole-natural`, `whole-fog`, `regional-italy-natural/-political`, `rome-close`,
  `selected-city`, `selected-army-city`, `border-fog`), `campaign-polish-markers`,
  `campaign-polish-roads`, `campaign-map-alignment`, `campaign-visual`, `water-sea`.
- **New scenes to add:** `campaign-frame` (01), `campaign-biomes` (03),
  `campaign-cities-onland` (07), `campaign-lowzoom-capitals` (08),
  `campaign-sea-labels` (09), `campaign-city-cards` (17),
  `campaign-ui-bronze-{shell,topbar,panels}` (13–15).
- **Standing visual gate (every visual slice):** run **screenshot-critique** as
  the last check on any shot; run **compare-screenshots** whenever there is a
  target (references) or prior look to judge against. These are not optional.

## Assets
- `assets/natural-palette-target.png` — David's TW:Troy target for the recolor
  (also copied into `.claude/skills/aesthetics/references/` in slice 19).
- `assets/feedback/` — the annotated feedback screenshots, named by concern.
- Reference targets in `.claude/skills/aesthetics/references/`:
  `campaign-map-political-borders.png` (faction-fill target),
  `campaign-map-aegean-wide.png`, `ui-cardbar-tw.png` (bronze UI target).
