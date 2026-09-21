# Overlay verification change ledger

All rows refer to `apps/battle-perf-lab/src/raw/overlay-check.ts`. Historical images
and reports are preserved. No simulation or unit-stat tests changed; existing
GPU-buffer tests retain their assertions. New staging tests compare the live
Three attributes through growth, shrink and empty uploads.

| Test            | Previous behavior                                                          | New behavior                                                 | Why it changed                                                                                     |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| marker          | Populated the retired billboard layer in an exposed view.                  | Removed from the active control.                             | Production caller audit found only empty uploads; real L3 soldiers use crowd impostors. **moved**  |
| marker-occluded | Populated retired billboards behind opaque geometry.                       | Removed from the active control.                             | Testing this unused layer as required scene content was a scope error. **moved**                   |
| composed        | Drew four live cue layers plus retired marker billboards.                  | Draws the same live cues without retired billboards.         | Match actual production ownership; live-cue blending/depth is unchanged. **moved**                 |
| unoccluded      | Removed the raised block while retaining live cues and retired billboards. | Keeps the same block-removal comparison with live cues only. | The block remains an explicit occlusion comparison, while unused markers are excluded. **moved**   |
| growth          | Repeated every cue plus retired billboards to force growth.                | Forces growth only in live layers.                           | Preserve active-count/capacity verification without introducing nonexistent battle work. **moved** |
| shrink          | Returned the mixed live/retired composition after growth.                  | Returns the live composition after growth.                   | Keep the same buffer-reuse and active-count contract after the scope correction. **moved**         |
| horizon         | Drew live cues and retired billboards from a low camera.                   | Draws the same live cues and block from that camera.         | Preserve horizon/depth coverage without unused marker geometry. **moved**                          |

Two new control cases exercise initial small uploads and partial concurrent growth.
The observed negative staging run had output error 0.398681640625; moving preparation
inside the guard restores the unchanged 1/255 gate. A separate TypeGPU payload-copy
fault left 42→44 live buffers before cleanup; the corrected run stays 42→42. These
are new regression guards for implementation defects, with their failing reports
retained beside the successful controls. No standing threshold was widened.
