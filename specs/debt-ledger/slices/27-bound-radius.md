# 27 — bound-radius

**Contract unlocked:** a formation's circumscribing radius has one owner; the
"nearest steel" gap is computed once. This is the one sim slice allowed to
move the golden hash. Last in lane S so every earlier slice proved itself by
hash identity.

## Seam

```rust
impl Unit {
    /// Half-diagonal of the frame: the one circumscribing radius.
    pub fn bound_radius(&self) -> f32 { 0.5 * self.width().hypot(self.depth()) }
}
```

`unit.rs:280 pivot_radius()` already is this; rename and make it the owner.
Four formulas exist today:

| form | sites |
|---|---|
| `0.5*w.hypot(d)` | `sim.rs:1318, 1896-1897`, `unit.rs:280` |
| `0.5*w.max(d)` | `sim.rs:1641-1642`, `collision.rs:191,197`, `combat.rs:216,221`, `missiles.rs:200`, `morale.rs:138,213` |
| `0.5*(w+d)` | `sim.rs:1019, 1029` (slot policy) |

`deliver_orders` (1636-1643) and `mounted_threat_near` (1890-1898) re-derive
the gap inline; both consume `nearest_enemy` over `threat_snapshot`.

Firewall: `width()` = `(files-1)*sx` (gaps) and `depth()` = ranks·sy (cells)
are asymmetric; do not "fix" that here — it is a mechanics change.

## Sub-slices

- **27a** — hypot sites → `bound_radius()`. No behaviour change; G-infra
  identical.
- **27b** — `max` sites, one file per commit (collision → combat → missiles →
  morale → `sim.rs:1641`). Thresholds widen by up to 41 %; after each commit
  run the full suite, classify each red with tweak-mechanics (mechanism vs
  pinned expectation; memory: a test can encode wrong reality), re-pin
  individually. Never fix a balance pin by changing physics or a tunable.
- **27c** — the `0.5*(w+d)` slot-policy sites. Decide whether they are the
  same concept: if the slot policy needs a footprint (frame extent for
  placement) rather than a threat radius, it gets its own named owner
  `frame_extent()` with a doc sentence saying why, and this is recorded in
  `choices.md`; otherwise fold into `bound_radius()`. Two concepts may have
  two owners; two owners of one concept may not.

## Decisions resolved here

`hypot` is canonical for every threat/engagement consumer. Stacked-comment
convention in `golden.rs:59-71` for the re-pin. `change-report` mandatory;
`codex review --uncommitted` on 27b.

## Delegated to the implementer

27c's verdict (with rationale recorded).

## Verification

G-infra (re-pinned), G-mech (`mechanics_morale` at_ease), G-scn
(`scenario_cavalry`), G-bal, then G-wasm + G-verify-full (battle scenes may
move if engagement distances changed — the ones that do are named in the
change report and re-blessed individually with `screenshot-critique`).

## Must stay green

Everything not named in the change report. If more than `golden`,
`mechanics_morale`, `scenario_cavalry`, and `balance_*` move, stop and
reslice per consumer.

## Feedback that would change this slice

David judging a widened engagement threshold wrong on the vibe → that
consumer keeps a named slack constant (`+ SLACK`) re-derived so its distance
is preserved; still one radius owner.
