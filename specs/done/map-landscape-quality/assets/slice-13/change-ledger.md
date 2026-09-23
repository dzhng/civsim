# Change ledger

- `landscape-materials`: previously checked explicit campaign and battle material profiles only; now also checks authored-null slope input equals the explicit default profile, preserves source arrays and produces no GPU warnings. Additional semantic controls distinguish authored prop footprints (retain source color) from generated exposed-rock classification (changes response). This covers the missing authored material branch without inventing gameplay slope metadata.
- `battle-landscape-character` (new): captures the authored A/C rock patches through the production battle world with ground/scenery isolation, checks original ground cover and null gameplay slope metadata, and guards the isolated frames exactly.
- Existing CPU tests are unchanged; all 489 pass. No physical or terrain hash baseline is changed.
