// Model-review turntable harness (?test=models). Stands a SINGLE soldier of a
// chosen class on a flat meadow and renders him at an arbitrary facing, stance
// and view tilt, with no sim running — so vibe/turntable.mjs can orbit every
// 3D model through 360° in every pose and dump contact sheets to review. Uses
// the real battle renderer (same meshes, materials, sun, colour grade) so what
// you review is exactly what the battle draws. Exposes window.__tt.
import { BattleRenderer3D } from './renderer3d';
import { Camera } from '../shared/camera';

// Sim frame values the renderer reads (mirror scene.ts / renderer3d.ts):
//   0 alert stand (weapon in guard)   3 trading blows (thrust)
//   1 marching                        4 fallen
//   6 at ease (poles up, blades low)
export interface PoseReq {
  cls: number;
  team: number;
  facing: number; // radians; -PI/2 faces the camera (front)
  frame: number; // stance, see above
  pitch: number; // view tilt from straight-down (radians)
  zoom: number; // device px per metre
  camY: number; // world-y the camera centres on (lifts the figure on screen)
}

export function mountTurntable() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100vw;height:100vh';
  document.body.appendChild(canvas);

  // Caption baked into every frame so contact sheets are self-labelling.
  const cap = document.createElement('div');
  cap.style.cssText = 'position:fixed;top:4px;left:6px;font:12px ui-monospace,monospace;'
    + 'color:#fff;text-shadow:0 1px 2px #000,0 0 3px #000;z-index:10;pointer-events:none';
  document.body.appendChild(cap);

  const renderer = new BattleRenderer3D(canvas);
  renderer.resize();
  renderer.enableScatter = false; // clean stage: just the soldier on grass
  renderer.elevation = false; // flat ground for model review (no hills)
  const camera = new Camera(canvas);
  camera.bounds = null; // no clamping — we frame the lone figure ourselves

  // A small flat meadow (tint 0 = grass) centred on the origin, so the soldier
  // stands on ground, not the void. Speed 1, no roughness.
  const W = 16, H = 16, cell = 4;
  const flatSpeed = new Float32Array(W * H).fill(1);
  const flatRough = new Float32Array(W * H);
  const flatTint = new Uint8Array(W * H); // all meadow
  renderer.setTerrain(W, H, cell, (-W * cell) / 2, (-H * cell) / 2, flatSpeed, flatRough, flatTint);

  const EMPTY = new Float32Array(0);
  let curCls = -1, curTeam = -1;
  let clock = 0; // monotonic fake wall-clock so the pose-blend ease can progress

  const render = (p: PoseReq) => {
    if (p.cls !== curCls || p.team !== curTeam) {
      curCls = p.cls; curTeam = p.team;
      renderer.setStatic(new Uint32Array([0]), [p.team], [p.cls], new Float32Array([0.33]));
    }
    camera.x = 0;
    camera.y = p.camY;
    camera.zoom = p.zoom;
    renderer.pitchOverride = p.pitch;

    const pos = new Float32Array([0, 0]);
    const fac = new Float32Array([p.facing]);
    const fr = new Float32Array([p.frame]);
    const al = new Float32Array([p.frame === 4 ? 0 : 1]);
    // Step a fake clock forward so the renderer's at-ease blend eases all the way
    // to its target (a full raise/lower is 0.8s; ~1.5s of 0.1s steps saturates it
    // and unwinds any pose left over from the previous shot).
    for (let i = 0; i < 16; i++) {
      clock += 0.1;
      renderer.fixedTime = clock;
      renderer.draw(pos, fac, fr, al, 1, camera, -1, [], 0);
    }
    // draw() only stages the meshes; scene.render() is committed by drawOverlay
    // (the last call each battle frame). Flush an empty overlay to paint.
    renderer.drawOverlay(EMPTY, camera);
  };

  // Single-step draw for animation capture: advance the fake clock by `dt` and
  // draw ONE frame (unlike render(), which settles the ease blends over 16
  // sub-draws). Lets vibe/anim.mjs film an eased motion — the death crumple, a
  // pike sweeping up — frame by frame. `reset` zeroes the renderer's per-soldier
  // blends (death/at-ease) so one animation doesn't bleed into the next.
  const step = (p: PoseReq, dt: number) => {
    if (p.cls !== curCls || p.team !== curTeam) {
      curCls = p.cls; curTeam = p.team;
      renderer.setStatic(new Uint32Array([0]), [p.team], [p.cls], new Float32Array([0.33]));
    }
    camera.x = 0; camera.y = p.camY; camera.zoom = p.zoom;
    renderer.pitchOverride = p.pitch;
    clock += dt;
    renderer.fixedTime = clock;
    const al = new Float32Array([p.frame === 4 ? 0 : 1]);
    renderer.draw(new Float32Array([0, 0]), new Float32Array([p.facing]),
      new Float32Array([p.frame]), al, 1, camera, -1, [], 0);
    renderer.drawOverlay(EMPTY, camera);
  };
  const reset = () => { curCls = -1; curTeam = -1; }; // forces a setStatic (blends → 0)

  (window as unknown as { __tt: unknown }).__tt = {
    render,
    step,
    reset,
    label: (t: string) => { cap.textContent = t; },
  };
  (window as unknown as { __ready: boolean }).__ready = true;
}
