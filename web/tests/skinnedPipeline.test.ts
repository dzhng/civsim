// @vitest-environment node
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import type { SoldierMeshData } from "@packages/soldier-assets/src/mesh";
import { bakeLocalAnimation } from "@packages/soldier-assets/src/localAnimation";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { COARSEST_SHADOW_LOD, IMPOSTOR_LEVEL } from "@packages/crowd-runtime/src/lod";
import { buildStackCrowd } from "@packages/crowd-runtime/src/stackCrowd";

test("class clip lookup follows appearances, not their flattened LOD resources", async () => {
  vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, VERTEX: 2, INDEX: 4, UNIFORM: 8, STORAGE: 16 });
  vi.stubGlobal("GPUTextureUsage", {
    TEXTURE_BINDING: 1,
    COPY_DST: 2,
    COPY_SRC: 4,
    RENDER_ATTACHMENT: 8,
  });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 });
  try {
    // Only the hardware boundary is inert; local encoding, playback packing,
    // resource ownership and the public appearance lookup run unchanged.
    const writes = new Map<string, Float32Array>();
    const tables = new Map<string, Float32Array>();
    const allocations: { label: string; destroyed: number }[] = [];
    const copiedImages: number[] = [];
    const closedImages: number[] = [];
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
      const marker = new Uint8Array(await blob.arrayBuffer())[0];
      if (marker === 255) throw new Error("injected decode failure");
      return { width: 2, height: 2, marker, close: () => closedImages.push(marker) };
    });
    let failBindGroup: string | undefined;
    const allocate = (label: string) => {
      const resource = {
        label,
        destroyed: 0,
        destroy() {
          this.destroyed++;
        },
      };
      allocations.push(resource);
      return resource;
    };
    const device = {
      limits: { maxTextureDimension2D: 8192, maxComputeWorkgroupsPerDimension: 65535 },
      pushErrorScope() {},
      popErrorScope: () => Promise.resolve(null),
      createBindGroupLayout: () => ({}),
      createBindGroup: (descriptor: { label: string }) => {
        if (descriptor.label === failBindGroup)
          throw new Error("injected material allocation failure");
        return { label: descriptor.label };
      },
      createBuffer: (descriptor: { label: string; size: number }) =>
        Object.assign(allocate(descriptor.label), { size: descriptor.size }),
      createTexture: (descriptor: { label: string; mipLevelCount?: number }) =>
        Object.assign(allocate(descriptor.label), {
          width: 2,
          height: 2,
          mipLevelCount: descriptor.mipLevelCount ?? 1,
          createView: () => ({}),
        }),
      createSampler: () => ({}),
      createShaderModule: () => ({}),
      createPipelineLayout: () => ({}),
      createRenderPipeline: () => ({}),
      createComputePipeline: () => ({}),
      queue: {
        copyExternalImageToTexture(source: { source: { marker: number } }) {
          copiedImages.push(source.source.marker);
        },
        writeBuffer(buffer: { label: string }, offset: number, data: Float32Array) {
          writes.set(buffer.label, data.slice());
        },
        writeTexture(destination: { texture: { label: string } }, data: Float32Array) {
          tables.set(destination.texture.label, data.slice());
        },
      },
    };
    const shell = {
      device,
      info: {
        format: "rgba8unorm",
        caps: { maxStorageBufferBindingSize: 65536, maxBufferSize: 65536 },
      },
      sampleCount: 1,
      cameraBindGroupLayout: {},
    } as unknown as Parameters<typeof SkinnedCrowdPipeline.create>[0];
    const mesh: SoldierMeshData = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      colors: new Float32Array(12).fill(1),
      joints: new Uint16Array(12),
      weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      uvs: new Float32Array(6),
      tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
      materialIds: new Float32Array([1, 1, 1]),
      factionMasks: new Float32Array([0, 0.5, 1]),
      indices: new Uint16Array([0, 1, 2]),
    };
    const rigFor = (start: number): ImportedRig => ({
      bones: [
        {
          name: "root",
          parent: -1,
          bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
          inverseBind: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      ],
      clips: [
        ...(start
          ? [
              {
                name: "padding",
                duration: 4,
                loop: false,
                tracks: { 0: { T: { times: [0, 1, 2, 3, 4], values: Array(15).fill(0) } } },
              },
            ]
          : []),
        { name: "idle", duration: 1, loop: true, tracks: {} },
        { name: "attack", duration: 2, loop: false, tracks: {} },
      ],
    });
    const appearance = (start: number): AppearanceBundle => ({
      manifest: {
        name: `fixture-${start}`,
        mounted: false,
        presentation: null,
        skeleton: "rig.json",
        animation: "animation.json",
        materials: "materials.json",
        tiers: ["near.json", "intermediate.json", "mid.json", "far.json"],
        far: { mesh: "far.json", clip: "idle", phase: 0 },
        bounds: { center: [0, 0, 0], radius: 1 },
      },
      rig: rigFor(start),
      animation: bakeLocalAnimation(rigFor(start)),
      surface: {
        textures: {},
        materials: [
          { name: "neutral", baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 },
          {
            name: "ordinary-blue",
            baseColor: [0.1, 0.2, 0.7, 1],
            roughness: start === 0 ? 0.25 : 0.75,
            metallic: 0.5,
          },
        ],
      },
      tiers: [mesh, mesh, mesh, { ...mesh, indices: new Uint32Array([0, 1, 2, 2, 1, 0]) }],
      farMesh: mesh,
    });
    const crowd = await SkinnedCrowdPipeline.create(shell, { 0: appearance(0), 5: appearance(5) });
    assert.equal(
      [...tables.keys()].filter((key) => key.startsWith("skinned-material-table")).length,
      2,
      "each appearance uploads its own table, shared by all LODs",
    );
    assert.deepEqual(
      Array.from(tables.get("skinned-material-table-1")!),
      Array.from(
        new Float32Array([
          1, 1, 1, 1, 0.1, 0.2, 0.7, 1, 1, 0, 1, 1, 0.75, 0.5, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ),
    );
    assert.equal(crowd.stats().materialTableBytes, 192);
    assert.equal(writes.get("skinned-soldier-0-vertices")![24], 1);
    assert.equal(writes.get("skinned-soldier-0-vertices")![51], 0.5);
    assert.deepEqual(crowd.classClip(0, "idle"), {
      name: "idle",
      start: 0,
      times: [0, 1],
      stepMaskOffset: 0,
      loop: true,
      duration: 1,
    });
    assert.deepEqual(crowd.classClip(5, "idle"), {
      name: "idle",
      start: 5,
      times: [0, 1],
      stepMaskOffset: 1,
      loop: true,
      duration: 1,
    });
    assert.throws(() => crowd.classClip(1, "idle"), /appearance 1 is not loaded/);
    assert.throws(() => crowd.classClip(0.5, "idle"), /appearance 0.5 is not loaded/);
    const [instance] = generatedFormation(1, { clip: "idle" });
    crowd.upload([{ ...instance, x: 19, classId: 5, lod: COARSEST_SHADOW_LOD, clip: "idle" }]);
    const draws: number[][] = [];
    const indexFormats: GPUIndexFormat[] = [];
    let instanceValues: Float32Array | undefined;
    const materialGroups: string[] = [];
    const pass = {
      setPipeline() {},
      setBindGroup(slot: number, group: { label: string }) {
        if (slot === 2) materialGroups.push(group.label);
      },
      setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat) {
        indexFormats.push(format);
      },
      setVertexBuffer(slot: number, buffer: { label: string }) {
        if (slot === 1) instanceValues = writes.get(buffer.label);
      },
      drawIndexed(indices: number, instances: number) {
        draws.push([indices, instances, instanceValues![0], instanceValues![5]]);
      },
    } as unknown as Parameters<SkinnedCrowdPipeline["draw"]>[0];
    crowd.draw(pass);
    assert.deepEqual(
      draws,
      [[6, 1, 19, 0]],
      "sparse class 5 far tier uses its own geometry, rig palette slot and submitted world position",
    );
    assert.deepEqual(indexFormats, ["uint32"]);
    assert.deepEqual(
      materialGroups,
      ["skinned-material-bg-1"],
      "sparse appearance selects its own material table",
    );
    // Campaign stacks draw only the near tier; this pipeline has no impostor, so
    // an impostor level resolves to the coarsest mesh.
    const stack = buildStackCrowd([0, 0, 0, 0, 0, 1], {
      unitCount: 1,
      stackUnitCap: 1,
      maxFigures: 1,
      x: 7,
      y: 0,
      faction: 0,
      seed: 1,
      clipForClass: () => "idle",
    });
    for (const [lod, indices] of [
      [undefined, 3],
      [IMPOSTOR_LEVEL, 6],
    ] as const) {
      draws.length = 0;
      crowd.upload(stack.map((figure) => ({ ...figure, lod: lod ?? figure.lod })));
      crowd.draw(pass);
      assert.deepEqual(
        draws,
        [[indices, 1, Math.fround(stack[0].x), 0]],
        `stack figure lod ${lod ?? "campaign"}`,
      );
    }
    for (const alive of [false, true]) {
      for (const weight of [0, 0.5, 1]) {
        crowd.upload([
          {
            ...instance,
            classId: 5,
            lod: 2,
            alive,
            playback: {
              appearanceId: 5,
              base: {
                source: { kind: "clip", sample: { clip: "idle", phase: 0 } },
                destination: { clip: "attack", phase: 0.8 },
                weight,
              },
            },
          },
        ]);
        crowd.draw(pass);
        assert.equal(
          instanceValues![10],
          alive ? 0 : weight,
          "corpse presentation follows death blend weight, never destination phase",
        );
      }
    }
    crowd.upload([{ ...instance, classId: 5, lod: COARSEST_SHADOW_LOD, alive: false }]);
    crowd.draw(pass);
    assert.equal(instanceValues![10], 1, "manual corpses retain full styling");
    crowd.upload([{ ...instance, classId: 5, lod: COARSEST_SHADOW_LOD, clip: "idle", phase: 1 }]);
    assert.deepEqual(
      Array.from(writes.get("skinned-pose-1-controls")!.slice(8, 12)),
      [6, 6, 0, 1],
      "explicit phase one in a looping manual clip keeps its authored endpoint",
    );
    crowd.upload([{ ...instance, classId: 5, lod: COARSEST_SHADOW_LOD, clip: "attack", phase: 1 }]);
    crowd.draw(pass);
    assert.deepEqual(
      Array.from(writes.get("skinned-pose-1-controls")!.slice(8, 12)),
      [8, 8, 0, 2],
      "the final nonloop sample resolves to the authored endpoint in GPU controls",
    );
    assert.throws(() => crowd.upload([{ ...instance, classId: 1 }]), /appearance 1 is not loaded/);
    assert.throws(
      () =>
        crowd.upload([
          { ...instance, classId: 0, clip: "idle" },
          { ...instance, classId: 5, clip: "missing-after-first-rig-upload" },
        ]),
      /missing/,
    );
    const beforeSuppressedDraw = draws.length;
    crowd.precompute({
      beginComputePass() {
        throw new Error("partial compute submitted");
      },
    } as unknown as GPUCommandEncoder);
    crowd.draw(pass);
    assert.equal(
      draws.length,
      beforeSuppressedDraw,
      "caught upload failure must not submit a mixed-rig crowd",
    );
    crowd.upload([{ ...instance, classId: 5, lod: COARSEST_SHADOW_LOD, clip: "idle" }]);
    crowd.draw(pass);
    assert.equal(
      draws.length,
      beforeSuppressedDraw + 1,
      "a complete successful upload restores submission",
    );
    crowd.dispose();
    crowd.dispose();
    assert.ok(
      allocations.every((resource) => resource.destroyed === 1),
      "every owned GPU resource is destroyed exactly once",
    );
    assert.throws(() => crowd.upload([]), /disposed/);
    const beforeFailure = allocations.length;
    failBindGroup = "skinned-material-bg-1";
    await assert.rejects(
      SkinnedCrowdPipeline.create(shell, { 0: appearance(0), 5: appearance(5) }),
      /injected material/,
    );
    assert.ok(
      allocations.slice(beforeFailure).every((resource) => resource.destroyed === 1),
      "partial construction releases material tables and earlier appearance resources",
    );
    failBindGroup = undefined;
    const textured = (marker: number) => {
      const bundle = appearance(0);
      bundle.surface.textures.baseColor = {
        image: new Uint8Array([marker]),
        mimeType: "image/png",
        sampler: {
          magFilter: "nearest",
          minFilter: "nearest",
          mipmapFilter: "none",
          wrapS: "repeat",
          wrapT: "clamp-to-edge",
        },
      };
      bundle.surface.materials[1].textures = { baseColor: true };
      return bundle;
    };
    const first = textured(1),
      second = textured(2);
    second.surface.materials = first.surface.materials;
    const texturedCrowd = await SkinnedCrowdPipeline.create(shell, { 0: first, 1: second });
    assert.equal(
      texturedCrowd.stats().materialVariants,
      2,
      "different images cannot share a binding just because scalar slots share an array",
    );
    assert.deepEqual(copiedImages, [1, 2]);
    assert.deepEqual(
      closedImages,
      [1, 2],
      "every successfully uploaded bitmap closes after preparation",
    );
    assert.deepEqual(texturedCrowd.stats().imageTextures, [
      { channel: "baseColor", width: 2, height: 2, mipLevels: 1 },
      { channel: "baseColor", width: 2, height: 2, mipLevels: 1 },
    ]);
    texturedCrowd.dispose();
    const beforeDecodeFailure = allocations.length;
    await assert.rejects(
      SkinnedCrowdPipeline.create(shell, { 0: textured(3), 1: textured(255) }),
      /decode failure/,
    );
    assert.equal(closedImages.at(-1), 3);
    assert.ok(
      allocations.slice(beforeDecodeFailure).every((resource) => resource.destroyed === 1),
      "a later decode failure releases already-uploaded image textures",
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
