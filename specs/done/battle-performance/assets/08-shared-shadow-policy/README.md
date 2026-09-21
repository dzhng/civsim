# Shared single-map shadow policy

The stateful fit now belongs to the shared renderer policy. The Three adapter
installs its resolved fit and uses its refit revision to skip unchanged maps.
This extraction changes ownership, not shadow quality or performance policy.

The compressed before/after records are exactly equal across 128 states:
four environments, normal and reversed depth, initial unposed bounds, camera
zoom/pan/horizon/resize, replacement terrain and changed sun direction. Records
include light pose, projection, caster frustum, footprint and refit identity.
The CPU sequence exercised the real Three shadow rig through Vite SSR; it is
not a GPU image or timing claim.

The 21 existing shadow tests in photorealShadows, shadowViewFit and
orthographicShadow pass, as does the web TypeScript check. Independent review
found no behavioral change in the extraction. Native adapters still need to
consume this owner before comparisons can rank equal shadow work.
