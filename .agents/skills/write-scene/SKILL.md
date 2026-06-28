---
name: write-scene
description: How to write a verification scene — an addressable, individually-runnable case that boots one world (real map or test map) and asserts one or more visual snapshots and/or behavioral checks. Use when adding or restructuring browser verification for the battle or campaign frontend. Pairs with [screenshot-regression](../screenshot-regression/SKILL.md) (the snapshot mechanics every snap obeys) and [write-tests](../write-tests/SKILL.md) (sim correctness lives in cargo, never the browser).
---

# Writing a scene

A **scene** is the unit of browser verification: one named, individually-
runnable case = a declared *world* (which game state to boot) + one or more
*tests* against it (visual snapshots, behavioral checks, or both). Scenes
live in `web/scenes/<owner>/*.mjs`, one per file, run by `web/scene.mjs`.
Use `battle/`, `campaign/`, `ui/`, `models/`, or `system/` according to the
surface the scene owns.

> If `web/scenes/` does not exist yet, the architecture is still specced in
> `specs/scenes.md` and not built — implement that first. The three legacy
> harnesses (`verify-battle.mjs`, `verify-campaign.mjs`,
> `verify-campaign-visual.mjs`) are the pre-scene world; the same rules
> below still apply to snaps inside them.

## The one rule that defines the architecture

**Every screenshot a run writes is a blessed regression baseline.** Committed
scene PNGs live under the owner folder: `shots/battle/`, `shots/campaign/`,
`shots/ui/`, or `shots/models/`. Failure artifacts live only under
`shots/diff/` and are gitignored. Never write a bare
`page.screenshot({ path: ... })` to a tracked location — a shot nobody asserts
on is not data, it is detritus. If a frame is worth capturing, capture it with
`snap()` so a future run guards it. If it is not worth a baseline, do not write
it.

## Visual coverage is 100% and catalog-driven — don't hand-list it

Before you write a *visual* scene, ask whether the thing you're capturing is
an **atomic** primitive or a **composite** scene:

- **Atomic** — one renderable primitive in isolation: a unit class/team/pose, a
  status chip, a terrain tint, a marker stance, a city-ownership ring. These are
  enumerated in `scenes/catalog.mjs`, which builds the list *from the same
  registries the renderer uses* (`CLASS_LOOK`, the chip list, the tint table).
  You do **not** write a scene file per primitive — you add the primitive to
  the registry/catalog and the generator (`atomic.mjs` driving a specimen
  fixture) snaps it. The **coverage gate** fails the run if any catalog entry
  lacks a baseline, so adding a class *forces* its new screenshots.
- **Composite** — an emergent layout that is not a product of primitives: the
  deployment line, a melee crowd, the political voronoi map, a modal. These
  *are* authored as `visual` scene files, but they are a curated list, not a
  completeness claim.

So: **adding a new renderable primitive = a catalog/registry edit + new
baselines, never a new scene file.** If you find yourself copy-pasting a
visual scene to cover one more class or chip, stop — that belongs in the
catalog.

## Two kinds — what you verify dictates which world

Every scene is exactly one **kind**, and the kind picks the world:

- **`visual`** — verifies *rendering*. Boots a **fixture** (a minimal,
  deterministic, contrast-clean world) and asserts *pixels* via `snap`. Fast,
  no game logic, no seed dependence. Atomic coverage is generated from the
  catalog; composite scenes are authored visual scenes.
- **`flow`** — verifies *behavior*. Drives real game systems on the **real
  map** and asserts *outcomes* via `check` (positions, casualties, soldier
  counts, modal text, save/load). Writes **no** PNG. A `flow` verifies the
  *frontend/UI* wiring, NOT the sim physics — sim correctness is a cargo test
  ([write-tests](../write-tests/SKILL.md)); never reach for a browser flow to
  decide whether the physics is right.

Don't mix them. A heavy behavioral flow that also snaps pixels mid-run is what
produced the old scratch-shot litter — the frames landed in nondeterministic
mid-battle states no baseline could pin. If you want to *both* drive a flow and
guard a frame, the frame almost always belongs to a separate `visual` scene
on a fixture posed to that exact moment. The real map is *hostile* to visual
tests: no colour contrast (red on red), garrison battles fire on any move, and
the layout is seed-dependent — fixtures exist precisely to remove all three.

