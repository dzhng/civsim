# Trial-runner integration failures

The runner passed its CPU tests, then rejected both first actual fixed-build attempts before browser launch. These failures are retained, not timing results.

1. The refreshed build producer used a version-2 manifest with `sharedPaths`, while the trial runner accepts canonical version 1 with `sharedPublic` and `sharedAtlas`. The rejection reported an undefined path rather than a useful missing-field error.
2. An explicit data-only field alignment exposed both the still-unsupported version and a real layout assumption: `assets/` contains emitted bundles alongside a linked `assets/soldiers/` subtree. The verifier incorrectly required the entire top-level directory to link to public assets. The exact attempted input manifest is retained and its hash matches the trial record.

The canonical runner schema remains the contract; no runtime compatibility parser is planned. The producer must emit that schema. Shared-path validation needs to verify the actual linked subtrees or recorded files, with a mixed-directory regression test. Until corrected and exercised, the runner has no successful full runtime trial. Existing direct Menu flow evidence remains separate.

Host observations also report contention; neither attempt qualifies as quiet hardware evidence. No five-minute recording or FPS result was produced.
