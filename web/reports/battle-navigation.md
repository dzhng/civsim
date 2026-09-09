# Battle navigation and loading verification

The production cold-load probe transferred 213,321,359 bytes and did not report
a ready battlefield until about 60 seconds after Launch. The canvas stayed at
its default 300×150 size during downloads. The complete catalog contains 60
image URLs but only three SHA-256 image identities; this change downloads each
identity once per catalog transaction.

## Choices audit

- **Sound, medium confidence:** ordinary document navigation owns route changes
  and browser history. It disposes the entire page on navigation; cached assets
  avoid repeated transfers, but GPU resources are prepared again. Battle URLs
  describe starting setups, not in-progress saves.
- **Sound, high confidence:** pause simulation until both renderer startup and
  first-frame preparation finish. Readiness belongs to the scene, not its debug API.
- **Sound, high confidence:** reuse bytes by the baker's full content hash within
  one catalog transaction and origin. Other image URLs retain URL identity;
  explicit catalog reload starts a fresh transaction.
- **Sound, high confidence:** immutable caching applies only to versioned
  appearance directories. The unversioned catalog retains revalidation.

## Change ledger

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `appearance.test.mjs`, cross-directory image fixture | Two appearance paths download two copies of the same atlas; regression probe measured 2 requests for 1 image identity. | Both bundles contain identical image bytes and make 1 request for that identity. | Content-addressed image reuse removes duplicate downloads. **moved** |
| `menu-renderer-shell.mjs`, `returnBattleToMenu` | Exiting a battle keeps the document and reaches the main menu with `__ready === false`. | Exiting reaches the setup URL; Back reaches the root menu in another document. | Browser navigation owns scene lifetime. The test now waits for the actual route and menu. **moved** |
| `menu-renderer-shell.mjs`, campaign return | Polls the old menu element immediately after Exit. | Waits for the root URL and mounted menu before reading its GPU status. | A document transition temporarily has no menu DOM. The visible outcome remains a GPU-aware main menu. **moved** |

No unit stats or Rust simulation mechanics changed. No existing screenshot
baseline was re-blessed. The older `menu-quick-battle-modal` baseline still
contains placeholder model portraits and differs from the authored portraits;
that pre-existing visual baseline is outside this change.

## Checks

- Web suite: all 407 tests passed.
- Typecheck and production-mode web build passed.
- Appearance bake/loader tests passed; the new duplicate-image assertion was
  observed red before the implementation and green afterward.
- Hardware Chrome navigation scene passed loading-at-tick-zero, first-frame
  readiness, Back, Forward, setup reload and run reload. The loading snapshot
  repeated with zero differing pixels.
- Hardware Chrome existing menu flow passed battle creation/settings/exit,
  manual, campaign creation/settings/exit, and unsupported-GPU menu behavior.
- Independent code review found seed-range and old exit-test assumptions; both
  were fixed, and the follow-up review found no actionable issues.
- Fresh visual critique found no concrete defects in the loading screen.
