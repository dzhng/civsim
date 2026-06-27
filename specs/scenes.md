# Spec: Scenes — one runner, 100% catalog-driven visual coverage

> Sibling spec: `specs/balance-harness.md` covers the Rust sim — a runtime-
> configurable balance surface + N-seed scene harness feeding a generated
> **balance** matrix (stats-vs-price) alongside the authored **behavior/physics**
> suite. This file is the *visual* half (web/pixels). Shared creed for the
> exhaustive parts: **tests are a generated projection of the source-of-truth
> registries, not a hand-maintained list.**

## Goal, in one sentence

Replace the three bespoke flat verify harnesses with one runner over
individually-runnable **scenes** — each either a `flow` case (a real-map
world asserting behavior) or a `visual` case (a fixture world asserting pixels)
— and make visual coverage *catalog-driven and gated to 100%*: enumerate every
renderable primitive from the same registries the renderer is built from, snap
each, and fail the run if any enumerable visual state has no baseline — so that
adding a unit class, status chip, terrain tint, or marker stance automatically
demands a screenshot and cannot ship uncovered.

This document is **proposed design** except where marked *(measured fact)* or
*(binding)*. Solve the problem; the file layout and `ctx` shape are a starting
point — deviate where the code disagrees. What you may NOT weaken: the locked
invariants in **What must NOT change**, and the *(binding)* coverage/mirror
gates — the 100%-or-fail property is the whole point, not a nice-to-have.

## The contract this unlocks

Today there is no way to run one visual case. Each of `web/verify-battle.mjs`,
`web/verify-campaign.mjs`, `web/verify-campaign-visual.mjs` is a flat
top-to-bottom script; to re-check `battle-initial` you run the entire 30k-
soldier battle harness (it marches units, fights a melee, runs an AI game).
The `SNAP=<substr>` env filter (in `web/snapshot.mjs`) is a stopgap — it skips
the *comparison* but the whole script still *drives*. Scenes make the setup
itself addressable: `node scene.mjs campaign-markers` boots only that world
and runs only its snaps.

Acceptance is behavioral parity, not new behavior: after the migration every
check that passes today still passes, every blessed baseline is preserved (or
deliberately renamed once), and `git status` is **clean after any run** — see
the contracts table.

## Context you don't have (read this; it is the whole reason)

*(measured fact)* A run writes two kinds of PNG today, and only one is a test:

1. **Blessed baselines** — `snapCheck(page, name, check)` (`web/snapshot.mjs`)
   writes `web/shots/<name>.png` (the harness picks the folder via `baseDir` or
   a folder-prefixed `name`), then every later run compares the
   live frame against it at **zero tolerance** and writes
   `web/shots/diff/<name>.png` (+`-actual.png`) only on failure. `shots/diff/`
   is the one gitignored path (`.gitignore:7`). There are 8 baselines:
   `banner-gallery`, `battle-initial`, `campaign-3d`, `campaign-political`,
   `tiny-overview`, `tiny-army-{our-city,road,neutral-city}`.
2. **Loose scratch shots** — bare `page.screenshot({ path: SHOTS + 'x.png' })`
   calls scattered through the harnesses (e.g. `verify-battle.mjs` writes
   `initial.png`, `manual.png`, `cavalry-plow.png`, `pivot-after.png`,
   `melee.png`, `cluster-before.png`, `cluster-after.png`, `ai-battle.png`).
   There are ~37 of these tracked under `web/shots/*.png`. **Nothing ever
   compares them.** They are overwritten every run, so any battle run leaves
   the tree dirty, and a leftover `git checkout -- 'web/shots/*.png'` is needed
   to clean up.

