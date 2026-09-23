# Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| growing a connected forest preserves density and identities in its existing area | Newly added regression fails: increasing connected area removes previously placed trees because the same 240 slots are redistributed | Passes: existing-region tree positions, sizes, species, rotation and shade remain identical in this normal-sized forest | Large forests should retain the same visual density as small forests until the explicit exceptional-component bound |

No existing test expectations were repinned or removed. The six-fixture placement counts and unchanged source hashes are recorded separately. The two pending composition-scene edits and their missing canonical images remain outside the runtime commit.
