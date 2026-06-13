---
name: write-scenario
description: How to write a verification scenario — an addressable, individually-runnable case that boots one world (real map or test map) and asserts one or more visual snapshots and/or behavioral checks. Use when adding or restructuring browser verification for the battle or campaign frontend.
---

# Writing a scenario

A **scenario** is the unit of browser verification: one named, individually-
runnable case = a declared *world* (which game state to boot) + one or more
*tests* against it (visual snapshots, behavioral checks, or both). Scenarios
live in `web/scenarios/*.mjs`, one per file, run by `web/scenario.mjs`.

> If `web/scenarios/` does not exist yet, the architecture is still specced in
> `specs/scenarios.md` and not built — implement that first. The three legacy
> harnesses (`verify-battle.mjs`, `verify-campaign.mjs`,
> `verify-campaign-visual.mjs`) are the pre-scenario world; the same rules
> below still apply to snaps inside them.

## The one rule that defines the architecture

**Every screenshot a run writes is a blessed regression baseline.** The only
PNGs that exist are `shots/baseline/<scenario>/<name>.png` (committed ground
truth, compared at zero tolerance) and `shots/diff/<name>.png` (transient,
gitignored, written only on failure). There is **no** third category. Never
write a bare `page.screenshot({ path: ... })` to a tracked location — a shot
nobody asserts on is not data, it is detritus that dirties the tree every run
and tempts you to gitignore it. If a frame is worth capturing, capture it with
`snap()` so a future run guards it. If it is not worth a baseline, do not write
it. (This is why the smell "I want to gitignore `shots/*.png`" means the harness
is writing shots no test owns — see `specs/scenarios.md`.)

## Anatomy of a scenario

```js
export const meta = {
  name: 'campaign-markers',      // unique, kebab; CLI selects by this
  world: 'campaign-test',        // key into scenarios/worlds.mjs ('none' = no boot)
  describe: 'Army & city markers over road / our city / neutral city.',
  tier: 'quick',                 // 'quick' = default run; 'full' = release-only
};

export async function run({ page, check, snap, world }) {
  // The world is already booted, frozen, at the 1280x800 viewport.

  // A visual test: snap() is the ONLY way a PNG gets written.
  await snap('overview', { cam: [0, 450, 16] });
  await snap('army-road', {
    before: () => page.evaluate(() => window.__campaign.place(0, 1, 0, 4)),
    cam: [0, 450, 20],
  });

  // A behavioral test coexists in the same scenario; it writes no PNG.
  const army = await page.evaluate(() => window.__campaign.armies().find(a => a.mine));
  check('test campaign boots with a player army', !!army, `${army?.soldiers} soldiers`);
}
```

- `snap(name, opts?)` runs `opts.before()` (pose the world), sets `opts.cam`
  `[x, y, scale]`, waits `opts.settle ?? 250`ms for a frame, then compares the
  baseline at `shots/baseline/<scenario>/<name>.png`. Pass `opts.maxDiffRatio`
  / `opts.threshold` ONLY for a noise source you can name in a comment.
- `check(name, ok, detail)` is the behavioral reporter; failures set the exit
  code. Assert observable outcomes (positions, casualties, soldier counts,
  rendered frames) — never internal call order.

## Choosing the world

`scenarios/worlds.mjs` owns boot + readiness + freeze for each world; a
scenario just names one in `meta.world`:

- `battle` — `?map=A&ai=off`, ready `window.__ready`, freeze `__game.freeze()`.
  Drive via `window.__game` (`select/setOrder/advance/groupMove/unitInfo/...`).
- `campaign-real` — menu → `#menu-new-campaign`, ready `__campaignReady`,
  freeze `__campaign.freeze()`. The full map: garrison battles, save/load,
  territory. Use when the behavior under test needs the real world.
- `campaign-test` — `?campaign=test`, the controlled one-road / two-city fake
  map (`buildTestCampaign` in `main.ts`), opened at `deviceScaleFactor: 2`.
  Our city (Roma) — a road — a neutral city (Neapolis), one mixed-roster player
  army. Teleport it with `window.__campaign.place(0, kind, a, b)` (kind 0 =
  node index, 1 = edge tile) to pose over road / our city / neutral city
  exactly. **Prefer this for marker/model rendering** — no red-on-red contrast,
  no garrison battle, fully deterministic.
- `none` — no `goto`; for a pure-DOM route like the banner gallery
  (`?test=banners`). The scenario navigates itself.

Pick the **smallest world that still exercises the thing under test**. A marker
rendering change is a `campaign-test` scenario; a conquest-flow change is a
`campaign-real` scenario. Don't reach for the real map to snap a model.

## Determinism is non-negotiable

Every snap must satisfy the full checklist in the `screenshot-regression`
skill — fixed 1280×800 viewport, explicit camera, frozen clock, snap on Day 1
*before any `tick()`*, wait after moving the camera. The world helper freezes
on boot; if your scenario unfreezes (`world.freeze(false)`) to drive time,
re-freeze before the next snap. A snap with no active freeze goes flaky and
will fail on someone else's machine first.

## Running and blessing

```sh
# dev server first (this machine: :5174; export VERIFY_URL accordingly)
node scenario.mjs                       # all quick scenarios
node scenario.mjs --full                # include tier: 'full'
node scenario.mjs campaign-markers      # just one scenario (by meta.name)
SNAP=overview node scenario.mjs campaign-markers   # one snap within it
UPDATE_SHOTS=1 node scenario.mjs campaign-markers  # re-bless its baselines
```

`git status` must be **clean after any run**. If a run leaves dirty PNGs, a
snap is missing or a bare `page.screenshot` slipped in — fix that, don't
restore-and-ignore.

## Before you say a visual scenario is done

Per the `screenshot-regression` skill: **open the actual PNG and look at it.**
A green run only proves the frame matches the baseline — and if you just
blessed that baseline, you certified it. Confirm with your own eyes that the
frame shows what you claim before reporting, and look at any baseline you
re-blessed.

## Checklist for a new scenario

- [ ] One file `scenarios/<name>.mjs`, exporting `meta` + `run`.
- [ ] `meta.world` is the smallest world that exercises the change.
- [ ] Every captured frame is a `snap()`; zero bare `page.screenshot({path})`.
- [ ] Each snap: freeze active, camera set, settle waited.
- [ ] `tier: 'full'` if it is slow/heavy (AI games, long advances); else quick.
- [ ] Behavioral checks assert observable outcomes, not internals.
- [ ] Baselines committed under `shots/baseline/<name>/`; `git status` clean.
- [ ] You looked at the new baseline PNGs yourself.
