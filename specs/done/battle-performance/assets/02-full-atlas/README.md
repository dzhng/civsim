# Full-catalog property atlas preparation

All twenty appearances in the current soldier catalog were freshly baked by the
production Three property-atlas author and admitted by the separate pure runtime
loader. Input identity and stored payload hashes passed for every appearance;
the authoring browser reported no errors or warnings. The catalog was published
only after all appearances and the result report succeeded.

The twenty gzip payloads total 8,040,826 bytes. Their complete decoded RGBA8 mip
chains total 188,743,200 bytes (about 180 MiB of logical texture data, excluding
GPU allocation overhead). Sequential authoring bounds preparation concurrency;
it does not reduce full-catalog texture residency when a renderer keeps every
atlas uploaded. The initial output files total 8,058,310 bytes before this README.
The run stayed below its 400 MiB fresh-write quota and two-minute per-appearance
deadline.

`verifiedFreshSource: false` in this bake report means a second independent bake
was not requested. It is not an integrity failure. The full catalog has not yet
passed the separate strict repeat-bake comparison, and prior fixture evidence
records occasional one-code differences between source bakes. These artifacts
establish complete prepared input coverage and byte identity, not full-scene
visual or performance parity. Alternative renderers load the same persisted bytes
without importing Three into their live renderer.
