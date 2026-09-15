// @vitest-environment node
// The view-relevant sun fit (packages/game-renderer/src/battle/shadowPolicy.ts)
// and the rig that drives it. Everything here is geometry: the questions are
// whether the fitted map CONTAINS what has to be shadowed, whether it holds
// still while the camera moves, and how many world units a texel buys. What the
// result LOOKS like, and what it costs, are hardware questions this file cannot
// answer.
import assert from "node:assert/strict";
import { test } from "vitest";
import * as THREE from "three/webgpu";
import {
  SHADOW_CASTER_CEILING,
  SHADOW_COVERAGE_MIN,
  SHADOW_CROWD_CASTER_CEILING,
  SHADOW_FIT_BORDER_TEXELS,
  SHADOW_RECEIVER_CEILING,
  SHADOW_RECEIVER_MARGIN,
  SINGLE_MAP_SIZE,
  ShadowFitStabilizer,
  shadowCoverageRadius,
  shadowExtentForRung,
  shadowExtentRung,
  shadowLightBasis,
  shadowNormalBiasFor,
  singleShadowFit,
  viewShadowFit,
  type ShadowViewFit,
} from "@packages/game-renderer/src/battle/shadowPolicy";
import { configureSunShadows } from "@packages/photoreal-renderer/src/battle/shadowRig";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "@packages/game-renderer/src/environment/physicalEnvironment";
import { eyePosition, type Camera3DParams } from "@packages/renderer-core/src/camera3d";

// The production battle field and the framings the zoom rig actually produces
// at its two endpoints (web/src/battle/cameraRig.ts BATTLE_CURVE).
const RECT: [number, number, number, number] = [-1200, -800, 2400, 1600];
const ELEVATION: [number, number] = [-3, 12];
const SUN = photorealEnvironment(CIVSIM_ENVIRONMENTS.golden).sunDirection;
const TACTICAL: Camera3DParams = {
  target: [0, 0, 0],
  distance: 10,
  pitch: 0.3,
  yaw: -Math.PI / 2,
  fovY: 0.85,
  aspect: 1.6,
  near: 1,
};
const STRATEGIC: Camera3DParams = {
  target: [0, 0, 0],
  distance: 3200,
  pitch: 1.35,
  yaw: -Math.PI / 2,
  fovY: 0.5,
  aspect: 1.6,
  near: 1,
};

function fitFor(
  camera: Camera3DParams,
  sun = SUN,
  stabilizer?: ShadowFitStabilizer,
): ShadowViewFit {
  return viewShadowFit({
    camera,
    rect: RECT,
    elevation: ELEVATION,
    unitSunDirection: sun,
    mapSize: SINGLE_MAP_SIZE,
    stabilizer,
  });
}

/** The shadow camera three will build from this fit — an independent
 *  implementation of the same lookAt/orthographic pose the rig applies. */
function shadowFrustum(fit: ShadowViewFit): THREE.Frustum {
  const camera = new THREE.OrthographicCamera(
    fit.left,
    fit.right,
    fit.top,
    fit.bottom,
    fit.near,
    fit.far,
  );
  camera.up.set(...fit.up);
  camera.position.set(...fit.position);
  camera.lookAt(...fit.target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    camera.coordinateSystem,
    camera.reversedDepth,
  );
}

test("the fitted map contains every receiver in the box it promises to cover", () => {
  for (const camera of [TACTICAL, STRATEGIC]) {
    for (const env of Object.values(CIVSIM_ENVIRONMENTS)) {
      const sun = photorealEnvironment(env).sunDirection;
      const fit = fitFor(camera, sun);
      const frustum = shadowFrustum(fit);
      const { box } = fit;
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j <= 8; j++) {
          const x = box.x0 + ((box.x1 - box.x0) * i) / 8;
          const y = box.y0 + ((box.y1 - box.y0) * j) / 8;
          for (const z of [box.z0, (box.z0 + box.z1) / 2, box.z1]) {
            assert.ok(
              frustum.containsPoint(new THREE.Vector3(x, y, z)),
              `${env.id}: receiver (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) fell outside the fit`,
            );
          }
        }
      }
    }
  }
});

