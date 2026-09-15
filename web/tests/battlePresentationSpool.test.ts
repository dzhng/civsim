// @vitest-environment node
import { expect, it, vi } from "vitest";
import { validateSpoolWindows } from "../../apps/battle-perf-lab/src/PresentationSpool";

it("rejects duplicate window names before recording so a requested window cannot wait forever", () => {
  expect(() =>
    validateSpoolWindows([
      { name: "pan", startMs: 30_000, frameLimit: 6 },
      { name: "pan", startMs: 90_000, frameLimit: 6 },
    ]),
  ).toThrow(/unique/);
});

it("retains a presentation until the disk worker acknowledges its compressed write", async () => {
  const { PresentationSpool } = await import("../../apps/battle-perf-lab/src/PresentationSpool");
  let finish!: () => void;
  vi.stubGlobal(
    "Worker",
    class {
      onmessage?: (event: { data: unknown }) => void;
      postMessage({ id, blob }: { id: number; blob: Blob }) {
        finish = () => this.onmessage?.({ data: { id, bytes: blob.size } });
      }
      terminate() {}
    },
  );
  const spool = new PresentationSpool(
    {} as HTMLCanvasElement,
    {} as ConstructorParameters<typeof PresentationSpool>[1],
    {} as ConstructorParameters<typeof PresentationSpool>[2],
    [{ name: "later", startMs: 10, frameLimit: 1 }],
    () => {
      throw Error("Preparation must not finish a running window");
    },
    "http://127.0.0.1:1234",
  );
  try {
    spool.offer(
      {
        animationFrame: 7,
        frame: { frameId: 1 },
        reference: { values: new Float32Array([1.25, -0, Infinity]) },
      } as unknown as Parameters<typeof spool.offer>[0],
      0,
      false,
    );
    await expect.poll(() => finish).toBeTypeOf("function");
    expect(spool.status().queued).toBe(1);
    expect(spool.status().retainedBytes).toBeGreaterThan(spool.inputs.size);
    finish();
    await expect.poll(() => spool.status().queued).toBe(0);
    expect(spool.status().acknowledged).toBe(1);
    expect(spool.status().retainedBytes).toBe(spool.inputs.size);
  } finally {
    spool.dispose();
    vi.unstubAllGlobals();
  }
});
