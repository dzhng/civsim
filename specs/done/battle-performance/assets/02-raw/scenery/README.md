# Native battle scenery control

The native scenery owner renders the same six battle prop families, shared meshes,
placements and leaf atlas as Three. Placement packing is shared with the source
adapter; a CPU differential checks all fields against the previous packing over
800 mixed input props (600 battle props), exactly. The image uploader now accepts
packed RGBA bytes as well as bitmaps, reusing its existing mip chain and admission
cleanup. Typed atlas bytes are uploaded verbatim without a bitmap conversion.

This one- and four-sample composed control includes six props, twelve soldiers, ground,
sky, current directional shadows and real post. All resources are candidate-owned;
camera and environment remain borrowed. The run has no GPU/browser errors,
nonfinite outputs or retained candidate textures. The existing first-source shadow
initialization discrepancy remains, so the first tactical image differs visibly.
Later pairs have 12 tactical and four horizon display pixels differing by more
than one code value. The strict maximum-channel diagnostic remains red (0.302
and 0.634 HDR maxima); this is limited component correspondence, not cold or
complete-world parity. The four-sample run has the same strict diagnostic limitation and zero runtime errors or retained textures. Its later maximum HDR differences are0.309 tactical and0.634 horizon. [Independent four-sample review](review/four-sample.md) finds corresponding content; its native plain repeat differs by one code at one pixel, retained as a qualification.

Two source semantics are deliberately preserved. Pinned Three shadow extraction
uses `colorNode.a` but omits the foliage's `opacityNode`, so canopy shadows use
whole leaf cards even though beauty cuts their leaf texture. Also, surviving
opaque beauty fragments write alpha one after the cutout test. The native control
initially differed on both and was corrected from source code and image evidence;
it does not claim a speed advantage from casting less foliage.

[Fresh independent review](review/report.md) finds corresponding silhouettes and
grounding with no candidate-specific missing prop or depth defect. It also confirms
the first-source shadow change and the separate restored grass publication images.
These small static views cannot establish large forests, temporal coverage,
interactive performance or full battlefield acceptance.

The raw control TypeScript project, frame build, image admission tests and source
review pass. The new malformed-RGBA check rejects truncated data before any GPU
allocation. No existing test expectation was changed. Run the shared frame control
with `?scenery&shadows`; alternate backend scenery paths fail explicitly until ported.