The scratch shots are the architecture smell that motivates this spec. They
are neither ground truth (no test reads them) nor transient output (they are
committed). The instinct to `.gitignore web/shots/*.png` is the wrong fix:
**a generated screenshot is only worth keeping if a test asserts on it.** The
right shape is — every screenshot a run writes is a `snapCheck` baseline; the
only PNG locations are the per-harness committed folders under `shots/`
(`scenes/`, `campaign/`, `vibe/`, `models/`, …) and `shots/diff/` (gitignored
transient). The top-level `shots/*.png` scratch dump ceases to exist. That makes the user's principle literally true: every shot under
version control is useful regression data.

Greppable anchors the implementer will need:
- The reporter pattern every harness repeats: `const check = (name, ok, detail)
  => {...}; const failures = []`, exit `process.exit(failures.length ? 1 : 0)`.
- World boots: battle `?map=A&ai=off` → `window.__ready` → `__game.freeze()`;
  real campaign menu → `#menu-new-campaign` → `window.__campaignReady` →
  `__campaign.freeze()`; test campaign `?campaign=test` →`__campaignReady`,
  page opened with `deviceScaleFactor: 2` (markers are snapped at 2× — see
  `verify-campaign-visual.mjs:29`).
- Debug seams scenes drive through (do not add more): `window.__game`
  (`stats/unitInfo/select/setOrder/advance/groupMove/freeze/...`),
  `window.__campaign` (`armies/cities/cam/freeze/place/orderMove/tick/
  battleReady/project/select/...`), the DOM-only banner gallery at
  `?test=banners`.
- The determinism discipline lives in `.agents/skills/screenshot-regression/
  SKILL.md` — fixed 1280×800 viewport, explicit camera, freeze the clock,
  snap on Day 1 before any `tick()`, wait ~250ms after a camera move. Every
  rule there must survive the migration; a scene that drops a `freeze()`
  goes flaky.
- Per-machine baselines *(measured fact)*: `battle-initial` fails ~0.22% on
  this headless SwiftShader Mac because its baseline was blessed elsewhere;
  the diff is sub-pixel AA wobble on unit silhouettes and the count drifts
  run-to-run (2244↔2268 px). `verify-battle.mjs:57` already carries
  `{ maxDiffRatio: 0.0008 }` for this. Scenes do NOT fix cross-machine
  rasterization — a scene may carry a named, justified `maxDiffRatio`, but
  re-blessing happens deliberately on the owning machine.

## Failed / rejected approaches — do not retry naively

- **`.gitignore web/shots/*.png`.** Hides the smell instead of removing it; you
  lose regression coverage on exactly the frames a human most wants to eyeball
  (deployment, melee, the AI battle). The user rejected this explicitly: "if
  you find yourself wanting to gitignore shots it points to a bigger
  architecture problem." Promote the worthwhile scratch shots to snaps;
  delete the rest.
- **`SNAP=<substr>` env filter alone** (shipped, kept). Filters the compare,
  not the drive — `SNAP=battle-initial node verify-battle.mjs` still spawns the
  whole battle. Useful within a scene; insufficient as the addressability
  story. Keep it; it composes with scenes (filter snaps *inside* the one
  scene you selected).
- **Per-domain entry scripts** (the status quo: three `verify-*.mjs`). Each
  re-implements browser launch, the `check` reporter, error capture, `mkdir
  shots`, and the exit-code dance. Drift is already visible (campaign opens the
  page at `deviceScaleFactor: 2`, battle does not; only battle has `--full`).
  One runner removes the duplication and makes "consistent" enforceable.

## The design

### The organizing principle: what you verify dictates which world

The split between today's two campaign harnesses is not arbitrary, and the new
design must make it deliberate rather than incidental. `verify-campaign.mjs`
drives the **real map** to verify *behavior* (march → garrison battle →
save/load → territory voronoi → AI). `verify-campaign-visual.mjs` boots a
**fixture** — the controlled one-road/two-city map — to verify *rendering*
(what the army/city markers look like). They use different worlds because they
answer different questions, and the real map is actively *hostile* to the
visual question: red armies on red cities (no contrast), garrison battles fire
on any move, and the layout is seed-dependent.

So every scene is one of two **kinds**, and the kind picks the world family:

