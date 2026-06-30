# Campaign AI

The faction commander that plays a non-player power on the campaign map. It
lives in `crates/campaign/src/ai.rs` (`commanders` → `think`), and its tunable
constants are the `AI_*` block in `crates/campaign/src/tunables.rs`.

## Doctrine

The AI is **credible, not clever**. Three rules keep it honest:

- **It issues only orders a player could issue** — march, recruit, build, merge,
  upgrade. There is no privileged action and no cheating with money or troops.
- **It sees only through its own fog of war.** `think` reads the same
  per-faction visibility set the player's map reads (`st.visible[f]`), so a
  hidden army or a sprung ambush surprises the AI exactly as it would a human.
  This is what keeps player stealth meaningful.
- **It thinks on a cadence, not every tick.** `commanders` runs every 60 ticks
  (one campaign hour). Orders are *idempotent intent* (re-issuing "march to X"
  preserves progress), so thinking hourly never stutters a march.

Independent (neutral) cities garrison themselves but never campaign — `think`
skips the `independents` faction entirely.

## What it knows each cycle

At the top of `think`, the commander gathers, for faction `f`:

- `my_cities` — the nodes it owns (if none, it is landless and does nothing).
- `hostiles` — every **visible** enemy army, as `(id, location, strength)`.
- `my_free` — its own armies free to take orders (`free_army`: alive, not in an
  encounter, not a city garrison, not routed / at sea / occupying).

"Strength" everywhere is cost-weighted manpower: `Σ count × upkeep_per_soldier`
(`strength()`), the same yardstick used to size up a roster's value.

## The four phases (in order)

### 1. Defend
For each owned city with a visible hostile within ~10 road tiles, sum the
threat's strength. If the city's own garrison can't match it **and** no free
army is already nearby (≤2 tiles), the nearest free army of meaningful strength
(≥¼ of the threat) is recalled to the city.

### 2. Economy — solvent and supplied
The commander keeps a **war chest** of `AI_RESERVE_DAYS` of income and only
spends above it (`solvent`). While solvent it, in priority order:

- **Recruits** toward a 50 / 25 / 25 line / ranged / cavalry mix at its
  highest-tier city — but only while its field army is below the **supply
  ceiling** `cities × AI_SOLDIERS_PER_CITY`. Army size is therefore bound by
  *territory*, not gold: upkeep is ~1% of income and never bites, so the way to
  field a bigger army is to conquer more cities. This replaced an older rule
  that recruited whenever it had >400 gold, which ballooned armies to 3× while
  treasuries hit zero and triggered a desertion death-spiral.
- **Builds a market** (an income investment) at its richest market-able city.
- **Paves the worst road** out of its capital.

### 3. Offensive — mass + advance to contact
The **strongest `AI_ATTACKERS` free armies** each go on the attack (not just
the single strongest — that caused a freeze where one army won a fight then
wandered off while the front held). For each attacker:

- One road-cost flood (`pathfind::costs_from`) finds the cost to *every*
  reachable enemy city — no distance cap, so a target across an independent
  buffer is still seen.
- It assaults the **nearest enemy city it can clearly beat** — "beat" = its
  strength exceeds (city garrison + visible enemy field armies within
  `AI_THREAT_RADIUS`) by 30%. Only the nearest `AI_TARGET_CANDIDATES` cities get
  this defender probe (the probe is a small BFS, cheap but not free).
- If none of those is beatable, it **advances on the nearest enemy city
  anyway**. Sitting in the interior once the local independents are gone is what
  froze the mid-game; a power must keep projecting force to its frontier.

Committing several armies keeps a front pressed, so a beaten enemy gets run down
by the next army (see *Routs* below) instead of regrouping unmolested.

### 4. Consolidate
Idle armies that are small (below 60% of the faction's mean army strength) and
not marching either merge into an adjacent larger friendly army or walk home to
the nearest city. Bigger armies on the offensive are left alone.

## How the AI interacts with routs

When the AI wins a field battle, the loser routs. A routed army is intangible
**only to the one army that beat it** while it breaks away; every other hostile
can run it down, and once it has outrun its pursuer a short regroup window opens
(`ROUT_REGROUP_TICKS`) during which anyone in contact destroys it
(`sim::run_down_routers`). The mass-offensive doctrine exists partly to exploit
this: with several armies pressing a front, a broken enemy is caught and
finished rather than escaping to fight again. A loser with no hostile-free road
out is annihilated outright at battle's end (`resolve::rout_path` → `None`).

## Tunables (`tunables.rs`)

| Constant | Meaning |
|---|---|
| `AI_RESERVE_DAYS` | Days of income kept as a war chest before any spending |
| `AI_SOLDIERS_PER_CITY` | Field-army supply ceiling per owned city |
| `AI_ATTACKERS` | How many of the strongest free armies attack per cycle |
| `AI_TARGET_CANDIDATES` | Nearest enemy cities given the defender probe |
| `AI_THREAT_RADIUS` | Tiles within which a visible enemy army counts as a city's defender |

## Known frontier

After the powers consume the neutral cities they tend to settle into a
**six-power standoff at parity** — peer borders don't break because the assault
test needs a 30% local edge. It's a believable tense mid-game, but does not
resolve to a single victor on a short horizon. Pushing past it (coordinated
multi-army assaults on one target, siege/attrition of besieged cities) is open
design work; see the campaign-loop measurement notes.