test("the promised box holds the ground this camera can see, out to its reach", () => {
  // Marched independently of the fit's own rim sampling: if seven samples per
  // axis were too coarse, a ground hit lands outside the box and this goes red.
  for (const camera of [TACTICAL, STRATEGIC, { ...TACTICAL, pitch: 0.02 }]) {
    const fit = fitFor(camera);
    const reach = Math.max(camera.near, camera.distance) + shadowCoverageRadius(camera.distance);
    const eye = eyePosition(camera);
    const forward = unit([
      camera.target[0] - eye[0],
      camera.target[1] - eye[1],
      camera.target[2] - eye[2],
    ]);
    const right = unit(cross(forward, [0, 0, 1]));
    const up = cross(right, forward);
    const tanY = Math.tan(camera.fovY / 2);
    const tanX = tanY * camera.aspect;
    let hits = 0;
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        const sx = -1 + i / 20;
        const sy = -1 + j / 20;
        const dir = unit([
          forward[0] + sx * tanX * right[0] + sy * tanY * up[0],
          forward[1] + sx * tanX * right[1] + sy * tanY * up[1],
          forward[2] + sx * tanX * right[2] + sy * tanY * up[2],
        ]);
        if (dir[2] >= -1e-6) continue;
        const t = (ELEVATION[0] - eye[2]) / dir[2];
        if (t < camera.near || t > reach) continue;
        const x = eye[0] + dir[0] * t;
        const y = eye[1] + dir[1] * t;
        // Only the ground the fit promises: inside the receiver domain.
        if (x < RECT[0] - SHADOW_RECEIVER_MARGIN || x > RECT[0] + RECT[2] + SHADOW_RECEIVER_MARGIN)
          continue;
        if (y < RECT[1] - SHADOW_RECEIVER_MARGIN || y > RECT[1] + RECT[3] + SHADOW_RECEIVER_MARGIN)
          continue;
        hits++;
        assert.ok(
          x >= fit.box.x0 && x <= fit.box.x1 && y >= fit.box.y0 && y <= fit.box.y1,
          `visible ground (${x.toFixed(1)}, ${y.toFixed(1)}) fell outside the promised box`,
        );
      }
    }
    assert.ok(hits > 200, `expected a populated ground footprint, marched ${hits}`);
  }
});

test("offscreen casters that reach a visible receiver stay inside the fit", () => {
  // A caster's light-space XY IS its shadow's light-space XY, so the box fitted
  // to receivers already holds it — this pins that the DEPTH range admits it too,
  // all the way up to the horizon-blocker ceiling.
  const fit = fitFor(TACTICAL);
  const frustum = shadowFrustum(fit);
  const { box } = fit;
  for (const height of [SHADOW_RECEIVER_CEILING, 120, SHADOW_CASTER_CEILING]) {
    // Walk up the sun ray from a receiver in the middle of the coverage region.
    const lift = height / SUN[2];
    for (const [rx, ry] of [
      [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2],
      [box.x0 + 1, box.y0 + 1],
      [box.x1 - 1, box.y1 - 1],
    ]) {
      const caster = new THREE.Vector3(
        rx + SUN[0] * lift,
        ry + SUN[1] * lift,
        ELEVATION[1] + SUN[2] * lift,
      );
      assert.ok(
        frustum.containsPoint(caster),
        `caster ${height} above the receiver at (${rx.toFixed(0)}, ${ry.toFixed(0)}) fell outside the fit`,
      );
    }
  }
});

test("the horizon does not blow the fit up; every framing beats the whole-map texel", () => {
  const wholeMap = singleShadowFit(RECT, SUN);
  const wholeMapTexel = (wholeMap.right - wholeMap.left) / SINGLE_MAP_SIZE;
  assert.ok(
    Math.abs(wholeMapTexel - 2.8949619339562416) < 1e-9,
    `the whole-map baseline this fit is measured against moved (${wholeMapTexel})`,
  );
  for (const pitch of [-0.4, -0.05, 0.0, 0.02, 0.3, 0.7, 1.35, 1.5]) {
    for (const distance of [10, 40, 200, 1400, 3200]) {
      for (const fovY of [0.5, 0.85, 1.4]) {
        const fit = fitFor({ ...TACTICAL, pitch, distance, fovY });
        assert.ok(Number.isFinite(fit.extent) && fit.extent > 0, `extent ${fit.extent}`);
        assert.ok(
          fit.worldUnitsPerTexel < wholeMapTexel,
          `pitch ${pitch} d ${distance} fov ${fovY}: ${fit.worldUnitsPerTexel} units/texel is no better than the whole map`,
        );
        assert.ok(
          fit.far > fit.near && Number.isFinite(fit.far),
          `depth range ${fit.near}..${fit.far}`,
        );
      }
    }
  }
});

test("the tactical framing resolves a fraction of a soldier per texel", () => {
  const fit = fitFor(TACTICAL);
  // A soldier is ~0.5 world units across. The whole-map fit spends 2.895 units
  // on a texel — six soldiers — which is why the front rank reads as ungrounded.
  assert.ok(
    fit.worldUnitsPerTexel < 0.25,
    `tactical fit resolves ${fit.worldUnitsPerTexel} units/texel`,
  );
  assert.ok(
    fit.normalBias < 0.1,
    `a ${fit.normalBias}-unit normal offset is a soldier's width at this density`,
  );
});

