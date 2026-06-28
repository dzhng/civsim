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
surface the scene owns. `web/scene.mjs` recursively discovers those files and
uses the owner folder to choose the default shot root.

## The one rule that defines the architecture

**Every screenshot a run writes is a blessed regression baseline.** Committed
scene PNGs live under the owner folder: `shots/battle/`, `shots/campaign/`,
`shots/ui/`, or `shots/models/`. Model shots should stay organized by model
owner under `shots/models/battle/`, `shots/models/campaign/`, or
`shots/models/shared/`. Failure artifacts live only under gitignored temporary
or diff folders. Never write a bare
`page.screenshot({ path: ... })` to a tracked location — a shot nobody asserts
on is not data, it is detritus. If a frame is worth capturing, capture it with
`snap()` so a future run guards it. If it is not worth a baseline, do not write
it.

## Coverage is intentional, not scratch work

Before you write a *visual* scene, ask whether the thing you're capturing is an
isolated model/primitive or a composed game state.

- **Model/primitive review** — one asset or primitive in isolation: a unit
  class, a tree, a road piece, a city marker, a flag, a terrain swatch, or an
  icon. Put model definitions under `web/src/models/<battle|campaign|shared>/`
  and put generated review shots under
  `web/shots/models/<battle|campaign|shared>/`. If a model moves, also create
  an animation/GIF gate with [write-anim](../write-anim/SKILL.md); if it needs
  static review, use [write-turntable](../write-turntable/SKILL.md).
- **Composite scene** — an emergent layout: a campaign LoD band, a selected
  city/army composition, a battle line, a modal, or a UI state. These are
  authored as `visual` scene files under the owning folder.

If you find yourself copy-pasting a scene just to cover one more asset variant,
make a shared helper or model gate instead. If the world/camera/state is the
thing under review, a scene file is the right unit.

## Two kinds — what you verify dictates which world

Every scene is exactly one **kind**, and the kind picks the world:

- **`visual`** — verifies *rendering*. Boots the smallest deterministic world
  that exercises the visual requirement and asserts *pixels* via `snap`. Prefer
  fixture/test worlds for isolated composition and model work. Use the real
  campaign map when the visual requirement is geographic accuracy, LoD,
  coastline/road/city alignment, fog, or whole-map readability.
- **`flow`** — verifies *behavior*. Drives real game systems on the **real
  map** and asserts *outcomes* via `check` (positions, casualties, soldier
  counts, modal text, save/load). Writes **no** PNG. A `flow` verifies the
  *frontend/UI* wiring, NOT the sim physics — sim correctness is a cargo test
  ([write-tests](../write-tests/SKILL.md)); never reach for a browser flow to
  decide whether the physics is right.

Don't casually mix them. A heavy behavioral flow that also snaps pixels mid-run is what
produced the old scratch-shot litter — the frames landed in nondeterministic
mid-battle states no baseline could pin. If you want to *both* drive a flow and
guard a frame, the frame almost always belongs to a separate `visual` scene
on a fixture posed to that exact moment. Real-map campaign visual scenes are
valid when the claim is about the real map itself; freeze time, set explicit
camera/state, and keep the assertions named.

## Anatomy of a scene

