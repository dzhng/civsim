# Vibe checks

Manual, eyeball-it harnesses — **not** pass/fail gates. Each spawns a scenario,
screenshots it every N sim-seconds, and dumps the frames to flip through. The
`verify-*.mjs` harnesses *assert*; these just let you *look* (does a fight look
like a fight, does a rout flee home as a clump, does nobody get launched into
orbit).

Needs the dev server up (`npx vite --port 5173 --strictPort` from `web/`), and
the wasm current (`npm run build:wasm` after any `crates/` change).

## The sanity sweep (one command)

```sh
cd web
node vibe/all.mjs            # refresh EVERY scenario into web/vibe/shots/<name>/
JOBS=2 node vibe/all.mjs     # fewer in parallel (default 4)
```

Then flip through `web/vibe/shots/<name>/` — a folder per scenario, one PNG every
~20–30 sim-seconds (`t000s.png`, `t030s.png`, …). Add a row to the `SCENARIOS`
table in `all.mjs` when you add a scenario.

## Scenarios

| folder | script | what it shows |
|---|---|---|
| `heavy-both` | `duel-posture.mjs ATK=0 DEF=0 POSTURE=both` | heavy vs heavy, BOTH attack — two charges meet, each front wraps the other |
| `heavy-attack-defend` | `duel-posture.mjs ATK=0 DEF=0 POSTURE=hold` | same heavies, one attacks + one holds — attacker frays wrapping in, defender holds its line and dimples |
| `heavy-v-phalanx-defend` | `duel-posture.mjs ATK=0 DEF=3 POSTURE=hold` | heavy charges a holding pike wall — do the points stop the press? |
| `phalanx-v-heavy` | `duel-posture.mjs ATK=3 DEF=0 POSTURE=both` | pikes outreach swords |
| `cav-v-heavy` | `duel-posture.mjs ATK=6 DEF=0 POSTURE=both` | horse rides over swords |
| `cav-v-pike` | `charge.mjs ATK=6 DEF=3` | points stop horse (charge into a held pike wall) |
| `cav-v-heavy-held` | `charge.mjs ATK=6 DEF=0` | a braced line beats a charge |
| `heavy-v-archers` | `missile.mjs` | arrows attrite the advance, then melee |
| `rout-heavy` | `rout.mjs ATK=0 DEF=0` | a rout flees home as a clump (keeps shooting past the verdict) |
| `rout-cav-heavy` | `rout.mjs ATK=6 DEF=0` | same, cavalry breaking |
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
NAME=my-test ATK=2 DEF=0 node vibe/duel-posture.mjs # write to shots/my-test/
```

Class ids: 0 heavy · 1 light · 2 longsword · 3 phalanx · 4 archers ·
5 skirmishers · 6 cavalry · 7 horse archers · 8 artillery · 9 peasant.

## Where the shots go

`web/vibe/shots/<name>/` — **gitignored**, throwaway, never baselines. (Pixel-exact
regression baselines live in `web/shots/baseline/` and are owned by the verify
harnesses; don't mix the two.)

## Adding a scenario

Shared plumbing is in `_lib.mjs`: `openBattle(query)` boots into a battle and
waits for the debug bridge; `vibeCapture(page, name, { frame, sample, label,
done })` runs the screenshot loop (position camera → freeze → snap → advance,
until `done`); `fitDuel`/`duelSample`/`duelLabel`/`CLS` cover the common
two-unit case. A new scenario is a dozen lines — copy `duel-posture.mjs` — then
add it to the `SCENARIOS` table in `all.mjs` so the sweep includes it.