test("the fit reproduces the sun direction the environment owns, exactly", () => {
  for (const env of Object.values(CIVSIM_ENVIRONMENTS)) {
    const sun = photorealEnvironment(env).sunDirection;
    for (const camera of [TACTICAL, STRATEGIC]) {
      const fit = fitFor(camera, sun);
      const back = unit([
        fit.position[0] - fit.target[0],
        fit.position[1] - fit.target[1],
        fit.position[2] - fit.target[2],
      ]);
      const reference = unit([...sun]);
      for (let i = 0; i < 3; i++) {
        assert.ok(
          Math.abs(back[i] - reference[i]) < 1e-12,
          `${env.id}: fit rotated the sun (${back}) off (${reference})`,
        );
      }
    }
  }
});

test("sub-texel camera motion does not move the map; motion that does moves it by whole texels", () => {
  const stabilizer = new ShadowFitStabilizer();
  const basis = shadowLightBasis(SUN);
  const first = fitFor(TACTICAL, SUN, stabilizer);
  const texel = first.worldUnitsPerTexel;
  const centre = (fit: ShadowViewFit) => [
    fit.position[0] * basis.right[0] +
      fit.position[1] * basis.right[1] +
      fit.position[2] * basis.right[2],
    fit.position[0] * basis.upAxis[0] +
      fit.position[1] * basis.upAxis[1] +
      fit.position[2] * basis.upAxis[2],
  ];
  let previous = first;
  let held = 0;
  for (let step = 1; step <= 200; step++) {
    // Pan a tenth of a texel at a time: most steps must land on the same map.
    const camera = { ...TACTICAL, target: [step * texel * 0.1, 0, 0] as [number, number, number] };
    const fit = fitFor(camera, SUN, stabilizer);
    const [ax, ay] = centre(previous);
    const [bx, by] = centre(fit);
    if (ax === bx && ay === by) held++;
    for (const delta of [bx - ax, by - ay]) {
      const texels = delta / texel;
      assert.ok(
        Math.abs(texels - Math.round(texels)) < 1e-6,
        `the fitted centre slid ${texels} texels — snapping is not holding the grid`,
      );
      assert.ok(
        Math.abs(texels) <= 1 + 1e-6,
        `the centre jumped ${texels} texels in one tenth-texel step`,
      );
    }
    assert.equal(fit.extent, first.extent, "a tenth-texel pan must not re-rung the extent");
    previous = fit;
  }
  assert.ok(held > 120, `expected most sub-texel steps to reuse the same map, held ${held}/200`);
});

test("the extent ladder covers its requirement with border, and shrinks only past a deadband", () => {
  for (const required of [1, 17, 40, 199, 200, 201, 913, 2963]) {
    const extent = shadowExtentForRung(shadowExtentRung(required, SINGLE_MAP_SIZE));
    const usable = extent * (1 - (2 * SHADOW_FIT_BORDER_TEXELS) / SINGLE_MAP_SIZE);
    assert.ok(usable >= required, `rung ${extent} does not cover ${required} with border`);
    assert.ok(extent < required * 1.3 + 32, `rung ${extent} wastes the map on ${required}`);
  }

  const stabilizer = new ShadowFitStabilizer();
  const settled = stabilizer.resolve(200, SINGLE_MAP_SIZE);
  // Oscillating either side of one rung boundary must not pump the texel size.
  const boundary = shadowExtentForRung(shadowExtentRung(200, SINGLE_MAP_SIZE) - 1);
  for (let i = 0; i < 20; i++) {
    const required = i % 2 === 0 ? boundary * 0.999 : 200;
    assert.equal(stabilizer.resolve(required, SINGLE_MAP_SIZE), settled, "the extent pumped");
  }
  // Growth is immediate — a rung too small crops receivers.
  assert.ok(stabilizer.resolve(settled * 4, SINGLE_MAP_SIZE) >= settled * 4);
  // Shrinking waits out the deadband, then follows.
  const grown = stabilizer.resolve(settled * 4, SINGLE_MAP_SIZE);
  assert.equal(
    stabilizer.resolve(grown * 0.9, SINGLE_MAP_SIZE),
    grown,
    "shrank inside the deadband",
  );
  assert.ok(stabilizer.resolve(settled, SINGLE_MAP_SIZE) < grown, "never shrank");
});

test("normal offset follows the texel, and reproduces the whole-map default at whole-map density", () => {
  // 0.6 world units is what the whole-map fit ships at 2.894962 units/texel.
  assert.ok(Math.abs(shadowNormalBiasFor(2.894962) - 0.6) < 0.01);
  let previous = 0;
  for (const texel of [0.05, 0.19, 0.5, 1.0, 2.895, 4]) {
    const bias = shadowNormalBiasFor(texel);
    assert.ok(bias >= previous, "monotonic in texel size");
    previous = bias;
  }
  assert.ok(shadowNormalBiasFor(0) > 0, "a floor keeps some acne protection at any density");
});

