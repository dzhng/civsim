# Vibe checks

Each vibe scenario spawns a battle and **films a timeline** — a frame every N
sim-seconds, from the approach through contact, the grind, the break, and a few
frames past the verdict (so you always see *how* the loser routs: a clump
fleeing home, not a scatter). You flip through the frames to see whether a fight
looks like a fight.

Every frame is **also a committed pixel-regression baseline.** There is no
longer a "review-only" tier: a vibe frame is at once the picture you eyeball,
the image that shows up in a PR diff, and a gate that turns red when a downstream
mechanics change moves the battle. They run through the same `snapCheck`
primitive (`../snapshot.mjs`) the verify harnesses use, so the discipline is
identical — see the **screenshot-regression** skill.

- **Where the shots live:** `web/shots/vibe/<scenario>/t###s.png` —
  committed. (Highlighted diffs from a failed frame land in
  `web/shots/diff/vibe/...`, gitignored.)
- **First run** of a new scenario creates its baselines and passes
  ("baseline created") — commit them.
- **Later runs** compare every frame; a scenario exits non-zero on any drift.
- **Re-bless** an intended mechanics/visual change with `UPDATE_SHOTS=1`, then
  commit the new baselines — the git image-diff *is* the visual review of what
  the change did. A full re-bless clears each scenario folder before writing,
  so stale tail frames from an older, longer timeline cannot survive. Targeted
  `SNAP=...` runs do not clear the folder.

Needs the dev server up (`npx vite --port 5173 --strictPort` from `web/`), and
the wasm current (`npm run build:wasm` after any `crates/` change — the browser
runs the prebuilt binary, never your live Rust).

> **Weave shots are separate.** The WEAVE layer (mass-spring lattice, tested in
> `crates/sim/tests/mechanics_weave.rs`) has its own Rust picture generator —
> `cargo run -p sim --example weave_shots`, landing in `web/shots/weave/`
> (committed for visual review). It reduces variables to the bone (single units, same-team
> presses, invulnerable clashes) and deliberately does NOT go through this
> web/Playwright harness; keep it out of the combat scenarios below.
> `t3-col-bulge` is the canonical column-through-held-line picture; the older
> `column-vs-held` shot used the same geometry with extra mortality/noise and
> was removed as duplicate review work.

## The sanity sweep (one command)

```sh
cd web
node vibe/all.mjs                 # check EVERY scenario against its baselines
JOBS=2 node vibe/all.mjs          # fewer in parallel (default 4)
UPDATE_SHOTS=1 node vibe/all.mjs  # re-bless after an intended mechanics change
```

A scenario that drifts exits non-zero; the sweep lists which, and the
highlighted diffs are under `web/shots/diff/vibe/<name>/`. Review the baselines
in `web/shots/vibe/<name>/` — one folder per scenario, one PNG every
~20–30 sim-seconds (`t000s.png`, `t020s.png`, …). Add a row to the `SCENARIOS`
table in `all.mjs` when you add a scenario.

## Scenarios

