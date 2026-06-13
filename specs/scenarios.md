# Spec: Scenarios — addressable visual/behavioral cases on one runner

## Goal, in one sentence

Replace the three bespoke flat verify harnesses with one runner over a
directory of named, individually-runnable **scenarios** — each either a
`visual` case (a fixture world asserting pixels) or a `flow` case (a real-map
world asserting behavior) — so that the real-map/fixture split that today's two
campaign harnesses stumbled into becomes the deliberate organizing axis, and
every screenshot a run writes is a blessed regression baseline and nothing
else.

This document is **proposed design** except where a paragraph is marked
*(measured fact)*. Solve the problem; the file layout and `ctx` shape below
are a starting point, not gospel — deviate where the code disagrees, but do
not weaken the two load-bearing invariants in **What must NOT change**.

## The contract this unlocks

Today there is no way to run one visual case. Each of `web/verify-battle.mjs`,
`web/verify-campaign.mjs`, `web/verify-campaign-visual.mjs` is a flat
top-to-bottom script; to re-check `battle-initial` you run the entire 30k-
soldier battle harness (it marches units, fights a melee, runs an AI game).
The `SNAP=<substr>` env filter (in `web/snapshot.mjs`) is a stopgap — it skips
the *comparison* but the whole script still *drives*. Scenarios make the setup
itself addressable: `node scenario.mjs campaign-markers` boots only that world
and runs only its snaps.

Acceptance is behavioral parity, not new behavior: after the migration every
check that passes today still passes, every blessed baseline is preserved (or
deliberately renamed once), and `git status` is **clean after any run** — see
the contracts table.

## Context you don't have (read this; it is the whole reason)

*(measured fact)* A run writes two kinds of PNG today, and only one is a test:

1. **Blessed baselines** — `snapCheck(page, name, check)` (`web/snapshot.mjs`)
   writes `web/shots/baseline/<name>.png`, then every later run compares the
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
only PNG locations are `shots/baseline/` (committed truth) and `shots/diff/`
(gitignored transient). The top-level `shots/*.png` scratch dump ceases to
exist. That makes the user's principle literally true: every shot under
version control is useful regression data.

Greppable anchors the implementer will need:
- The reporter pattern every harness repeats: `const check = (name, ok, detail)
  => {...}; const failures = []`, exit `process.exit(failures.length ? 1 : 0)`.
- World boots: battle `?map=A&ai=off` → `window.__ready` → `__game.freeze()`;
  real campaign menu → `#menu-new-campaign` → `window.__campaignReady` →
  `__campaign.freeze()`; test campaign `?campaign=test` →`__campaignReady`,
  page opened with `deviceScaleFactor: 2` (markers are snapped at 2× — see
  `verify-campaign-visual.mjs:29`).
- Debug seams scenarios drive through (do not add more): `window.__game`
  (`stats/unitInfo/select/setOrder/advance/groupMove/freeze/...`),
  `window.__campaign` (`armies/cities/cam/freeze/place/orderMove/tick/
  battleReady/project/select/...`), the DOM-only banner gallery at
  `?test=banners`.
- The determinism discipline lives in `.claude/skills/screenshot-regression/
  SKILL.md` — fixed 1280×800 viewport, explicit camera, freeze the clock,
  snap on Day 1 before any `tick()`, wait ~250ms after a camera move. Every
  rule there must survive the migration; a scenario that drops a `freeze()`
  goes flaky.
- Per-machine baselines *(measured fact)*: `battle-initial` fails ~0.22% on
  this headless SwiftShader Mac because its baseline was blessed elsewhere;
  the diff is sub-pixel AA wobble on unit silhouettes and the count drifts
  run-to-run (2244↔2268 px). `verify-battle.mjs:57` already carries
  `{ maxDiffRatio: 0.0008 }` for this. Scenarios do NOT fix cross-machine
  rasterization — a scenario may carry a named, justified `maxDiffRatio`, but
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
  whole battle. Useful within a scenario; insufficient as the addressability
  story. Keep it; it composes with scenarios (filter snaps *inside* the one
  scenario you selected).
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

So every scenario is one of two **kinds**, and the kind picks the world family:

- **`flow`** — verifies behavior. Drives real game systems on a **real-map
  world** and asserts on *outcomes* (positions, casualties, soldier counts,
  modal text, save/load round-trips). Outcomes, rarely pixels. A test map would
  give false confidence here — a two-city map cannot exercise the AI, voronoi,
  or pathfinding.
- **`visual`** — verifies rendering. Boots a **fixture world** (minimal,
  deterministic, contrast-clean) and asserts on *pixels* (`snap`). Fast, no
  game logic, no seed dependence. This is where the test maps earn their keep.

A scenario should be one kind. The current battle harness violates this — it
takes the `battle-initial` deployment snap, then drives a melee, then snaps
mid-fight: a `visual` concern wearing a `flow` harness, which is exactly why it
litters scratch PNGs through nondeterministic mid-battle states. Splitting it
into a `visual` `battle-deploy` (snap the clean deployment) and a `flow`
`battle-melee` (assert casualties, no pixels) removes the litter by design.

