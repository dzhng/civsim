# Offline property atlases

An impostor atlas is an authored material-property asset, independent of live sun,
sky, exposure or faction. The asset package owns its Three baker and material/image preparation in an
authoring browser. Battle renderers load its output; they do not load Three
or recreate the bake during a battle. The shared [view projection](../../src/impostorTile.ts)
contains only CPU math used by both authoring and runtime tile selection.

The bake preserves the manifest's fixed far pose, hemi-octahedral views, shared
model-space anchor, framing, double-sided properties and transparent margins.
Albedo remains sRGB; encoded normals/contact and ORM/faction mask remain linear.
Every mip is copied from the source texture. In particular, the source bilinear
mip policy is not replaced with area averaging, normal renormalization, image
re-encoding or independently filtered tiles.

The package's [atlas contract](../../src/impostorAtlas.ts) owns default dimensions,
policy revision, relevant-input identity and the channel/mip byte layout. Bump its
policy revision whenever source property/normal/contact or atlas filtering rules
change. The input digest covers the exact posed geometry, index representation,
material table, texture bytes and sampler settings. A display-name change does not
invalidate rendering data. Payload digests catch damaged transport; stale input
or policy rejects before payload download. A fresh source check remains required
before comparing a complete alternative backend.

From the repository root, with an exclusive GPU slot:

```
bun run --cwd web bake:impostors --classes 0,3,6 --out throwaway/impostor-atlas
bun run --cwd web bake:impostors --classes 0,3,6 --out throwaway/impostor-atlas --check
```

The tool starts and closes its own authoring server/browser. The ordinary asset
pipeline can run `bun run --cwd web bake:impostors --all` after `bake:roster`, then
repeat with `--all --check`. Default output is beneath the public soldier asset
root. Existing matching payloads are loader-verified and reused; `--check` also
rebakes and compares against the current source, without changing the catalog.
Content-addressed files are written before the catalog switches, and a failed
appearance prevents that switch while preserving a failure report. Selected-class
runs do not claim that a full catalog exists or has been verified.

Each appearance has a two-minute deadline covering input hashing, baking, disk
publication and loader verification. Timeout aborts that appearance, closes the
authoring browser and stops the sequence; aborted work cannot begin another write,
and a late completion cannot switch the catalog.
Fresh writes are charged against a 400 MiB run quota, including temporary output,
with 4 MiB reserved for failure evidence. Quota exhaustion stops the run before
replacing the catalog. Only this run's uniquely named temporary files are cleaned
up; prior content-addressed assets remain untouched. These limits can be supplied
explicitly with `--timeout-ms` and `--max-output-mib`.

Full-catalog GPU residency is the sum of the complete property mip payloads.
Loading appearances sequentially bounds preparation memory; it does not remove
that full-catalog GPU residency cost. The report records selected appearance count, decoded bytes and charged
fresh output separately. Previously written versions can occupy additional disk
space because this tool does not garbage-collect authored assets.

`loadImpostorAtlas` is the shared runtime path for all three candidate backends.
It fetches compressed bytes, bounds decompression to the exact expected size,
checks both identities and exposes mip views into one payload buffer. Runtime
costs move to asset fetching, decompression, hashing and upload, while GPU atlas
residency remains unchanged. Callers should load/upload appearances sequentially
and release the CPU data afterward; the three draw wrappers retain placement
metadata rather than the full mip arrays. This does not remove their underlying
GPU texture memory cost.

The isolated runtime build rejects any Three/photoreal-renderer module in its
module graph. The authoring tool additionally loads each generated artifact in
that separate runtime page. The existing three-backend impostor control accepts
an `atlasCatalog` URL. It reports fresh-source byte/anchor comparisons separately,
then supplies the same persisted bytes to Three and every candidate. These checks establish the asset
preparation contract, not full-scene appearance, temporal stability or performance.

Opaque `.atlas` files contain gzip bytes owned by the loader. A `.gz` suffix can
make a static server declare HTTP Content-Encoding, causing fetch to decompress
before the application does; the opaque suffix avoids that double decoding.

The pinned TypeGPU texture-write API ignores typed-array view offsets. Its shared
upload boundary copies only views that do not span their backing buffer; exact
buffers remain allocation-free. Packed mip loading therefore adds transient
per-mip preparation copies for TypeGPU, not a native render fallback.

Fixture evidence
records both successful persisted-input controls and a strict fresh-source
mismatch. Integrity hashes are exact; repeat GPU baking is not assumed to be
bit deterministic. The `--check` gate remains exact and preserves a fresh variant
and channel/mip deltas whenever a repeat differs.