## Anatomy of a scene

```js
export const meta = {
  name: 'campaign-markers',      // unique, kebab; CLI selects by this
  kind: 'visual',                // 'visual' (fixture, pixels) | 'flow' (real map, outcomes)
  world: 'campaign-test',        // key into scenes/worlds.mjs ('none' = no boot)
  describe: 'Army & city markers over road / our city / neutral city.',
  tier: 'quick',                 // 'quick' = default run; 'full' = release-only
};

export async function run({ page, snap }) {
  // The fixture is already booted, frozen, at the 1280x800 viewport.
  // snap() is the ONLY way a PNG gets written.
  await snap('overview', { cam: [0, 450, 16] });
  await snap('army-road', {
    before: () => page.evaluate(() => window.__campaign.place(0, 1, 0, 4)),
    cam: [0, 450, 20],
  });
}
```

```js
// A flow scene — real map, outcomes, no PNG.
export const meta = {
  name: 'campaign-conquest', kind: 'flow', world: 'campaign-real',
  describe: 'March on an independent city, fight the garrison, save and reload.',
  tier: 'quick',
};
export async function run({ page, check }) {
  // ...orderMove, tick until battleReady, auto-resolve, save/load...
  check('battle consumed (no pending)', ready === -1);
}
```

- `snap(name, opts?)` runs `opts.before()` (pose the world), sets `opts.cam`
  `[x, y, scale]`, waits `opts.settle ?? 250`ms for a frame, then compares the
  baseline through `snapCheck`. The runner chooses the baseline root from the
  scene file's owner folder, so `campaign/foo.mjs` writes `shots/campaign/` and
  `battle/foo.mjs` writes `shots/battle/`. Use `opts.baseline` only when a
  compatibility name is intentional.
  Pass `opts.maxDiffRatio` / `opts.threshold` ONLY for a noise source you can
  name in a comment.
- `check(name, ok, detail)` is the behavioral reporter; failures set the exit
  code. Assert observable outcomes (positions, casualties, soldier counts,
  rendered frames) — never internal call order.

## One world, many measurements — never split a scene per assertion

A scene is *one declared world + as many checks/snaps as that world supports*.
If two scenes (or two test setups) boot the **same** world and differ only in
*what they measure*, they are **one** scene — fold the extra assertions in.
Standing the same world up twice pays the (slow) boot twice, lets the two copies
drift the moment someone edits the setup in one place and not the other, and
hides that both are claims about the *same* run.

The tell: two `run()` bodies — or two Rust test fns / setup helpers — whose
world-building is copy-paste identical and only the asserts differ. Collapse
them: **one boot, multiple `snap`/`check` calls**, or one shared rig that returns
*every* measurement and each test asserts its facet off the shared result.

Keep them separate ONLY when the **world itself** differs — a different map,
class, spacing, target hardness, or seed set is a different *scene*, not a
different *measurement* of the same one. That line is the whole discipline: same
world → one scene; different world → don't force-merge.

> Worked: `cav_into_line` and `cav_vs_light` each stood up the *identical*
> cav-vs-light charge to read impact-kills vs win/rout — merged into one rig, the
> facets asserted separately. But the cavalry *knockdown* test stayed its own
> scene: it charges a **heavy** line (a light line gets one-shot by the lance,
> so the stun signal vanishes) — a different world, so a different scene.

## Worlds: real maps and fixtures

`scenes/worlds.mjs` owns boot + readiness + freeze for each world; a
scene names one in `meta.world`. Worlds come in two families.

**Real-map worlds** (for `flow` scenes — exercise the actual systems):
- `battle-real` — `?map=A&ai=off`, ready `window.__ready`, freeze
  `__game.freeze()`. Drive via `window.__game`
  (`select/setOrder/advance/groupMove/unitInfo/...`).
