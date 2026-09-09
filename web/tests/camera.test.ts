// @vitest-environment node
// Screen-relative pan pin for the battle camera: panWorld's (right, up) is a
// SCREEN-axes request (D/→ = right, W/↑ = into the screen), and must hold at
// every yaw. Verified through camera3d's real projection — pan right and the
// ground point that was at screen centre must slide left on screen — so a
// screen↔world axis-convention slip (e.g. assuming yaw-0 looks along +Y when
// camera3d's yaw-0 view direction is −X) goes red here. Runs in node, no GPU.
import assert from "node:assert/strict";
import { test } from "vitest";
import { eyePosition, projectPoint } from "@packages/renderer-core/src/camera3d.ts";
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
    assert.ok(ndc[0] < -1e-4, `yaw ${yaw}: prior centre must move left on screen, ndc.x=${ndc[0]}`);
    // A pure right-pan is horizontal: the prior centre stays on the screen's midline.
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
    assert.ok(ndc[1] < -1e-4, `yaw ${yaw}: prior centre must move down-screen, ndc.y=${ndc[1]}`);
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

test("panSpeed follows physical distance and caps across the wide overview", () => {
  const camera = makeCamera(0);
  camera.zoom = 0.4;
  const far = camera.params().distance;
  const speedAtDistance = (distance: number) => {
    camera.zoomAt(600, 350, camera.params().distance / distance);
    return camera.panSpeed();
  };
  const cap = speedAtDistance(far);
  assert.equal(speedAtDistance(far * 0.95), cap);
  assert.equal(speedAtDistance(far * 0.8), cap);
  let previous = cap;
  for (const fraction of [0.6, 0.4, 0.2, 0.02]) {
    const speed = speedAtDistance(far * fraction);
    assert.ok(speed < previous, `distance ${far * fraction}: pan speed ${speed} >= ${previous}`);
    previous = speed;
  }
});

// Rotation is a head-turn, not an orbit: yawAboutEye and
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
  // The same fixed-eye contract holds in both directions at arbitrary yaws.
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

test("pitchAboutEye at the distance ceiling still turns at a fixed eye", () => {
  const camera = makeCamera(0.7);
  camera.zoom = 3;
  const before = eyePosition(camera.params());
  const pitchBefore = camera.pitch;
  camera.pitchAboutEye(-0.3);
  const after = eyePosition(camera.params());
  assert.ok(Math.hypot(...after.map((v, i) => v - before[i])) < 0.001);
  assert.ok(Math.abs(camera.pitch - pitchBefore + 0.3) < 1e-6);
  assert.equal(camera.zoom, 3);
});

test("wheel-zoom cannot bank dead travel past the rig's saturation point", () => {
  // `zoom` clamps where framing stops changing, so ONE reverse-scroll notch
  // immediately pulls the framing back from the closest view.
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

test("equal wheel steps change physical camera distance evenly across the zoom range", () => {
  for (const zoom of [0.9, 4, 6.5, 7.5]) {
    const camera = makeCamera(-Math.PI / 2);
    camera.setRig({ min: 0.4, max: 8 }, { width: 1600, height: 2000 });
    camera.zoom = zoom;
    const before = camera.params().distance;
    const panBefore = camera.panSpeed();
    camera.zoomAt(600, 350, 1.08);
    const after = camera.params().distance;
    if (zoom === 0.9)
      assert.ok(
        camera.panSpeed() > panBefore * 0.9,
        "a small distance change must not collapse pan speed",
      );
    assert.ok(
      Math.abs(after / before - 1 / 1.08) < 1e-6,
      `zoom ${zoom}: a wheel step must change distance immediately and proportionally; ${before} -> ${after}`,
    );
  }
});

test("ground picking hits the rendered elevated surface at a grazing angle", () => {
  const camera = makeCamera(-Math.PI / 2);
  camera.zoom = 7.9;
  camera.groundSurface = planeSurface(12, 0.025, 0.01);
  const world: [number, number, number] = [195, 180, camera.groundSurface.heightAt(195, 180)];
  const { ndc } = projectPoint(camera.params(), world);
  const hit = camera.screenToWorld((ndc[0] + 1) * 600, (1 - ndc[1]) * 350);
  assert.ok(hit);
  assert.ok(
    Math.hypot(hit[0] - world[0], hit[1] - world[1]) < 0.1,
    `surface picking must invert rendered projection, got ${hit} for ${world}`,
  );
});

test("look rotation holds the eye fixed above uneven terrain without changing lens or zoom", () => {
  for (const zoom of [3, 7, 7.9, 12]) {
    const camera = makeCamera(0.7);
    camera.zoom = zoom;
    camera.groundSurface = planeSurface(20, 0.05, 0.025);
    for (const [yaw, pitch] of [
      [0.7, 0],
      [0, -0.3],
      [0, 0.4],
    ]) {
      const before = camera.params();
      const eye = eyePosition(before);
      if (yaw) camera.yawAboutEye(yaw);
      if (pitch) camera.pitchAboutEye(pitch);
      const after = camera.params();
      const end = eyePosition(after);
      assert.ok(
        Math.hypot(...end.map((v, i) => v - eye[i])) < 0.001,
        `zoom ${zoom} yaw ${yaw} pitch ${pitch}: eye moved from ${eye} to ${end}`,
      );
      assert.equal(after.fovY, before.fovY, "head turns must not change the lens");
      assert.equal(camera.zoom, zoom, "head turns must not move the zoom dial");
    }
  }
});

function planeSurface(z: number, dx: number, dy: number): NonNullable<Camera["groundSurface"]> {
  return {
    heightAt: (x, y) => z + x * dx + y * dy,
    raycast: ({ origin: o, dir: d }) => {
      const t = (z + o[0] * dx + o[1] * dy - o[2]) / (d[2] - d[0] * dx - d[1] * dy);
      return t >= 0 ? [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] : null;
    },
  };
}