test("coverage follows the orbit distance between its floor and ceiling", () => {
  assert.equal(shadowCoverageRadius(0), SHADOW_COVERAGE_MIN);
  assert.equal(shadowCoverageRadius(10), SHADOW_COVERAGE_MIN);
  assert.ok(shadowCoverageRadius(400) > shadowCoverageRadius(200));
  assert.equal(shadowCoverageRadius(1e9), shadowCoverageRadius(1e12));
  assert.ok(Number.isFinite(shadowCoverageRadius(Number.NaN)));
});

test("the rig re-fits on camera motion and on a new field, and not otherwise", () => {
  const renderer = {
    shadowMap: {},
    coordinateSystem: THREE.WebGPUCoordinateSystem,
    reversedDepthBuffer: false,
  } as unknown as THREE.WebGPURenderer;
  const sun = new THREE.DirectionalLight();
  sun.position.set(-93.9, 0, 34.3);
  const scene = new THREE.Scene();
  scene.add(sun, sun.target);
  const rig = configureSunShadows(renderer, sun, CIVSIM_ENVIRONMENTS.golden, "single");

  // Before a camera exists the rig runs the whole-map fallback the comparison
  // runtimes share, so an unposed rig is exactly what it was.
  const whole = singleShadowFit(RECT, [SUN[0], SUN[1], SUN[2]]);
  rig.setWorldRect(RECT, ELEVATION);
  assert.equal(rig.identity().fit?.extent, whole.right - whole.left);

  rig.update(TACTICAL);
  const fitted = rig.identity().fit!;
  assert.ok(fitted.worldUnitsPerTexel < 0.25, JSON.stringify(fitted));
  assert.equal(
    sun.shadow.normalBias,
    fitted.normalBias,
    "the rig applies the density's normal offset",
  );

  const settled = fitted.refits;
  for (let i = 0; i < 16; i++) rig.update(TACTICAL);
  assert.equal(rig.identity().fit?.refits, settled, "a still camera must not rebuild the map");

  rig.update({ ...TACTICAL, target: [40, 0, 0] });
  assert.ok(rig.identity().fit!.refits > settled, "a real pan must re-fit");

  const moved = rig.identity().fit!.refits;
  rig.setWorldRect([-40, -40, 80, 80], [0, 1]);
  assert.ok(rig.identity().fit!.refits > moved, "a new field must re-fit");
  rig.dispose();
});

test("the rig's culling views keep an offscreen caster that shadows the visible field", () => {
  const renderer = {
    shadowMap: {},
    coordinateSystem: THREE.WebGPUCoordinateSystem,
    reversedDepthBuffer: false,
  } as unknown as THREE.WebGPURenderer;
  const sun = new THREE.DirectionalLight();
  sun.position.set(-93.9, 0, 34.3);
  const scene = new THREE.Scene();
  scene.add(sun, sun.target);
  const rig = configureSunShadows(renderer, sun, CIVSIM_ENVIRONMENTS.golden, "single");
  rig.setWorldRect(RECT, ELEVATION);
  rig.update(TACTICAL);

  const views = rig.cullingViews();
  assert.equal(views.length, 1);
  assert.equal(views[0].shadow, true);
  const inside = (x: number, y: number, z: number) =>
    views[0].frustum.planes.every(
      ({ normal, constant }) => normal.x * x + normal.y * y + normal.z * z + constant >= 0,
    );
  // A tree standing up-sun of the camera target, well behind the eye: its own
  // pixels are off screen, its shadow lands on the ground the camera is looking at.
  const lift = SHADOW_CROWD_CASTER_CEILING / SUN[2];
  assert.ok(
    inside(SUN[0] * lift, SUN[1] * lift, ELEVATION[1] + SUN[2] * lift),
    "a mounted caster up-sun of the framing was culled out of its own shadow",
  );
  // Ground on the far side of the field is outside this map — the shadow audience
  // must shrink with the fit, or the crowd pays for casters that cannot land.
  assert.equal(inside(1100, 700, 0), false, "the audience did not shrink with the fit");
  // And it stops at a BODY's reach, not the cliff ceiling the map itself carries.
  const cliff = SHADOW_CASTER_CEILING / SUN[2];
  assert.equal(
    inside(SUN[0] * cliff, SUN[1] * cliff, ELEVATION[1] + SUN[2] * cliff),
    false,
    "the crowd is being submitted across a cliff's reach",
  );
  rig.dispose();
});

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit(v: readonly number[]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
