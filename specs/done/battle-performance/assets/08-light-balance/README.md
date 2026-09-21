# Golden lighting balance: partial visual improvement

Integrated worker dfd31296 as7423764b. Golden alone changes direct sun3.75→6.0
and sky fill0.7→0.35 through the shared physical-environment owner. Other presets
retain the existing default. Camera, light direction, sky textures, haze, exposure,
grade, materials, map size/filter/bias, content and GPU pass layout are unchanged.
The override belongs to the preset, with no raw-only lighting fork or menu option.

All six single/High/off captures share tick30/hash15927906182668164452 at
CSS1440×900 DPR2, with no page errors. Shared snapCheck captures and matched crops
show a real output change. An unprimed reviewer prefers the candidate's grounding
and soldier separation, while flagging the more yellow/olive ground and still-faint
individual shadows. Root accepts the contrast improvement, not completion of the
user's directional-shadow requirement. No screenshot threshold is lowered or old
baseline reblessed. The pair was opened for user review while independent work
continued.

Independent code review found no actionable defect; its tests were sandbox-blocked.
Root runs22 focused environment/shadow tests and full web TypeScript successfully.
Worker's broad suite retains one missing sparse-checkout campaign fixture; it is
not a full green suite. No new pass, texture, sampling loop or GPU resource is added,
but that does not substitute for final measured performance. The [combined source30k floor](../m7-current-camera/README.md) now passes; wider
environment/receiver views, motion and net-shadow cost remain open.

Source Three and selected raw use the same changed preset. Renderer/baker lab
consumers also inherit it; campaign rendering does not consume these physical
lighting parameters. This is an internal render setting, with no saved-data change.