### Fixtures are first-class and uniform across battle and campaign

The campaign test map exists today as a one-off: `buildTestCampaign` buried in
`main.ts`, reachable via `?campaign=test`. Elegance here means making *fixture*
a first-class, uniform facility — the same shape for battle and campaign — so
"a small deterministic world built to make one thing legible" is a pattern, not
a hack you reinvent per domain:

```
web/scenarios/fixtures/        # the builders, one per fixture
  campaign-test.ts             # migrate buildTestCampaign out of main.ts
  battle-1v1.ts                # two opposed units on flat ground (NEW)
  battle-5v5.ts                # a small line clash for combat-visual snaps (NEW)
```

A fixture is triggered by a uniform URL-param convention (`?fixture=<name>`,
subsuming today's `?campaign=test` and `?test=banners`) and registered in one
place so the runner and the game agree on the list. Battle gets fixtures it
never had: the loose `sandbox-1v1.png` / `labels-5v5.png` / `combat-*.png`
scratch shots in `web/shots/` are the ghosts of visual cases that were never
given a deterministic home — fixtures are that home. *(The exact param name is
proposed; the binding requirement is that battle and campaign fixtures are
built and addressed the same way, and that `buildTestCampaign` stops being a
special case.)*

### Layout

```
web/scenario.mjs            # the single runner / CLI entry
web/scenarios/
  worlds.mjs                # world name -> { url, ready, freeze, dpr }; real + fixture
  fixtures/                 # fixture builders (see above)
  # --- visual scenarios (fixture worlds, pixels) ---
  battle-deploy.mjs         # world: battle-1v1 (or the real deploy moment); the clean line
  battle-formations.mjs     # world: battle-5v5; line/charge/melee poses
  campaign-markers.mjs      # world: campaign-test; the tiny-* poses
  banner-gallery.mjs        # world: banner fixture (pure DOM route)
  # --- flow scenarios (real-map worlds, outcomes) ---
  battle-maneuver.mjs       # real map: march, pivot, stamina
  battle-cluster.mjs        # real map: group-move keeps formation
  battle-ai.mjs             # real map; tier: 'full'
  campaign-conquest.mjs     # real map: march -> battle -> save/load
  campaign-territory.mjs    # real map: voronoi + 3D camera tilt + click-select
  campaign-ambush.mjs       # real map
  campaign-reinforcement.mjs# real map; tier: 'full'
```

The three `verify-*.mjs` files are deleted; their stages migrate into scenarios
along the kind boundary above. `web/snapshot.mjs` stays as-is (it is the safety
property — see below).

### A scenario module

```js
// A visual scenario — boots a fixture, asserts pixels.
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
// A flow scenario — drives the real map, asserts outcomes, writes no PNG.
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

The runner may assert the invariant directly: a `visual` scenario that calls no
`snap`, or a `flow` scenario whose world is a fixture, is a wiring mistake worth
failing on.

### The runner contract (`ctx` passed to `run`)

- `page` — the Playwright page, viewport 1280×800, world booted+frozen.
- `check(name, ok, detail)` — the existing reporter, namespaced by scenario in
  the printed line; failures bubble to the process exit code.
- `snap(name, opts?)` — **the only way a PNG is written.** It optionally runs
  `opts.before()` to pose the world, sets `opts.cam` (`[x, y, scale]` via the
  world's camera hook), waits `opts.settle ?? 250`ms, then calls `snapCheck`
  under the scenario-namespaced baseline `shots/baseline/<scenario>/<name>.png`.
  `opts.maxDiffRatio`/`opts.threshold` pass through for a *named* noise source.
  There is no `ctx.screenshot`-to-disk; bare `page.screenshot({path})` to a
  tracked location is forbidden (a lint/grep check in the runner can enforce
  it: fail if `shots/` gains a file outside `baseline/` and `diff/`). A `flow`
  scenario writes no PNG at all — outcomes are asserted via `check`.
- `world` — the resolved world descriptor (handy for `world.freeze(false)`).

### The CLI

- `node scenario.mjs` — run all `tier: 'quick'` scenarios.
- `node scenario.mjs --full` — include `tier: 'full'`.
- `node scenario.mjs campaign-markers battle-deploy` — run only the named
  scenarios (substring/exact match on `meta.name`).
- `SNAP=<substr>` — filter snaps *within* the selected scenarios (unchanged).
- `UPDATE_SHOTS=1` — re-bless (unchanged; passes through to `snapCheck`).
- `VERIFY_URL` — dev server base (unchanged; default `http://localhost:5173`,
  this machine uses `:5174`).
- package.json: `"scenarios": "node scenario.mjs"`,
  `"scenarios:full": "node scenario.mjs --full"`. Decide whether to keep
  `verify`/`verify:*` as thin aliases for one migration cycle or cut them.

### Baseline namespacing

