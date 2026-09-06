import { type FrameGraphPass, type RawFrameShell } from "@packages/renderer-core/src/frameShell";
import { generatedCrowd } from "../labFixtures";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, publish } from "../labShell";

export async function route(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 9,
    pitch: 0.38,
    yaw: -0.18,
  });
  const markers = generatedCrowd(80, -10, -9, 0).concat(generatedCrowd(80, 10, 3, 1));
  const pipeline = await createSkinnedPipeline(shell);
  const frameGraphContractFixtures = liveFrameGraphContractFixtures(shell);
  animateSkinned(shell, pipeline, () => markers);
  publish("frame-shell", true, {
    ...shell.stats(),
    markers: markers.length,
    frameGraphContractFixtures,
  });
}

function liveFrameGraphContractFixtures(shell: RawFrameShell) {
  const fixtures = [
    {
      id: "backgroundDepthMode",
      expected: "non-world-depth",
      passes: [
        {
          id: "bad-background-depth",
          role: "background-underpaint",
          phase: "background",
          depth: "read",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "worldMissingDepthMode",
      expected: "must declare depth mode",
      passes: [
        {
          id: "bad-world-missing-depth",
          role: "world-opaque",
          phase: "world-depth",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "worldUnsupportedDepthMode",
      expected: "must declare depth mode",
      passes: [
        {
          id: "bad-world-depth-mode",
          role: "world-opaque",
          phase: "world-depth",
          depth: "sample",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "unsupportedPhase",
      expected: "unsupported phase",
      passes: [
        {
          id: "bad-phase",
          role: "overlay-effect",
          phase: "transparent-world",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "missingSemanticRole",
      expected: "must declare a semantic role",
      passes: [
        {
          id: "bad-missing-role",
          phase: "world-depth",
          depth: "read-write",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "mismatchedSemanticRole",
      expected: "is incompatible with phase",
      passes: [
        { id: "bad-role-phase", role: "world-opaque", phase: "overlay", draw: () => undefined },
      ],
    },
    {
      id: "mismatchedDepthRole",
      expected: "requires role",
      passes: [
        {
          id: "bad-depth-role",
          role: "world-decal",
          phase: "world-depth",
          depth: "read-write",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "readOnlyBeforeWrite",
      expected: "writes depth after read-only world decals have started",
      passes: [
        {
          id: "early-world-decal",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: () => undefined,
        },
        {
          id: "late-world-opaque",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: () => undefined,
        },
      ],
    },
    {
      id: "topLevelTypeBucketPass",
      expected: "is a type bucket, not a semantic frame pass",
      passes: [
        {
          id: "treeBucket",
          label: "Tree bucket",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          batching: { strategy: "instance-kind", buckets: ["conifer"] },
          draw: () => undefined,
        },
      ],
    },
  ];
  return fixtures.map((fixture) => {
    try {
      shell.drawFrame({ passes: fixture.passes as unknown as FrameGraphPass[] });
      return { id: fixture.id, expected: fixture.expected, rejected: false, diagnostics: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        id: fixture.id,
        expected: fixture.expected,
        rejected: message.includes(fixture.expected),
        diagnostics: [message],
      };
    }
  });
}
