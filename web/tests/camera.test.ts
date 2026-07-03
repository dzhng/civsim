// Screen-relative pan pin for the battle camera: panWorld's (right, up) is a
// SCREEN-axes request (D/→ = right, W/↑ = into the screen), and must hold at
// every yaw. Verified through camera3d's real projection — pan right and the
// ground point that was at screen centre must slide left on screen — so a
// screen↔world axis-convention slip (e.g. assuming yaw-0 looks along +Y when
// camera3d's yaw-0 view direction is −X) goes red here. Runs in node, no GPU.
import assert from "node:assert/strict";
import test from "node:test";
import { projectPoint } from "../../packages/renderer-core/src/camera3d.ts";
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
