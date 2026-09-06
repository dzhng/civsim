// @vitest-environment node
import { expect, test, vi } from "vitest";
import { loadClassMeshes } from "@packages/soldier-assets/src/placeholders";

test("loaded mesh indices retain vertices above 65535", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          vertices: Array(65538 * 11).fill(0),
          indices: [65535, 65536, 65537],
        }),
      ),
  );
  try {
    const [mesh] = await loadClassMeshes({ classMeshes: { "0": "/large.json" } });
    expect(Array.from(mesh!.indices)).toEqual([65535, 65536, 65537]);
  } finally {
    vi.unstubAllGlobals();
  }
});
