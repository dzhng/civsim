// @vitest-environment node
// Screen-relative pan pin for the battle camera: panWorld's (right, up) is a
// SCREEN-axes request (D/→ = right, W/↑ = into the screen), and must hold at
// every yaw. Verified through camera3d's real projection — pan right and the
// ground point that was at screen centre must slide left on screen — so a
// screen↔world axis-convention slip (e.g. assuming yaw-0 looks along +Y when
// camera3d's yaw-0 view direction is −X) goes red here. Runs in node, no GPU.
import assert from "node:assert/strict";
import { test } from "vitest";
import { eyePosition, projectPoint } from "../../packages/renderer-core/src/camera3d.ts";
import { Camera } from "../src/shared/camera.ts";

function makeCamera(yaw: number): Camera {
  const canvas = { width: 1200, height: 700 } as HTMLCanvasElement;
  const camera = new Camera(canvas);
  camera.setRig({ min: 0.4, max: 8 }, { width: 400, height: 300 });
  camera.x = 200;
  camera.y = 150;
  camera.yaw = yaw;
  return camera;
}

// The default view plus arbitrary rotations — the pan contract is yaw-invariant.
const YAWS = [-Math.PI / 2, 0, 0.7, 2.4];

test("panWorld right slides the view right on screen at any yaw", () => {
  for (const yaw of YAWS) {
    const camera = makeCamera(yaw);
    const [cx, cy] = camera.viewCenter();
    camera.panWorld(10, 0);
    const { ndc } = projectPoint(camera.params(), [cx, cy, 0]);
    assert.ok(ndc[0] < -1e-4, `yaw ${yaw}: old centre must move left on screen, ndc.x=${ndc[0]}`);
    // A pure right-pan is horizontal: the old centre stays on the screen's midline.
    assert.ok(
      Math.abs(ndc[1]) < 1e-4,
      `yaw ${yaw}: right-pan must not drift vertically, ndc.y=${ndc[1]}`,
    );
  }
});

test("panWorld up drives the view into the screen at any yaw", () => {
  for (const yaw of YAWS) {
    const camera = makeCamera(yaw);
    const [cx, cy] = camera.viewCenter();
    camera.panWorld(0, 10);
    const { ndc } = projectPoint(camera.params(), [cx, cy, 0]);
    assert.ok(ndc[1] < -1e-4, `yaw ${yaw}: old centre must move down-screen, ndc.y=${ndc[1]}`);
    assert.ok(
      Math.abs(ndc[0]) < 1e-4,
      `yaw ${yaw}: up-pan must not drift sideways, ndc.x=${ndc[0]}`,
    );
  }
});

test("panWorld at the default north-up view maps to world east/north", () => {
  // Battle opens at yaw −π/2 (yours-bottom, north up-screen): D pans east (+X),
  // W pans north (+Y).
  const east = makeCamera(-Math.PI / 2);
  const [ex0, ey0] = east.viewCenter();
  east.panWorld(10, 0);
  const [ex1, ey1] = east.viewCenter();
  assert.ok(
    Math.abs(ex1 - ex0 - 10) < 1e-9 && Math.abs(ey1 - ey0) < 1e-9,
    `right-pan must be +X, got (${ex1 - ex0}, ${ey1 - ey0})`,
  );

  const north = makeCamera(-Math.PI / 2);
  const [nx0, ny0] = north.viewCenter();
  north.panWorld(0, 10);
  const [nx1, ny1] = north.viewCenter();
  assert.ok(
    Math.abs(nx1 - nx0) < 1e-9 && Math.abs(ny1 - ny0 - 10) < 1e-9,
    `up-pan must be +Y, got (${nx1 - nx0}, ${ny1 - ny0})`,
  );
});

test("panSpeed slows monotonically as you zoom in, and caps past ~75% out", () => {
  const camera = makeCamera(0);
  const range = { min: 0.4, max: 8 };
  const speedAt = (zoom: number) => {
    camera.zoom = zoom;
    return camera.panSpeed();
  };
  const zoomAtT = (t: number) => range.min + t * (range.max - range.min);
  // Cap: everything further out than the sweet spot pans at the same speed.
  const sweetSpot = speedAt(zoomAtT(0.25));
  assert.equal(speedAt(range.min), sweetSpot, "fully zoomed out must hit the cap");
  assert.equal(speedAt(zoomAtT(0.1)), sweetSpot, "past the sweet spot must hit the cap");
  // Inside the cap, speed strictly decreases toward the close vista.
  let prev = sweetSpot;
  for (const t of [0.4, 0.6, 0.8, 1.0]) {
    const s = speedAt(zoomAtT(t));
    assert.ok(s < prev, `speed must fall as zoom rises: t=${t} gave ${s} >= ${prev}`);
    prev = s;
  }
});