- **`flow`** — verifies behavior. Drives real game systems on a **real-map
  world** and asserts on *outcomes* (positions, casualties, soldier counts,
  modal text, save/load round-trips). Outcomes, rarely pixels. A test map would
  give false confidence here — a two-city map cannot exercise the AI, voronoi,
  or pathfinding.
- **`visual`** — verifies rendering. Boots a **fixture world** (minimal,
  deterministic, contrast-clean) and asserts on *pixels* (`snap`). Fast, no
  game logic, no seed dependence. This is where the test maps earn their keep.

A scene should be one kind. The current battle harness violates this — it
takes the `battle-initial` deployment snap, then drives a melee, then snaps
mid-fight: a `visual` concern wearing a `flow` harness, which is exactly why it
litters scratch PNGs through nondeterministic mid-battle states. Splitting it
into a `visual` `battle-deploy` (snap the clean deployment) and a `flow`
`battle-melee` (assert casualties, no pixels) removes the litter by design.

### Visual coverage is catalog-driven and gated to 100%

Hand-listing visual scenes cannot reach 100% and cannot stay there — someone
adds a class and forgets the snap. The renderer draws from enumerable
registries; the test suite must be a *generated projection* of those registries,
with a gate that fails when the projection has a hole. Two tiers:

- **Atomic visual states** — the cartesian product of the renderer's
  registries, each a single primitive shown in isolation. These are 100%
  enumerable and 100% gated. *(measured fact — the registries:)*
  - 9 unit classes (`web/src/shared/soldierModel.ts` `CLASS_LOOK`) × 2 teams
    (`TEAM_COLOR`, renderer3d.ts) × pose. Poses: the 6 atlas frames
    (idle / walk-a / walk-b / attack / dead / weapon-swap) and the
    `classGeometry(cls, rest)` forward-vs-at-ease variant for pole arms.
  - highlight state: none / hover / selected.
  - ~18 status chips (`unitBanner.ts`: OTH ATK FEN CHG! ⚔N ROUT TIRED KITE
    AMMO! 2nd CRUSH BRC PUR SQZ WAIT …) × chip kind (plain/hot/bad); HP and
    cohesion bars at 100/75/50/25/0.
  - 7 battle terrain tints (0 grass,1 water,2 rock,3 wall,4 forest,5 mud,
    6 scree) and the scatter props (rock/bush/tree), tree variants
    (broadleaf/conifer).
  - campaign marker stances (idle / camp / settling / hidden / routed /
    embarked) and pie kinds (prep/occupation/embark/ambush); city ownership
    ring (own-green / enemy-faction / neutral-grey) × 3 city tiers.
  - LOD bands (`ZOOM_FLAT 6` / `ZOOM_SWAP 12` / `ZOOM_3D 18`): the sprite↔3D
    transition is itself a visual state.
- **Composite scenes** — emergent layouts that are *not* a product of
  primitives and cannot be enumerated: the 40-unit deployment, a melee crowd,
  a cluster group-move, the political voronoi map, the battle-initiation modal.
  These are curated (a deliberate, named list), not gated for completeness —
  you cannot enumerate "every battle layout," only "every primitive."

**The catalog** is one data module (`scenes/catalog.mjs`) that *builds the
atomic list from the registries*, not by hand:

```js
export const ATOMIC = CLASSES.flatMap(c =>
  TEAMS.flatMap(t => POSES.map(p => ({ group: 'soldier', class: c, team: t, pose: p }))));
// + CHIPS, + TERRAIN_TINTS, + MARKER_STANCES, + CITY_OWNERSHIP, + LOD_BANDS …
```

The catalog imports the registry lists so a registry edit propagates. The web
copies of the registries (`CLASS_LOOK`, the chip list) are *mirrors* of the
canonical Rust `ALL_CLASSES` — a gate keeps them honest (below).

**The coverage gate** *(binding)* is a runner self-check:
1. every `ATOMIC` entry has a baseline at its deterministic path — else FAIL,
   naming the missing states;
