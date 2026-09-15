# Changed checks

- Distant admission: previously expected a newly allocated but numerically equal query mesh; now requires the original unaffected mesh and independently accounts for its owned buffers. Avoiding the unnecessary rebuild is the intended behavior.
- Adjacent admission/eviction: new check requires shared edges to rise to detailed height and return to coarse height when the neighbor leaves.
- Full-source memory: previously checked a single coastal admission and rejection of16km overview storage. Packed storage now admits that overview; the acceptance workload additionally traverses the complete16-tile working set across four regions within the same128MiB ceiling.
- Nearby camera movement: the former18-of24 overlap threshold becomes the same greater-than75% criterion for the measured16-tile budget. Geographic coverage and stable return identities remain unchanged.
- Surface color interpolation: runs with both separate and packed fine colors, including a coarse override. It asserts the same expected edge colors.
- Worker transfer: compares the retained vertex/topology/coverage/shore data; separate campaign color and tint arrays are absent because their information is already packed or unused.

- Browser plateau and DPR2: compares resident count to the first ready traversal state instead of the obsolete literal24. It still requires nonempty stable residency, exact return allocation, real DPR2 dimensions and the unchanged128MiB ceiling. Timing gates remain33ms/100ms.
