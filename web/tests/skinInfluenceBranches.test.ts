// @vitest-environment node
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { attribute, storage, uint, vec4 } from "three/tsl";
import { weightedPaletteColumns } from "@packages/photoreal-renderer/src/battle/skinNodes";
import { soldierVertexBodyWgsl } from "../../apps/battle-perf-lab/src/shaders/soldier";

/** Splits emitted skinning code into exact-zero influence branches and the
 * unconditional remainder. Whitespace and TSL's redundant parentheses are ignored. */
function influenceBranches(code: string) {
  const branches: [string, string][] = [];
  const unconditional = code
    .replace(/\s+/g, "")
    .replace(/if\(+weights\.([xyzw])!=0\.0\)+\{([^{}]*)\}/g, (_, channel: string, body: string) => {
      branches.push([channel, body]);
      return "";
    });
  return { branches, unconditional };
}

function expectZeroInfluencesSkipLoads(code: string, paletteLoad: string) {
  const { branches, unconditional } = influenceBranches(code);
  expect(branches.map(([channel]) => channel)).toEqual(["y", "z", "w"]);
  for (const [channel, body] of branches) {
    expect(body).toContain(`joints.${channel}`);
    expect(body).toContain(paletteLoad);
  }
  // The first influence always contributes, so a zero x weight still yields a valid sum.
  expect(unconditional).toContain("joints.x");
  expect(unconditional).toContain(paletteLoad);
  expect(unconditional).not.toMatch(/joints\.[yzw]/);
}

test("native crowd skinning loads later palette matrices only for nonzero weights", () => {
  expectZeroInfluencesSkipLoads(soldierVertexBodyWgsl(3), "palette[");
});

test("TSL crowd skinning branches later palette loads in real control flow", () => {
  const geometry = new THREE.BufferGeometry();
  for (const [name, size] of [
    ["position", 3],
    ["inst1", 4],
    ["joints", 4],
    ["weights", 4],
  ] as const) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(size), size));
  }
  const palette = storage(
    new THREE.StorageBufferAttribute(new Float32Array(48), 4),
    "vec4",
    12,
  ).toReadOnly();
  const [c0, c1, c2, c3] = weightedPaletteColumns(
    palette,
    uint(attribute<"vec4">("inst1", "vec4").y),
    3,
  );
  const position = attribute<"vec3">("position", "vec3");
  const skinned = c0.mul(position.x).add(c1.mul(position.y)).add(c2.mul(position.z)).add(c3);

  // Drive only the vertex flow of Three's WGSL builder: no renderer or device.
  const renderer = { backend: { isWebGPUBackend: true } } as unknown as THREE.Renderer;
  const builder = new THREE.WGSLNodeBuilder(new THREE.Mesh(geometry), renderer) as unknown as {
    setBuildStage(stage: string): void;
    setShaderStage(stage: string): void;
    flowNode(node: THREE.Node): { code: string; result: string };
  };
  const output = vec4(skinned.xyz, 1);
  let code = "";
  for (const stage of ["setup", "analyze", "generate"]) {
    builder.setBuildStage(stage);
    builder.setShaderStage("vertex");
    if (stage === "generate") {
      const flow = builder.flowNode(output);
      code = flow.code + flow.result;
    } else output.build(builder as unknown as THREE.NodeBuilder);
  }
  expectZeroInfluencesSkipLoads(code, ".value[");
});