| folder | script | what it shows |
|---|---|---|
| `heavy-both` | `duel-posture.mjs ATK=0 DEF=0 POSTURE=both` | heavy vs heavy, BOTH attack — two charges meet, each front wraps the other |
| `heavy-move-clash` | `move-clash.mjs ATK=0 DEF=0` | same heavies, both MOVE toward each other's start — should resemble a clash without charge bonuses |
| `heavy-attack-defend` | `duel-posture.mjs ATK=0 DEF=0 POSTURE=hold` | same heavies, one attacks + one holds — attacker frays wrapping in, defender holds its line and dimples |
| `heavy-v-phalanx-defend` | `duel-posture.mjs ATK=0 DEF=3 POSTURE=hold` | heavy charges a holding pike wall — do the points stop the press? |
| `phalanx-v-heavy` | `duel-posture.mjs ATK=3 DEF=0 POSTURE=both` | pikes outreach swords |
| `pike-v-pike` | `duel-posture.mjs ATK=3 DEF=3 POSTURE=both` | two pike walls, both attack — points-out standoff |
| `cav-v-heavy` | `duel-posture.mjs ATK=6 DEF=0 POSTURE=both` | horse rides over swords |
| `cav-v-pike` | `charge.mjs ATK=6 DEF=3` | impale/charge gate: cavalry may wrap a narrower pike front; presented points stop only what hits frontally |
| `cav-v-pike-wall` | `charge.mjs ATK=6 DEF=3 WALL=1` | frontal control: wide pike wall leaves no exposed flank, so horse should bog on the points |
| `cav-v-pike-flank` | `charge.mjs ATK=6 DEF=3 FLANK=1` | side-on control: pikes face north, so horse crossing the shafts should trample deeper |
| `cav-v-heavy-held` | `charge.mjs ATK=6 DEF=0` | a braced line beats a charge |
| `heavy-v-archers` | `missile.mjs` | arrows attrite the advance, then melee |
| `penetration` | `penetration.mjs` | DEFENSE: one column punches a wide held line (does it dimple + close?) |
| `multi-penetration` | `multi-penetration.mjs` | DEFENSE: three columns at once (does the breach logic generalize?) |
| `offense` | `offense.mjs` | OFFENSE: a wide attacking line onto a block (does it wrap/envelop?) |
| `surround` | `surround.mjs` | 3v1: a square block held, surrounded front/side/back (does the weave hold?) |
| `surround-attack` | `surround.mjs ATTACK=1` | same composition, but the middle sallies out — see what the attack order changes |

Run one on its own to iterate, overriding the matchup by class id:

```sh
node vibe/duel-posture.mjs                          # default heavy vs heavy, both attack
ATK=3 DEF=6 POSTURE=both node vibe/duel-posture.mjs # phalanx vs cavalry
ATK=0 DEF=3 POSTURE=hold node vibe/duel-posture.mjs # heavy attacks a holding phalanx
ATK=6 DEF=3 node vibe/charge.mjs                    # cav charges a held phalanx
ATK=6 DEF=3 WALL=1 node vibe/charge.mjs             # cav hits a wide phalanx front
ATK=6 DEF=3 FLANK=1 node vibe/charge.mjs            # cav hits the same phalanx from the side
NAME=my-test ATK=2 DEF=0 node vibe/duel-posture.mjs # baselines under shots/vibe/my-test/
```

Class ids: 0 heavy · 1 light · 2 longsword · 3 phalanx · 4 archers ·
5 skirmishers · 6 cavalry · 7 horse archers · 8 artillery · 9 peasant ·
10 light sword · 11 heavy spear · 12 medium infantry · 13 medium spear ·
14 shock-cav sidearm look.

## The model turntable (`turntable.mjs`)

Not a battle — a 360° review of the 3D soldier models. Boots the WebGPU
skinned-soldier lab route, orbits each class through 8 facings × 4 stances
(ease / ready / attack / march), and snap-checks one contact sheet per class
against `web/shots/models/shared/turntable/<id>-<class>.png`. Same deal: the
sheet is what you review AND a gate — an unintended geometry/renderer change
turns a class red.

```sh
node vibe/turntable.mjs                 # all class looks, hero 3/4 angle
ONLY=0,3,6 node vibe/turntable.mjs      # just these class ids
PITCH=ingame node vibe/turntable.mjs    # the battle's real top-down tilt (review only)
UPDATE_SHOTS=1 node vibe/turntable.mjs  # re-bless after a model change
```

## Adding a scenario

Shared plumbing is in `_lib.mjs`: `openBattle(query)` boots into a battle and
waits for the debug bridge; `vibeCapture(page, name, { frame, sample, label,
done })` runs the screenshot+regression loop (position camera → freeze →
snapCheck → advance, until `done`) and returns `{ frames, resolved, fails }`;
`fitDuel`/`duelSample`/`duelLabel`/`CLS` cover the common two-unit case. A new
scenario is a dozen lines — copy `duel-posture.mjs`, end with
`process.exit(fails)` — then add it to the `SCENARIOS` table in `all.mjs`.