```js
export const meta = {
  name: 'campaign-markers',      // unique, kebab; CLI selects by this
  kind: 'visual',                // 'visual' (pixels) | 'flow' (outcomes)
  world: 'campaign-test',        // descriptive; boot inside run() or helper
  snapshots: ['campaign-markers-overview'],
  describe: 'Army & city markers over road / our city / neutral city.',
  tier: 'quick',                 // 'quick' = default run; 'full' = release-only
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${ctx.target}/?campaign=test`);
  await page.waitForFunction(() => window.__campaignReady === true);
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(0, 450, 16);
  });
  await ctx.snap(page, 'campaign-markers-overview');
  await page.close();
}
```

```js
// A flow scene — real map, outcomes, no PNG.
export const meta = {
  name: 'campaign-conquest', kind: 'flow', world: 'campaign-real',
  describe: 'March on an independent city, fight the garrison, save and reload.',
  tier: 'quick',
};
export async function run(ctx) {
  const page = await ctx.newPage();
  // ...orderMove, tick until battleReady, auto-resolve, save/load...
  ctx.check('battle consumed (no pending)', ready === -1);
  await page.close();
}
```

- `ctx.newPage(opts?)` opens a Playwright page, wires browser errors into the
  scene report, and defaults to a 1280×800 viewport.
- `ctx.snap(page, name, opts?)` compares the baseline through `snapCheck`. Pose
  the world and set camera before calling it. The runner chooses the baseline
  root from the scene file's owner folder, so `campaign/foo.mjs` writes
  `shots/campaign/` and `battle/foo.mjs` writes `shots/battle/`. Use
  `opts.baseDir` only when the shot belongs to a different owner, such as a UI
  snapshot captured while booting a campaign scene. Use `opts.baseline` only
  when a compatibility name is intentional.
  Pass `opts.maxDiffRatio` / `opts.threshold` ONLY for a noise source you can
  name in a comment.
- `ctx.check(name, ok, detail)` is the behavioral reporter; failures set the exit
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

`scenes/worlds.mjs` owns shared boot helpers for common worlds. A scene may use
one of those helpers or boot directly when the route/state is unique to that
scene. Keep repeated boot logic in `worlds.mjs`; keep one-off pose logic in the
scene file. `meta.world` is documentation and report metadata, not a magic
registry key.

**Real-map worlds** (for `flow` scenes — exercise the actual systems):
- `battle-real` — `?map=A&ai=off`, ready `window.__ready`, freeze
  `__game.freeze()`. Drive via `window.__game`
  (`select/setOrder/advance/groupMove/unitInfo/...`).
- `campaign-real` — menu → `#menu-new-campaign`, ready `__campaignReady`,
  freeze `__campaign.freeze()`. The full ~400-city map: garrison battles,
  save/load, territory, AI. Use when the behavior under test *needs* the real
  world, or when a visual test is specifically about geographic alignment, real
  LoD, fog, road/city/coastline accuracy, or whole-map readability.

**Test worlds and fixtures** (for `visual` scenes — minimal, deterministic,
contrast-clean):
- Campaign test scenes can boot `?campaign=test` and pose via `window.__campaign`
  (`freeze`, `cam`, `place`, `select`, `factionView`, `fogOfWar`).
- Battle scenes can use shared helpers in `scenes/worlds.mjs` for small real or
  synthetic battle states.
- Model scenes should use the model review routes and write under
  `shots/models/<battle|campaign|shared>/`.

Need a reusable test world that doesn't exist? Add a helper under
`web/scenes/` (or the app route it needs) and keep it deterministic. Pick the
**smallest world that exercises the thing under test**; reach for the real map
only when the real map is part of the requirement.

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

- [ ] Is this an isolated model/primitive? If so put the model/source and review
      shots under the matching `battle`, `campaign`, or `shared` model folder
      and use model/turntable/animation gates before composing it into a world.
- [ ] One file under `scenes/<owner>/<name>.mjs`, exporting `meta` + `run`.
- [ ] Does another scene already boot this *same* world? If it differs only in
      what it measures, add your `snap`/`check` THERE — don't author a second
      scene (or a second copy-paste setup) for the same world. A new scene
      is justified only by a genuinely different world.
- [ ] Exactly one `kind`: `visual` → a fixture world + at least one `snap`;
      `flow` → a real-map world + zero PNGs.
- [ ] `meta.world` names the smallest world that exercises the change; if you
      needed a reusable boot path, it lives in a scene helper or dedicated test
      route instead of ad hoc screenshot code.
- [ ] Every captured frame is a `snap()`; zero bare `page.screenshot({path})`.
- [ ] Each snap: freeze active, camera/state set, settle waited when necessary.
- [ ] `tier: 'full'` if it is slow/heavy (AI games, long advances); else quick.
- [ ] `flow` checks assert observable outcomes, not internals.
- [ ] Baselines committed under the matching `shots/<owner>/` folder; `git status` clean.
- [ ] You looked at the new baseline PNGs yourself.
