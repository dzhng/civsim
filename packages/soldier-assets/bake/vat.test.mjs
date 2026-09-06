// Self-contained correctness + determinism test for the VAT bake core.
// No deps, no browser: a hand-verifiable 2-bone "arm" whose joint matrices we
// can compute by hand, plus a byte-stability check (the harness needs the bake
// reproducible). Run: `node packages/soldier-assets/bake/vat.test.mjs`.

import assert from 'node:assert/strict';
import { bakeRig, readJoint } from './vat.mjs';
import { transformPoint, mat4FromTRS } from '../src/localPose.ts';

const ID = mat4FromTRS([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
const transN1 = mat4FromTRS([-1, 0, 0], [0, 0, 0, 1], [1, 1, 1]); // translate(-1,0,0)
const close = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const closeVec = (v, e, eps = 1e-5) => v.forEach((x, i) => close(x, e[i], eps));

// Rig: bone0 at origin; bone1 a child whose bind-local is translate(1,0,0), so
// its bind-WORLD tip is (1,0,0) and its inverse-bind is translate(-1,0,0).
const rot90z = [0, 0, Math.SQRT1_2, Math.SQRT1_2]; // quaternion for +90° about z
const rig = {
  bones: [
    { name: 'b0', parent: -1, bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: ID },
    { name: 'b1', parent: 0, bind: { T: [1, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: transN1 },
  ],
  clips: [
    {
      name: 'rot', duration: 1,
      // bone0 rotates 0° → 90° about z over the clip; bone1 holds its bind.
      tracks: { 0: { R: { times: [0, 1], values: [0, 0, 0, 1, ...rot90z] } } },
    },
  ],
};

const baked = bakeRig(rig, 2); // fps 2, duration 1 → 3 frames at t = 0, 0.5, 1
assert.equal(baked.bones, 2);
assert.equal(baked.clips[0].frames, 3);
assert.equal(baked.clips[0].duration, 1);
assert.equal(baked.clips[0].loop, false);
assert.equal(bakeRig({ ...rig, clips: [{ ...rig.clips[0], loop: true }] }, 2).clips[0].loop, true);
assert.equal(baked.width, 3);
assert.equal(baked.height, 8); // 2 bones * 4 columns
assert.equal(baked.data.length, baked.width * baked.height * 4);

// Frame 0 (t=0): everything at bind. bone0 joint = identity; a vertex at the
// bind tip (1,0,0) stays put under bone0, and under bone1 too.
closeVec(transformPoint(readJoint(baked, 0, 0), [1, 0, 0]), [1, 0, 0]);
closeVec(transformPoint(readJoint(baked, 1, 0), [1, 0, 0]), [1, 0, 0]);

// Last frame (t=1, 90° about z): bone0 joint rotates (1,0,0) → (0,1,0).
closeVec(transformPoint(readJoint(baked, 0, 2), [1, 0, 0]), [0, 1, 0]);
// bone1's bind-world tip (1,0,0) rides the parent: world1 = rotZ90·translate(1)
// → translation (0,1,0); skinning the bind tip lands it there.
closeVec(transformPoint(readJoint(baked, 1, 2), [1, 0, 0]), [0, 1, 0]);

// Mid frame (t=0.5, 45°): (1,0,0) → (cos45, sin45, 0).
closeVec(transformPoint(readJoint(baked, 0, 1), [1, 0, 0]), [Math.SQRT1_2, Math.SQRT1_2, 0]);

// Determinism: a second bake is byte-identical (snapshot stability depends on it).
const baked2 = bakeRig(rig, 2);
assert.ok(Buffer.from(baked.data.buffer).equals(Buffer.from(baked2.data.buffer)), 'bake must be byte-stable');

// Topological-order guard fires on a child-before-parent rig.
assert.throws(() => bakeRig({
  bones: [
    { name: 'child', parent: 1, bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: ID },
    { name: 'root', parent: -1, bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: ID },
  ],
  clips: [{ name: 'x', duration: 0, tracks: {} }],
}, 1), /after its parent/);

console.log('vat.test.mjs: all assertions passed');
