/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
// The hardware control's own compile-time gate. The readback needs a device, but the two
// compute stages it dispatches are pure TypeGPU: they resolve here, so a shader defect
// fails in the worker rather than on the coordinated GPU slot.
import { describe, expect, it } from "vitest";
import { tgpu, d } from "typegpu";
import { WORKGROUP, impostorRecordEntries } from "../impostorRecordCheck";
import { ImpostorRecord, ImpostorState, ImpostorViewBlock } from "../impostorDerivation";
import { IMPOSTOR_ATLAS_POLICY } from "../../../../../packages/soldier-assets/src/impostorAtlas";

const ATLAS = { ...IMPOSTOR_ATLAS_POLICY, center: [0.1, -0.2, 0.9] as const, worldSpan: 1.7 };
const COUNT = 128;
const entries = impostorRecordEntries(ATLAS, COUNT);
const wgsl = tgpu.resolve([entries.perProbeEntry, entries.publishedEntry]);

describe("the diagnostic compute stages", () => {
  it("resolve to two entry points over one set of bindings", () => {
    expect(wgsl.match(/@compute @workgroup_size\(64\)/g)).toHaveLength(2);
    expect(wgsl.split("fn deriveImpostorRecord(")).toHaveLength(2);
    expect(wgsl).toContain(`array<ImpostorState, ${COUNT}>`);
    expect(wgsl).toContain(`array<ImpostorRecord, ${COUNT}>`);
    expect(wgsl).toContain("var<uniform>");
    expect(wgsl).toContain("var<storage, read_write>");
    expect(WORKGROUP).toBe(64);
  });

  it("read the camera from the published block in one stage and per probe in the other", () => {
    const [perProbe, published] = wgsl
      .split("@compute")
      .slice(1)
      .map((body) => body.slice(0, body.indexOf("\n}")));
    expect(perProbe).toMatch(/views\[/);
    expect(published).not.toMatch(/views\[/);
    // Both write the slot they read from, so a record is never another soldier's; the
    // per-probe stage reads one slot more because its camera is indexed too.
    expect(perProbe.match(/\[id\.x\]/g)).toHaveLength(3);
    expect(published.match(/\[id\.x\]/g)).toHaveLength(2);
  });

  it("measures the readback stride the check reads records back at", () => {
    // The check walks the buffer in eight-float strides; the schema has to agree.
    expect(d.sizeOf(ImpostorRecord)).toBe(8 * 4);
    expect(d.sizeOf(ImpostorState)).toBe(6 * 4);
    expect(d.sizeOf(ImpostorViewBlock)).toBe(48);
  });
});