// Rotation is a head-turn, not an orbit (David 2026-07-07): yawAboutEye and
// pitchAboutEye must hold the camera's world-space EYE fixed while the look
// target swings around it. Verified through camera3d's real eye derivation.
test("yawAboutEye holds the eye fixed at any yaw", () => {
  for (const yaw of YAWS) {
    const camera = makeCamera(yaw);
    camera.zoom = 3;
    const before = eyePosition(camera.params());
    camera.yawAboutEye(0.6);
    const after = eyePosition(camera.params());
    const drift = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
    assert.ok(drift < 1e-6, `yaw ${yaw}: eye drifted ${drift}m during yawAboutEye`);
    assert.ok(Math.abs(camera.yaw - yaw - 0.6) < 1e-9, `yaw ${yaw}: yaw must advance by the delta`);
  }
});

test("pitchAboutEye holds the eye fixed and tilts the view", () => {
  // zoom 7 sits where the rig's zoom→distance curve has headroom both ways;
  // at the curve's flat zoomed-out ceiling the eye instead dollies along the
  // aim ray (the rig cannot reach past its max distance) — pinned below.
  for (const yaw of YAWS) {
    for (const delta of [0.12, -0.3]) {
      const camera = makeCamera(yaw);
      camera.zoom = 7;
      const pitchBefore = camera.pitch;
      const before = eyePosition(camera.params());
      camera.pitchAboutEye(delta);
      const after = eyePosition(camera.params());
      const drift = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
      assert.ok(
        drift < 0.01,
        `yaw ${yaw} delta ${delta}: eye drifted ${drift}m during pitchAboutEye`,
      );
      assert.ok(
        Math.abs(camera.pitch - pitchBefore - delta) < 1e-3,
        `yaw ${yaw} delta ${delta}: pitch moved ${camera.pitch - pitchBefore}, wanted ${delta}`,
      );
    }
  }
});

test("pitchAboutEye at the rig's distance ceiling degrades to a dolly along the aim ray", () => {
  // Zoomed far out the rig already sits at max distance, so tilting toward
  // the horizon cannot hold the eye. It must still tilt by the full delta,
  // keep the zoom dial where it was, and move the eye ONLY along the new
  // view direction (a slight dolly-in, never a sideways orbit swing).
  const camera = makeCamera(0.7);
  camera.zoom = 3;
  const pitchBefore = camera.pitch;
  const before = eyePosition(camera.params());
  camera.pitchAboutEye(-0.3);
  const params = camera.params();
  const after = eyePosition(params);
  assert.ok(Math.abs(camera.pitch - pitchBefore + 0.3) < 1e-3, "must tilt by the full delta");
  assert.ok(Math.abs(camera.zoom - 3) < 1e-9, "zoom dial must not slide on the flat curve");
  const move = [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
  const view = [
    params.target[0] - after[0],
    params.target[1] - after[1],
    params.target[2] - after[2],
  ];
  const viewLen = Math.hypot(...view);
  const moveLen = Math.hypot(...move);
  const along = (move[0] * view[0] + move[1] * view[1] + move[2] * view[2]) / viewLen;
  assert.ok(moveLen > 1, "the ceiling case does move the eye (the rig cannot reach)");
  assert.ok(
    Math.abs(along - moveLen) < 0.01 * moveLen,
    `eye movement must be along the view ray, along=${along} of ${moveLen}`,
  );
});

test("wheel-zoom cannot bank dead travel past the rig's saturation point", () => {
  // The bug: `zoom` clamped to a far hard cap (60) while the rig's framing
  // stops changing at ~22.9, so scrolling in past the closest view piled up an
  // invisible reserve you had to unwind before the camera moved back out. The
  // fix clamps zoom to the ceiling where the frame last changes, so ONE notch
  // of reverse scroll pulls the framing straight back.
  const camera = makeCamera(0);
  const cx = camera["canvas"].width / 2;
  const cy = camera["canvas"].height / 2;
  // Slam all the way in with many notches, well past saturation.
  for (let i = 0; i < 200; i++) camera.zoomAt(cx, cy, 1.05);
  const distIn = camera.params().distance;
  // A single notch back out must immediately widen the frame — no dead band.
  camera.zoomAt(cx, cy, 1 / 1.05);
  const distOut = camera.params().distance;
  assert.ok(
    distOut > distIn + 1e-6,
    `one notch out must move the camera, got ${distIn} -> ${distOut}`,
  );
});
