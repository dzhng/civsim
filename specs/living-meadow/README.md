# living-meadow

Bring the CodePen "ghibli" meadow's **look, far-horizon LOD grass, wind feel, and
procedural ambient sound** into civsim's **battle** renderer — evolving the grass
we already own, and standing up a net-new ambient-audio subsystem.

Reference (MIT, © Lentils): `assets/pen-source/index.html` (a WebGL/GLSL demo — a
*recipe*, not a drop-in; we render WebGPU + TSL). Hero target David wants to hit:
`assets/pen-reference-hero.jpeg`.

---

## Next Agent Prompt

**Status:** 2026-07-26 late — DONE + committed on `living-meadow`: `00 01 02 03 20 21 22 23 24 25`
(spike verdict: **EVOLVE**, fresh port deleted; slice 03 translucency landed with
magnitude judgment deferred to 04/08 — see its slice file's gate history).
`26` (audio battle integration) is IN FLIGHT via codex on the lm-audio worktree.
**Process:** two lanes — grass = worktree `civsim-living-meadow` (branch
`living-meadow`, vite :5185), audio = worktree `civsim-lm-audio` (branch
`lm-audio`, vite :5186); codex (gpt-5.5, workspace-write, prompts via files)
implements, the orchestrator owns browser gates (capture.mjs in the session
scratchpad; CANVAS_ONLY=1 for byte-stable canvas shots), unprimed critiques,
review, commits, and lane merges (merge lm-audio into living-meadow after each
audio pass; sync back before the next audio slice).
**Pick up at:** integrate `26` when its codex run lands (verify in-battle by
scene run + snapshot neutrality, commit on lm-audio, merge). Then grass `04`
(color ramp — non-blocking David sign-off under golden-hour AND overcast),
`05` density (owns far-density constants + near-bald-ground gap + ground
underlayer idea), `06` silhouette (flat-tip fix), `07` wind motion (windSignal
GPU uniforms + write-vibe GIF gate), `08` fog, `09` cutover, then `40`/`41`
perf, whole-spec review, ledger consolidation, close-spec.
**DEBTS:** (1) battle grass-scene snapshot baselines not swept since slice 03's
shader change — battle-genmap-clay (grass-free) passed 0px; a grass-bearing
scene sweep + deliberate re-bless is owed BEFORE slice 09. (2) Audio ships
default-muted (provisional, David to flip).
**Probe verdicts banked:** R2 wind-RT viable (analytic uniforms first for 07);
R3 backlight on MeshStandardNodeMaterial emissive, no cheap shadow scalar;
R4 node-web-audio-api OfflineAudioContext gate; R5 gesture gate proven.

**Read first:** this README top-to-bottom, then the two foundation slices (`00`,
`01`), then the spike (`02`). Skim `specs/done/battle-map-reference/README.md` for
the prior grass spec's hard-won rules (do not re-litigate them).

**Hard constraints that will bite you if ignored:**
1. **Determinism.** The TSL `time` node is banned in this renderer; all animation
   keys off `PhotorealWorld.setTime`/`uTime`. The ported wind field **must** be a
   pure function of that scalar (GPU uniforms authored CPU-side), never
   `performance.now()`/wall-clock. Violating this silently breaks every screenshot
   baseline. Audio is exempt (it runs on the real `AudioContext` clock and is
   outside every snapshot path).
2. **One-visual-variable-per-slice** with one named comparison crop, judged at the
   right camera (blade anatomy at the *close* gate ≈12 px/blade; integration at the
   *vista*). This is a ratified rule from `battle-map-reference`.
3. **Single owners** — see the ownership table below. No slice may fork wind, the
   palette, the grass record schema, the aerial-perspective owner, or the tonemap.

**Every visual slice** ends with a mandatory unprimed
[screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md) told
exactly which variable it may judge, plus
[compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md) against the
owning crop of `assets/pen-reference-hero.jpeg`. Motion slices use
[write-vibe](../../.claude/skills/write-vibe/SKILL.md) GIFs. **Every audio slice**
ends with an `OfflineAudioContext` RMS/FFT assertion (headless capture has no
sound) plus a manual by-ear check on the audio lab route.

**Before you end your pass:** update this section (status, pickup point, blockers)
and tick the TODO checklist below.

---

## Locked decisions (David, this conversation)

| # | Decision |
|---|---|
| D1 | **Spike both** grass approaches (evolve `PhotorealBladeFieldLayer` vs fresh TSL port) in renderer-lab; choose by screenshot-vs-hero + FPS. Plan does **not** pre-pick. |
| D2 | **Perf is a later slice**, not an early gate. "Beat 26 fps" is a loose floor (26 was the *whole pen* on WebGL, not our engine). Look first. |
| D3 | **Ambient audio** is in this spec as a parallel track: procedural Web Audio ported from the pen — **wind, grass-rustle, birds, water only**. Combat/unit SFX, train, footsteps, music are **excluded** (future spec). |
| D4 | **Battle only.** Campaign map is a separate render path — deferred. |
| D5 | **No backcompat, no migrations** — hard cutover; delete the loser and the old wind path. |

Aesthetic caveat (surfaced by the risk-first draft, accepted): civsim's north star
is **Bronze-Age Aegean / Total War Saga**, and the pen is **Ghibli**. We take the
pen's look as **lighting + environment**, keep blade **albedo neutral**, and put a
non-blocking **David sign-off** on the color slice (`04`) judged under our
`golden-hour`/`overcast` presets — so we don't repaint the battlefield's art
direction by accident.

---

## Single-owner concepts (no slice may fork these)

| Concept | Owner | Read by | Anti-pattern killed |
|---|---|---|---|
| **Wind signal** | NEW `packages/game-renderer/src/battle/windSignal.ts` — `sampleBattleWind(x,y,t)`, `windProfile(h)` (pure, deterministic off `setTime`) | grass GPU uniforms (`07`), audio CPU (`23`) | the inline `sin()` constants in `bladeFieldLayer.ts`; three divergent wind copies |
| **Time** | EXISTING `PhotorealWorld.uTime`/`setTime` | wind signal, grass, audio *modulation* | TSL `time` node / `performance.now()` breaking determinism |
| **Frame `dt`** | NEW: threaded through the battle `frame()`→layer/audio update (added in `00`) | stateful wind, audio director | rAF-derived dt recomputed in two places |
| **Blade palette** | EXISTING `packages/game-renderer/src/battle/meadowPalette.ts` `MEADOW.blade` (extend 3→5 stop + `trans`/`sheen`/`dry`) | grass material | a second palette literal in the fresh port |
| **Grass record contract** | EXISTING `grassField.ts` (16-float / 64-byte, `STRIDE_FLOATS=16` + literal `/16` in the compute dispatch) | both spike candidates | a parallel record schema; a silent stride change |
| **Grass layer contract** | NEW interface `MeadowGrassLayer` (ctor/`applyPackedRecords`/`routeGpu`/`stats`/`setVisible`) | `PhotorealBattleWorld`, lab A/B | two divergent layer APIs; a messy cutover |
| **Aerial perspective / fog** | EXISTING `scene.fogNode` (one owner) | grass fog slice (`08`) | grass-local fog |
| **Tonemap / grade / bloom** | EXISTING AgX + `BattlePostChain` | look-grade | Ghibli grade smeared into the grass material |
| **Ambient audio** | NEW `packages/ambient-audio` — `AmbientAudioEngine` + `AmbientAudioDirector.update(MeadowSoundscapeInput)` (the ONE per-frame seam) | battle boot (`web/src/battle`) | audio entangled in the render loop; untestable Web Audio |
| **Audio mix** | NEW `AudioMixer` (master vol, mute, ramped submix) | every voice | ad-hoc per-voice gain writes / click artifacts |

**End-state invariant:** after `09`+`26`, the battle reads as designed today — one
wind source feeds eye and ear, one aerial owner, one palette, one grass layer, the
old single-`sin` wind path deleted. No parallel abstraction survives the cutover.

---

## Slice graph

```
FOUNDATION (winner-agnostic; no visual verdict)
  00  lab fixture + dt seam + TSL/audio feasibility probes
  01  windSignal: shared CPU wind source-of-truth + determinism proof

GRASS TRACK (each slice runs on the spike winner; one visual variable each)
  02  SPIKE  evolve vs fresh TSL port  ── verdict picks the substrate, deletes loser
  03  translucency (backlight rim + subsurface)      crop: backlit close
  04  color / 5-stop ramp   [David sign-off]         crop: mid-field gradient
  05  density-to-horizon LOD                          crop: vista horizon band
  06  blade silhouette / soft tip                     crop: near-field foreground
  07  wind motion on grass   ●── join: windSignal ──● GIF: gust front sweeps
  08  fog / horizon dissolve (via scene.fogNode)      crop: full-depth vista
  09  production wire-in (hard cutover, delete loser + old wind path)

AUDIO TRACK (parallel from t0; ambient-only; no dependency on the spike)
  20  engine skeleton: ctx lifecycle + master + mixer + autoplay + Offline test
  21  wind bed (+ rustle)
  22  reverb + master voicing
  23  director wind coupling  ●── join: windSignal (+ tightened by 07) ──●
  24  water bed (lake/ocean distance + pan)  ●── join: seaLayer surfaces ──●
  25  bird scheduler (self-clocked, voice-capped)
  26  battle integration + settings + teardown (gesture unlock, mute on blur)

PERF (deferred per D2 — designed now, run after the look lands)
  40  grass perf-tune (quality ladder; measured on named hardware)
  41  audio CPU-budget audit (bed floor O(1); bird voices capped, no leak)
```

**Join points:** (1) `windSignal` → grass `07` + audio `23`, tightened so a visible
gust and its whistle arrive together; (2) `seaLayer`/`lakeSurfaces`/`oceanPlanes` →
audio water `24`; (3) frame `dt` (`00`) → stateful wind + all audio; (4) the
`graphicsSettings` quality ladder → grass `40` + audio `41`.

**Suggested landing order:** `00`+`01` (+ `20` in parallel) → `02` spike → `03`/`04`
while `21`/`22` land → `07`+`23` (wind join) → `05`/`06` + `24`/`25` → `08` → `40`/`41`
→ `09`+`26` production wiring.

---

## Kill-shot risks (front-loaded)

| # | Risk | Burned down by | Evidence that kills/confirms |
|---|---|---|---|
| R1 | Neither grass approach reaches the hero look at acceptable cost | `02` spike | compare-screenshots best-of-both vs hero + unprimed critique + FPS ≥ 26 floor. Both miss badly → replan grass track. |
| R2 | TSL can't express the **wind render-target** (write + sample + analytic fallback) | `00` probe; `07` reslice | Lab spike writes a HalfFloat target from a node material, samples it in the grass position graph. If it stalls → analytic gust-bands only (the sweep is the deliverable, the RT is one way to get it). |
| R3 | TSL can't cheaply add **subsurface backlight** to our env-lit `MeshStandardNodeMaterial` | `00` probe → `03` | Tiny spike: `dot(V,-sun)`+Fresnel emissive rim on one blade patch. Impossible cheaply → transmission becomes a faked emissive rim (decided at the probe, not discovered at `03`). |
| R4 | Web Audio can't be **verified in headless CI** (no audio capture) | `20` | `OfflineAudioContext` render → RMS/band-energy assertion in vitest. If it fails, the audio gate is declared "manual-listen + node-graph unit assertions only." |
| R5 | Autoplay gesture + our frame loop don't fit a live `AudioContext` | `20`/`26` | `ctx.resume()` from the battle start gesture unlocks; per-frame `dt` drive available (from `00`). |
| R6 | Ghibli palette can't reconcile with Aegean environment presets | `04` | 5-stop ramp under `golden-hour`/`overcast`; **David sign-off**. |
| R7 | Battle has no river; water-audio source unclear | `24` | Retarget to `lakeSurfaces`/`oceanPlanes`; scope to water-adjacent maps or cut on landlocked maps. |
| R8 | Fresh TSL port scope balloons | `02` reslice | Timebox the fresh-port proof; if it overruns, **evolve wins by default** and the port is recorded as a rejected primitive. |

---

## What must stay green throughout

- **Cargo sim tests** — untouched (this is renderer + a new audio package).
- **Existing battle / turf screenshot baselines** at fixed `?t=` — byte-stable until
  a slice deliberately re-blesses them (`04` re-blesses turf that shares `farGrass`;
  `05`/`07` re-bless vibe GIFs; `08` re-blesses vista; `09` re-blesses battle).
- **The `battle-grass*` mesh-name isolation contract** (`?only=…battle-grass…`).
- **`grassField.ts` record contract + draw-indirect stats invariants** (the
  close-gate blade-anatomy oracle) — whichever spike candidate wins must not regress
  it.
- **The single-owner invariants** in the table above.

---

## Layout

- `README.md` — this file (spine + handoff).
- `slices/NN-*.md` — one independently verifiable slice per file.
- `assets/pen-reference-hero.jpeg` — the hero target David supplied.
- `assets/pen-source/` — the full MIT pen (reference recipe; **not** shipped code).
- `visualizations/` — roadmap diagrams / harness mockups (added as needed).

---

## TODO checklist

Foundation
- [x] `00` lab fixture + `dt` seam + probes (R2/R3 here; R4/R5 via `20`)
- [x] `01` windSignal source-of-truth + determinism proof

Grass
- [x] `02` SPIKE — verdict: EVOLVE (fresh deleted; evidence in slice file)
- [x] `03` translucency (magnitude re-judged at 04/08)
- [ ] `04` color / 5-stop ramp — **David sign-off**
- [ ] `05` density-to-horizon LOD
- [ ] `06` blade silhouette / soft tip
- [ ] `07` wind motion on grass (join → windSignal)
- [ ] `08` fog / horizon dissolve (via `scene.fogNode`)
- [ ] `09` production wire-in (hard cutover)

Audio
- [x] `20` engine skeleton + Offline test harness (commit 833801df, lm-audio)
- [x] `21` wind bed (+ rustle)
- [x] `22` reverb + master voicing
- [x] `23` director wind coupling (join → windSignal)
- [x] `24` water bed (join → seaLayer)
- [x] `25` bird scheduler
- [ ] `26` battle integration + settings + teardown

Perf (deferred, D2)
- [ ] `40` grass perf-tune
- [ ] `41` audio CPU-budget audit
