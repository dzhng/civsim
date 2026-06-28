# Slice 6 — Personas

## Contract

Factions optimize for different things and carry different randomness profiles.
Mechanically a persona is just a preset of slice-3 `Weights` + slice-5 noise
knobs — **not** a separate code path. The `AiPersona` enum already exists and
its doc comment anticipates exactly this (`mapdata.rs:57-66`: "adding a persona
… is a new variant plus its branch — nothing else hardcodes a faction by id").

## API seam

- **Extend** `crates/campaign/src/mapdata.rs AiPersona`:
  ```rust
  pub enum AiPersona {
      Neutral,        // exists: garrison only, never campaigns()
      Expansionist,   // exists: today's behavior = default profile
      Defensive,      // turtle
      Mercantile,     // builder
      Opportunist,    // jackal
      Calculating,    // cold optimizer
      Warmonger,      // brave / chaotic
  }
  ```
  Update `parse()` (`mapdata.rs:71`) with the new string keys, and
  `campaigns()` (`mapdata.rs:84`) — all new variants campaign (return `true`);
  only `Neutral` stays false.
- **One profile table** — `crates/campaign/src/ai/persona.rs`:
  ```rust
  pub struct Profile {
      pub weights: eval::Weights,   // what it optimizes
      pub gate: f64,                // attack threshold multiplier (vs 1.3)
      pub temp: f64,                // softmax temperature
      pub sigma: f64,               // perception noise
      pub bravado_band: f64,
      pub prefer_build: bool,       // bias spend toward markets vs army
  }
  pub fn profile(p: AiPersona) -> Profile
  ```

### Persona presets (starting point — all tunable)

| Persona | weights bias | gate | temp | sigma | feel |
|---|---|---|---|---|---|
| Expansionist | territory↑ army↑ | 1.2 | mid | mid | today's relentless power |
| **Defensive** | threat↑↑ territory↑, army defensive | 1.8 | low | low | holds cities, retakes only |
| **Mercantile** | income↑↑ then army | 1.6 | low | low | `prefer_build`, late powerhouse |
| **Opportunist** | army↑ cheap-gain, threat-averse | 2.2 | mid | mid | pounces on the weak, dodges fair fights |
| **Calculating** | balanced, win-prob | 1.5 | **very low** | **very low** | cold chess engine |
| **Warmonger** | enemy-loss↑, own-loss-blind | 1.0 | **high** | high | brave, near-parity attacks |

Defensive/Mercantile feed the eval weights *and* bias the existing spend block
(`prefer_build` tilts recruit-vs-market in `think()` step 2). Opportunist's
high `gate` + threat-aversion is what makes it prey on weakness. Calculating vs
Warmonger are mostly the temp/sigma extremes of slice 5.

## What the human can run / see

- A fixture map seeding one faction per persona; run a campaign and watch the
  characters emerge: the turtle hunkers, the merchant out-economies then buys a
  war, the jackal snipes the wounded, the warmonger throws itself in.
- Persona-tagged probe output (slice 3) so each faction's scored choices read
  in-character.

## Verifies

Per-persona **behavioral** tests (the `write-tests` seed-set style — measure the
mechanism, not noise), each a small scripted scenario:

- **Defensive** given a beatable neighbor still mostly holds; counterattacks
  only to retake a lost city. (low offensive march rate)
- **Opportunist** ignores a near-parity enemy but marches the instant a
  neighbor is visibly weakened (drop its garrison mid-test → it pounces).
- **Mercantile** builds markets first and fields its big army later than
  Expansionist (compare income/army curves at a sample day).
- **Warmonger vs. Calculating** on identical setups: Warmonger commits to more
  near-parity fights (higher attack count), Calculating fewer but higher-win-prob.

## Stays green

- `campaigns()` dispatch stays a single match (no per-faction-id hardcoding).
- Existing maps (only Expansionist/Neutral today) behave exactly as before —
  Expansionist's profile == the slice-4/5 defaults.
- `full_game.rs` still converges for every persona mix.

## Feedback that would change this

- Persona *names and count* are David's call — this set is a proposal.
- Note: "fixates on a nemesis" is **not** a persona — rivalry is a relationship
  every faction can have regardless of persona. It lives in
  [slice 8 (rivals)](08-rivals.md), and biases any persona's decisions.
