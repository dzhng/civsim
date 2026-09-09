import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeGltf } from "./gltf.mjs";
import { sampleRigLocalPoseSeconds } from "../src/localPose.ts";

const paths = process.argv.slice(2);
assert.equal(paths.length, 3, "Pass archer, skirmisher and crew source GLBs");
for (const [index, path] of paths.entries()) {
  const { rig } = bakeGltf(await readFile(path));
  const scale = (clipName, joint, phase) => {
    const clip = rig.clips.find(({ name }) => name === clipName);
    assert.ok(clip, `missing ${clipName}`);
    const bone = rig.bones.findIndex(({ name }) => name === joint);
    assert.ok(bone >= 0, `missing ${joint}`);
    return sampleRigLocalPoseSeconds(rig, clipName, clip.duration * phase)[bone * 10 + 7];
  };
  for (const clip of rig.clips) {
    for (const phase of [0, .5, 1]) {
      const actual = scale(clip.name, "held-sword", phase);
      assert.ok(Math.abs(actual - (clip.name === "sword-effort" ? 1 : .001)) < 1e-6,
        `${index}/${clip.name}: sword visibility at ${phase} was ${actual}`);
    }
  }
  if (index === 0) {
    assert.equal(scale("ready", "held-arrow", 0), 1);
    assert.ok(scale("bow-release", "held-arrow", 0) < .001);
    assert.ok(scale("idle", "held-arrow", 0) < .001);
  } else if (index === 1) {
    assert.equal(scale("ready", "held-projectile", 0), 1);
    assert.ok(scale("throw-release", "held-projectile", 0) < .001);
    assert.equal(scale("throw-release", "held-projectile", 1), 1);
    assert.ok(scale("sword-effort", "held-projectile", .5) < .001);
  } else {
    assert.equal(scale("crew-release", "held-tool", .5), 1);
    assert.ok(scale("sword-effort", "held-tool", .5) < .01);
  }
}
console.log("PASS: exported sidearm exclusivity, held release visibility and projectile recovery");
