// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";
import {
  GPU_DEPTH_CLEAR,
  GPU_DEPTH_FORMAT,
  isGpuReverseZ,
} from "../../packages/renderer-core/src/depthContract";
import {
  BATTLE_DEPTH_ATTACHMENT,
  battleDepthBypass,
  battleDepthReversed,
  battleWorldDepth,
} from "../../packages/battle-renderer/src/worldDepth";

// The battle world publishes `depth.reversed` to the standing renderer
// contract. That claim is only worth anything if the attachment the frame
// clears and the state the pipelines declare are the same decision, so these
// pin the derivation rather than the published words.

test("the world depth state and the frame attachment are one decision", () => {
  const attachment = BATTLE_DEPTH_ATTACHMENT;
  expect(attachment.format).toBe(GPU_DEPTH_FORMAT);
  expect(attachment.clearValue).toBe(GPU_DEPTH_CLEAR);
  for (const mode of ["read", "read-write", "write"] as const)
    expect(battleWorldDepth(mode).format).toBe(attachment.format);
  expect(battleDepthBypass().format).toBe(attachment.format);
  // Opaque world passes write; decals and overlays read the same buffer.
  expect(battleWorldDepth("read-write").depthWriteEnabled).toBe(true);
  expect(battleWorldDepth("write").depthWriteEnabled).toBe(true);
  expect(battleWorldDepth("read").depthWriteEnabled).toBe(false);
  // Coincident ground layers and the terrain depth prepass must still draw.
  expect(battleWorldDepth("read-write").depthCompare).toBe("greater-equal");
  expect(battleDepthBypass().depthCompare).toBe("always");
});

test("reverse-Z is derived from the clear and the compare, not declared", () => {
  expect(battleDepthReversed()).toBe(true);
  const compare = battleWorldDepth("read-write").depthCompare!;
  // The same compare against a forward-Z clear is not reverse-Z, and the
  // forward-Z pairing is rejected outright.
  expect(isGpuReverseZ(compare, 1)).toBe(false);
  expect(isGpuReverseZ("less", GPU_DEPTH_CLEAR)).toBe(false);
  expect(isGpuReverseZ("greater", GPU_DEPTH_CLEAR)).toBe(true);
});

test("every world pipeline declares its depth through that owner", () => {
  const dir = new URL("../../packages/battle-renderer/src/world/", import.meta.url);
  const offenders: string[] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(new URL(name, dir), "utf8");
    // An inline depth-stencil state or format would make the published
    // convention a label beside the pipelines instead of a reading of them.
    for (const [, declared] of source.matchAll(/depthStencil:\s*([^\n]+)/g))
      if (!/battleWorldDepth\(|battleDepthBypass\(/.test(declared))
        offenders.push(`${name}: depthStencil: ${declared.trim()}`);
    if (/["']depth32float["']/.test(source)) offenders.push(`${name}: inline depth format`);
  }
  expect(offenders).toEqual([]);
});