- `campaign-real` — menu → `#menu-new-campaign`, ready `__campaignReady`,
  freeze `__campaign.freeze()`. The full ~400-city map: garrison battles,
  save/load, territory, AI. Use when the behavior under test *needs* the real
  world — a fixture can't exercise the AI, voronoi, or pathfinding.

**Fixtures** (for `visual` scenes — minimal, deterministic, contrast-clean).
A fixture is a first-class facility, built the **same way for battle and
campaign** under `scenes/fixtures/` and triggered by one `?fixture=<name>`
convention. Two roles:
- **Specimen fixtures** render exactly *one* atomic catalog entry, parameterised
  by URL — `?fixture=specimen-soldier&class=3&team=1&pose=attack`, one marker
  stance, one terrain tint, one chip. The catalog generator drives these; this
  is the machinery behind 100% atomic coverage. You rarely write a specimen
  scene by hand — you extend the catalog and the generator does the snapping.
- **Stage fixtures** host composite scenes: `campaign-test` (the one-road /
  two-city map, `deviceScaleFactor: 2`; teleport the army with
  `window.__campaign.place(0, kind, a, b)`), `battle-5v5` (a small line clash).

Need a fixture that doesn't exist? Add a builder under `scenes/fixtures/` and
register it — do not hand-pose the real map and do not add a one-off boot path
in `main.ts`. Pick the **smallest world that exercises the thing under test**;
never reach for the real map to snap a model.

## Determinism is non-negotiable

Every snap must satisfy the full checklist in the
[screenshot-regression](../screenshot-regression/SKILL.md) skill — fixed
1280×800 viewport, explicit camera, frozen clock, snap on Day 1
*before any `tick()`*, wait after moving the camera. The world helper freezes
on boot; if your scene unfreezes (`world.freeze(false)`) to drive time,
re-freeze before the next snap. A snap with no active freeze goes flaky and
will fail on someone else's machine first.

## Running and blessing

```sh
# dev server first (this machine: :5174; export VERIFY_URL accordingly)
node scene.mjs                       # all quick scenes
node scene.mjs --full                # include tier: 'full'
node scene.mjs campaign-markers      # just one scene (by meta.name)
SNAP=overview node scene.mjs campaign-markers   # one snap within it
UPDATE_SHOTS=1 node scene.mjs campaign-markers  # re-bless its baselines
```

`git status` must be **clean after any run**. If a run leaves dirty PNGs, a
snap is missing or a bare `page.screenshot` slipped in — fix that, don't
restore-and-ignore.

## Before you say a visual scene is done

Per the [screenshot-regression](../screenshot-regression/SKILL.md) skill:
**open the actual PNG and look at it.** A green run only proves the frame
matches the baseline — and if you just blessed that baseline, you certified
it. Confirm with your own eyes that the frame shows what you claim before
reporting, and look at any baseline you re-blessed.

## Checklist for a new scene

- [ ] Is this an atomic primitive? If so it belongs in `catalog.mjs` (a registry
      edit + new baselines), NOT a new scene file. Only composites and flows
      are scene files.
- [ ] One file under `scenes/<owner>/<name>.mjs`, exporting `meta` + `run`.
- [ ] Does another scene already boot this *same* world? If it differs only in
      what it measures, add your `snap`/`check` THERE — don't author a second
      scene (or a second copy-paste setup) for the same world. A new scene
      is justified only by a genuinely different world.
- [ ] Exactly one `kind`: `visual` → a fixture world + at least one `snap`;
      `flow` → a real-map world + zero PNGs.
- [ ] `meta.world` is the smallest world that exercises the change; if you
      needed a new fixture, it lives in `scenes/fixtures/`, not `main.ts`.
- [ ] Every captured frame is a `snap()`; zero bare `page.screenshot({path})`.
- [ ] Each snap: freeze active, camera set, settle waited.
- [ ] `tier: 'full'` if it is slow/heavy (AI games, long advances); else quick.
- [ ] `flow` checks assert observable outcomes, not internals.
- [ ] Baselines committed under the matching `shots/<owner>/` folder; `git status` clean.
- [ ] You looked at the new baseline PNGs yourself.
