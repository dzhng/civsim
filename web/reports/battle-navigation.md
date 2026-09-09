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
| `menu-renderer-shell-visual.mjs`, `menu-quick-battle-modal` | Saved image contains blocky placeholder portraits and a random map thumbnail; comparison differs in the portrait tiles. | Saved image contains all 15 authored portraits, waits for image decoding and map preview completion, and fixes the preview seed. Repeat differs by 0 pixels. | The user identified the stale screenshot; refreshing this test image aligns it with the already-deployed card assets. **carried-in** |

No unit stats or Rust simulation mechanics changed. The menu screenshot was
refreshed after the user identified its stale placeholder portraits. Its fresh
visual critique confirmed every portrait is present, with no missing-image or
clipping defects. Existing presentation limitations remain: several infantry
portraits are small and similar, and thin weapons are hard to distinguish at
card scale. Army faction identity is carried by the card border rather than a
separate set of portraits.

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

## Live verification

Production deployment `36753435` passed the actual root-menu → battle-setup →
run flow in hardware Chrome. The loading cover kept the battle at tick zero;
the battlefield then rendered, Back restored setup, and the running URL
survived reload without page errors. The direct setup route was also exercised
in the in-app browser. Live response headers confirm year-long immutable
caching for versioned appearance files and normal revalidation for route HTML.

Measured battle-document transfers (the menu had already loaded the app shell):

| Visit | Transfer | Time from loading capture/navigation to ready |
| --- | --- | --- |
| Cold battle | 36,016,567 bytes | 27.9 seconds |
| First revisit | 9,261,315 bytes | 11.6 seconds |
| Subsequent reload | 4,200 bytes | Not timed |

The cold battle made three image requests. Byte reuse within one catalog load
chooses the first responding copy of each hashed image; another visit can pick
a different versioned URL, explaining why the first revisit still fetched some
image bytes. Browser caching subsequently served those copies too. GPU
preparation still happens even when all model bytes are cached.

Fresh live screenshot review confirmed terrain, formations, cards, minimap and
HUD are populated. It also noted existing distant-unit contrast, truncated card
names, and possible bottom-army occlusion by the HUD at the overview camera;
these are separate from loading visibility.