Baselines move to `shots/baseline/<scenario>/<snap>.png`. This is the migration's
one deliberate rename: the 8 existing baselines get re-blessed once under their
scenario folder (e.g. `battle-initial` → `battle-deploy/initial.png`,
`tiny-overview` → `campaign-markers/overview.png`). Namespacing makes "which
scenario owns this shot, and therefore asserts on it" visible from the path —
directly serving the every-shot-is-a-test principle. Do this rename in a single
commit with `UPDATE_SHOTS=1`, and delete the old flat baseline files in the same
commit so no orphans linger.

### Which scratch shots become snaps

Every loose `page.screenshot({path})` in the old harnesses is triaged: promote
to a `snap()` if the frame is worth guarding (the deployment, the melee, the
cluster before/after, the AI battle, the campaign map/modal/after-battle — all
of them are; that is why a human wanted to look at them), otherwise delete it.
The expected outcome is zero loose shots: `web/shots/` contains only
`baseline/` and `diff/`. Note in the migration commit any frame you chose to
drop rather than bless, so a reader knows coverage shrank deliberately.

## What must NOT change

1. **`snapshot.mjs`'s zero-tolerance compare semantics** *(locked)*. The
   exact-match-by-default, `{threshold, maxDiffRatio}` opt-out, baseline-
   created-on-miss, diff-written-on-fail behavior is the safety property the
   whole suite rests on. Reuse `snapCheck` verbatim; the runner wraps it, it
   does not reimplement it.
2. **The determinism discipline** *(locked)*. Every freeze/fixed-camera/Day-1
   rule in `screenshot-regression/SKILL.md` must survive. The migration is a
   refactor of *where* the calls live, never a relaxation of *whether* they
   run. A snap with no preceding `freeze()` is a bug, not a scenario.
3. **The debug-hook capabilities** (`window.__game`, `window.__campaign`,
   `__ready`, `__campaignReady`, and the freeze/place/cam seams). Scenarios
   drive through these; do not add *new* production-side hooks to make a
   scenario convenient. The fixture *entry points* may be unified
   (`?campaign=test`/`?test=banners` → a single `?fixture=<name>` convention) —
   that is in scope; the runtime capabilities they expose are not to grow.
4. **Sim / renderer / gameplay behavior.** This is a test-harness reorg. The
   only `web/src/` change in scope is relocating fixture *builders*
   (`buildTestCampaign` and new battle fixtures) into the uniform facility and
   wiring the `?fixture=` param — pure test scaffolding. No change to combat,
   formation, campaign, or rendering logic; no change under `crates/`. If a
   fixture needs a new capability from the sim, that is a separate spec.

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
- `git status --porcelain` is empty after `node scenario.mjs --full` — no
  loose shots written. This is the headline contract; if it fails, the smell
  is back.
- `web/shots/` contains only `baseline/` and `diff/` (no top-level `*.png`).
- `node scenario.mjs campaign-markers` boots exactly one world and runs only
  that scenario's snaps (assert by run time and by the printed check set).
- Visual parity: the re-blessed namespaced baselines are byte-identical to the
  old flat ones on the blessing machine (bless with `UPDATE_SHOTS=1`, then
  `cmp` old vs new before deleting the old). The golden pixels move paths, not
  content.
- Kind invariant holds: every `visual` scenario calls `snap` at least once and
  boots a fixture world; every `flow` scenario writes zero PNGs. The runner
  fails the run if either is violated.
- Fixtures are uniform: `buildTestCampaign` no longer lives in `main.ts` as a
  special case; it and the new battle fixtures are built and addressed by the
  same mechanism. Adding a fixture touches only `scenarios/fixtures/` + its
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
- Update `.claude/skills/screenshot-regression/SKILL.md` and the
  `write-scenario` skill to describe the runner as it lands, and update the
  README commands. The `write-scenario` skill is the durable artifact; this
  spec is deleted on completion.

## Acceptance

- [ ] One runner (`web/scenario.mjs`) + `web/scenarios/*.mjs`; the three
      `verify-*.mjs` deleted; package.json scripts updated.
- [ ] Each scenario is one `kind`; `visual` scenarios run on fixtures, `flow`
      on real-map worlds. The deployment snap is split out of the melee.
- [ ] Fixtures live in `scenarios/fixtures/` behind one `?fixture=` convention;
      `buildTestCampaign` migrated out of `main.ts`; battle fixtures added.
- [ ] Every old check ported and green (quick + `--full`), per the table above.
- [ ] No bare `page.screenshot({path})` to a tracked location remains; `git
      status` clean after `--full`; `web/shots/` holds only `baseline/`+`diff/`.
- [ ] Baselines re-blessed once under `shots/baseline/<scenario>/`, old flat
      baselines deleted, byte-identity verified before deletion.
- [ ] Skills + README updated; this spec deleted.
- [ ] Postmortem note here before deleting: how many scratch shots were
      promoted vs dropped, and the final scenario/baseline counts (for the next
      person sizing a similar reorg).