2. every baseline under `shots/scenes/` maps to a live catalog entry or a
   listed composite — else FAIL (orphan: a primitive was removed, delete its
   shot);
3. the mirror gate: `CLASS_LOOK.length` and the chip list match what the wasm
   exposes (drive `window.__game`/the contract enum count) — else the catalog
   is enumerating a stale registry.

Adding a class grows `ATOMIC` by `2 teams × |POSES|` entries; the gate fails
until each is snapped. That is what makes 100% real and self-maintaining: the
only way to go green is to add the screenshots, and the only way to add a
catalog entry is to touch the registry the game already reads.

### Fixtures are first-class and uniform across battle and campaign

The campaign test map exists today as a one-off: `buildTestCampaign` buried in
`main.ts`, reachable via `?campaign=test`. Elegance here means making *fixture*
a first-class, uniform facility — the same shape for battle and campaign — so
"a small deterministic world built to make one thing legible" is a pattern, not
a hack you reinvent per domain:

```
web/scenes/fixtures/        # the builders, one per fixture
  campaign-test.ts             # migrate buildTestCampaign out of main.ts (composite stage)
  battle-5v5.ts                # a small line clash for composite combat snaps (NEW)
  specimen-soldier.ts          # render ONE soldier: ?fixture=specimen-soldier&class=&team=&pose= (NEW)
  specimen-marker.ts           # render ONE campaign marker at a given stance/roster (NEW)
  specimen-terrain.ts          # render ONE terrain tint / prop / tree variant (NEW)
  specimen-banner.ts           # the DOM banner gallery, parameterised per chip (was ?test=banners)
```

Two fixture roles, matching the two coverage tiers:
- **Specimen fixtures** render exactly one atomic catalog entry in isolation,
  parameterised by URL — a single soldier of a given class/team/pose, one
  marker stance, one terrain tint, one chip. The catalog generator drives these
  to snap every atomic state; they are the machinery behind the 100% gate.
- **Stage fixtures** (campaign-test, battle-5v5) host composite scenes —
  several primitives arranged to show emergent layout.

A fixture is triggered by a uniform URL-param convention (`?fixture=<name>&…`,
subsuming today's `?campaign=test` and `?test=banners`) and registered in one
place so the runner and the game agree on the list. The loose `sandbox-1v1.png`
/ `labels-5v5.png` / `combat-*.png` scratch shots in `web/shots/` are the ghosts
of visual cases that were never given a deterministic home — specimen and stage
fixtures are that home. *(The exact param name is proposed; the binding
requirement is that fixtures are built and addressed the same way across battle
and campaign, that a specimen can render any single catalog entry, and that
`buildTestCampaign` stops being a special case.)*

### Layout

```
web/scene.mjs            # the single runner / CLI entry + coverage gate
web/scenes/
  worlds.mjs                # world name -> { url, ready, freeze, dpr }; real + fixture
  catalog.mjs               # ATOMIC[] built from the registries + COMPOSITES[] list
  fixtures/                 # specimen + stage fixture builders (see above)
  # --- visual: atomic (generated from catalog, one snap per primitive) ---
  atomic.mjs                # iterates catalog.ATOMIC, drives a specimen fixture, snaps each
  # --- visual: composite scenes (authored; emergent layouts) ---
  battle-deploy.mjs         # the 40-unit deployment line
  battle-melee.mjs          # a melee crowd (visual; the OLD melee snap, no behavioral asserts)
  campaign-markers.mjs      # markers posed over road / our city / neutral city (campaign-test)
  # --- flow: behavior on the real map (no PNGs) ---
  battle-maneuver.mjs       # march, pivot, stamina
  battle-cluster.mjs        # group-move keeps formation
  battle-ai.mjs             # tier: 'full'
  campaign-conquest.mjs     # march -> battle -> save/load
  campaign-territory.mjs    # voronoi + 3D camera tilt + click-select
  campaign-ambush.mjs
  campaign-reinforcement.mjs# tier: 'full'
```

`atomic.mjs` is the workhorse: it is not 100 hand-written files but one
generator over `catalog.ATOMIC`, so 100% atomic coverage costs one module that
never needs editing when a class is added — only the catalog (i.e. the
registry) and the baselines change. The three `verify-*.mjs` files are deleted;
their behavioral stages migrate into `flow` scenes and their incidental snaps
either become catalog entries (if atomic) or composite scenes (if emergent).
`web/snapshot.mjs` stays as-is (it is the safety property — see below).

### A scene module

```js
// A visual scene — boots a fixture, asserts pixels.
export const meta = {
  name: 'campaign-markers',
  kind: 'visual',                // 'visual' (fixture, pixels) | 'flow' (real map, outcomes)
  world: 'campaign-test',        // key into worlds.mjs; a fixture world for visual kind
  describe: 'Army & city markers over road / our city / neutral city.',
  tier: 'quick',                 // 'quick' (default run) | 'full' (release only)
};

export async function run({ page, check, snap }) {
  // world is already booted, frozen, at the fixed viewport.
  await snap('overview', { cam: [0, 450, 16] });
  await snap('army-road', {
    before: () => page.evaluate(() => window.__campaign.place(0, 1, 0, 4)),
    cam: [0, 450, 20],
  });
}
```

```js
// A flow scene — drives the real map, asserts outcomes, writes no PNG.
export const meta = {
  name: 'campaign-conquest',
  kind: 'flow',
  world: 'campaign-real',
  describe: 'March on an independent city, fight the garrison, save and reload.',
  tier: 'quick',
};

export async function run({ page, check }) {
  // ...orderMove, tick until battleReady, auto-resolve, save/load...
  check('battle consumed (no pending)', ready === -1);
}
```

The runner may assert the invariant directly: a `visual` scene that calls no
`snap`, or a `flow` scene whose world is a fixture, is a wiring mistake worth
failing on.

### The runner contract (`ctx` passed to `run`)

- `page` — the Playwright page, viewport 1280×800, world booted+frozen.
- `check(name, ok, detail)` — the existing reporter, namespaced by scene in
  the printed line; failures bubble to the process exit code.
- `snap(name, opts?)` — **the only way a PNG is written.** It optionally runs
  `opts.before()` to pose the world, sets `opts.cam` (`[x, y, scale]` via the
  world's camera hook), waits `opts.settle ?? 250`ms, then calls `snapCheck`
  under the scene baseline `shots/scenes/<name>.png` (via `baseDir`).
  `opts.maxDiffRatio`/`opts.threshold` pass through for a *named* noise source.
  There is no `ctx.screenshot`-to-disk; bare `page.screenshot({path})` to a
  tracked location is forbidden (a lint/grep check in the runner can enforce
  it: fail if `shots/` gains a loose `*.png` outside a harness folder). A `flow`
  scene writes no PNG at all — outcomes are asserted via `check`.
- `world` — the resolved world descriptor (handy for `world.freeze(false)`).

### The CLI

- `node scene.mjs` — run all `tier: 'quick'` scenes.
- `node scene.mjs --full` — include `tier: 'full'`.
- `node scene.mjs campaign-markers battle-deploy` — run only the named
  scenes (substring/exact match on `meta.name`).
- `SNAP=<substr>` — filter snaps *within* the selected scenes (unchanged).
- `UPDATE_SHOTS=1` — re-bless (unchanged; passes through to `snapCheck`).
- `VERIFY_URL` — dev server base (unchanged; default `http://localhost:5173`,
  this machine uses `:5174`).
- package.json: `"scene": "node scene.mjs"`,
  `"scene:full": "node scene.mjs --full"`. Decide whether to keep
  `verify`/`verify:*` as thin aliases for one migration cycle or cut them.

### Baseline namespacing

There is no `shots/baseline/` wrapper: each harness owns a flat top-level folder
under `shots/` — `scenes/` (the scene runner, `meta.name`-keyed), `campaign/`
(the verify-campaign harnesses), `vibe/`, `models/`, `models-ingame/`, `weave/`.
The scene/campaign harnesses select their folder with `snapCheck`'s `baseDir`;
vibe/turntable carry the folder in the snap `name`. Earlier drafts proposed
per-scene subfolders (e.g. `battle-deploy/initial.png`); that nesting was
dropped — one flat folder per harness is enough. The folder makes "which harness
owns this shot, and therefore asserts on it" visible from the path — directly
serving the every-shot-is-a-test principle.

### Which scratch shots become snaps

Every loose `page.screenshot({path})` in the old harnesses is triaged into the
two tiers: a primitive in isolation (a class, a chip, a terrain tint) becomes a
**catalog** entry snapped by `atomic.mjs`; an emergent layout (deployment,
melee crowd, cluster, political map, modal) becomes a **composite** scene
scene; anything that is neither becomes nothing. The expected outcome is zero
loose shots: `web/shots/` contains only per-harness folders and `diff/`. The atomic gate
then *expands* coverage far past what the scratch shots ever had — the loose
`combat-*`/`sandbox-*` shots were a sparse, unasserted sample of a space the
catalog now covers exhaustively.

## What must NOT change

1. **`snapshot.mjs`'s zero-tolerance compare semantics** *(locked)*. The
   exact-match-by-default, `{threshold, maxDiffRatio}` opt-out, baseline-
   created-on-miss, diff-written-on-fail behavior is the safety property the
   whole suite rests on. Reuse `snapCheck` verbatim; the runner wraps it, it
   does not reimplement it.
2. **The determinism discipline** *(locked)*. Every freeze/fixed-camera/Day-1
   rule in `screenshot-regression/SKILL.md` must survive. The migration is a
   refactor of *where* the calls live, never a relaxation of *whether* they
   run. A snap with no preceding `freeze()` is a bug, not a scene.
3. **The debug-hook capabilities** (`window.__game`, `window.__campaign`,
   `__ready`, `__campaignReady`, and the freeze/place/cam seams). Scenes
   drive through these; do not add *new* production-side hooks to make a
   scene convenient. The fixture *entry points* may be unified
   (`?campaign=test`/`?test=banners` → a single `?fixture=<name>` convention) —
   that is in scope; the runtime capabilities they expose are not to grow.
4. **Sim / renderer / gameplay behavior.** This is a test-harness reorg. The
   `web/src/` changes in scope are pure test scaffolding: relocating fixture
   *builders* into the uniform facility, wiring the `?fixture=` param, and
   adding specimen entry points that pose a single primitive by reusing the
   existing render path (a specimen does not re-implement rendering — it asks
   the real renderer to draw one soldier/marker/tile). A read-only registry
   count for the mirror gate is fine. No change to combat, formation, campaign,
   or rendering *logic*; no change under `crates/`. If a fixture needs a new
   capability from the sim, that is a separate spec.

## Contracts — the tests are the spec

Must STAY green (behavioral parity — port each, do not drop):
- Battle: `full battle spawned`, `ordered unit marches`, `unit is in motion`,
  `cohesion responds to maneuver`, `cluster keeps line formation`, `far unit
  combines at the destination`, `tick under budget`, `frame rate alive`,
  `no page errors`; and behind `--full`: `cavalry mass displaces infantry`,
  `disordered unit shows order delay`, `pivot keeps cohesion`, `unit completed
  the 180`, `running drains stamina`, `rest recovers stamina`, `units are
  engaged mid-fight`, `melee inflicts casualties`, `melee is a grind`, the
  three AI checks.
- Campaign (real): `campaign boots with armies`, `cities loaded`, the
  garrison-battle chain, save/load, `territory voronoi covers...`, the two
  camera-tilt checks, `click-select works through the tilted camera`, the
  ambush chain, the split/merge/reinforcement chain.
- Campaign (test): `test campaign boots with a player army`, `no page errors`.

Must BECOME true (the acceptance, write these as runner self-checks):
- **Visual coverage gate** (headline): every `catalog.ATOMIC` entry has a
  baseline; every baseline maps to a live catalog entry or a listed composite;
  no orphans. The run FAILS otherwise, naming the gaps. Verify it fails closed:
  add a pose to a registry and confirm the gate goes red until snapped.
- **Mirror gate**: the web registry mirrors (`CLASS_LOOK` length, the chip
  list) match the canonical wasm/contract counts; drift fails the run.
- `git status --porcelain` is empty after `node scene.mjs --full` — no
  loose shots written. If it fails, the smell is back.
- `web/shots/` contains only per-harness folders and `diff/` (no top-level `*.png`).
- `node scene.mjs campaign-markers` boots exactly one world and runs only
  that scene's snaps (assert by run time and by the printed check set).
- Visual parity: the re-blessed namespaced baselines are byte-identical to the
  old flat ones on the blessing machine (bless with `UPDATE_SHOTS=1`, then
  `cmp` old vs new before deleting the old). The golden pixels move paths, not
  content.
- Kind invariant holds: every `visual` scene calls `snap` at least once and
  boots a fixture world; every `flow` scene writes zero PNGs. The runner
  fails the run if either is violated.
- Fixtures are uniform: `buildTestCampaign` no longer lives in `main.ts` as a
  special case; it and the new battle fixtures are built and addressed by the
  same mechanism. Adding a fixture touches only `scenes/fixtures/` + its
  registration.

## Process requirements

- Dev server first; this machine runs civsim on **:5174** (`:5173` is held by
  an old `/Users/david/dev/game` checkout — see memory). Set `VERIFY_URL`.
- Run from `web/`. `cd web` in a compound bash command can trip a permission
  prompt — invoke with an absolute path or an already-correct cwd.
- Re-bless on this Mac, headless chromium; baselines are per-platform
  (font/GPU rasterization differs across OSes). Do not re-bless `battle-initial`
  to silence the cross-machine 0.22% — that pins this box's noise; it is the
  battle-3D owner's call on their hardware.
- Scratch shots regenerate mid-run today; until they are eliminated, a rebase
  needs `git checkout -- 'web/shots/*.png'` first. The whole point of this work
  is to retire that step.
- Update `.agents/skills/screenshot-regression/SKILL.md` and the
  `write-scene` skill to describe the runner as it lands, and update the
  README commands. The `write-scene` skill is the durable artifact; this
  spec is deleted on completion.

## Acceptance

- [ ] One runner (`web/scene.mjs`) + `web/scenes/*.mjs`; the three
      `verify-*.mjs` deleted; package.json scripts updated.
- [ ] Each scene is one `kind`; `visual` scenes run on fixtures, `flow`
      on real-map worlds. The deployment snap is split out of the melee.
- [ ] `catalog.mjs` builds `ATOMIC` from the registries; `atomic.mjs` snaps
      every atomic state via specimen fixtures; the coverage gate + mirror gate
      pass and are verified to fail closed.
- [ ] Fixtures live in `scenes/fixtures/` behind one `?fixture=` convention;
      specimen fixtures render any single catalog entry; `buildTestCampaign`
      migrated out of `main.ts`.
- [ ] Every old check ported and green (quick + `--full`), per the table above.
- [ ] No bare `page.screenshot({path})` to a tracked location remains; `git
      status` clean after `--full`; `web/shots/` holds only per-harness
      folders + `diff/`.
- [ ] Scene baselines re-blessed once under `shots/scenes/`, old flat
      baselines deleted, byte-identity verified before deletion.
- [ ] Skills + README updated; this spec deleted.
- [ ] Postmortem note here before deleting: how many scratch shots were
      promoted vs dropped, and the final scene/baseline counts (for the next
      person sizing a similar reorg).
