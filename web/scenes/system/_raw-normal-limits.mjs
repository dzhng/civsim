import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

/** Public raw consumer, with valid vertex frames that cancel only at a fragment. */
export async function checkRawNormalLimits(ctx) {
  const page = await ctx.newPage();
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([255, 128, 128, 255]);
  const balanced = new PNG({ width: 2, height: 1 });
  balanced.data.set([127, 127, 127, 255, 128, 128, 128, 255]);
  const negative = new PNG({ width: 1, height: 1 });
  negative.data.set([255, 128, 0, 255]);
  await page.route(`${ctx.target}/__raw-normal-limit`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}canvas{width:129px;height:129px}</style><canvas></canvas>",
    }),
  );
  await page.route("**/raw-limit-normal.png", (route) =>
    route.fulfill({ contentType: "image/png", body: PNG.sync.write(image) }),
  );
  await page.route("**/raw-limit-balanced.png", (route) =>
    route.fulfill({ contentType: "image/png", body: PNG.sync.write(balanced) }),
  );
  await page.route("**/raw-limit-negative.png", (route) =>
    route.fulfill({ contentType: "image/png", body: PNG.sync.write(negative) }),
  );
  try {
    await page.goto(`${ctx.target}/__raw-normal-limit`);
    await page.evaluate(async (root) => {
      const { createFrameShell } = await import(
        `/@fs${root}packages/renderer-core/src/frameShell.ts`
      );
      const { SkinnedCrowdPipeline } = await import(
        `/@fs${root}packages/renderer-core/src/skinnedPipeline.ts`
      );
      const { loadAppearanceCatalog } = await import(
        `/@fs${root}packages/soldier-assets/src/appearanceBundle.ts`
      );
      const { assertMappedTangentFrames } = await import(
        `/@fs${root}packages/soldier-assets/src/skin.ts`
      );
      const shell = await createFrameShell(document.querySelector("canvas"), {
        sun: { sunAzimuth: 0, sunElevation: 1 },
      });
      shell.resize({ width: 129, height: 129, dpr: 1 });
      // YZ quad faces the +X camera exactly: equal clip W and an odd viewport
      // put the cancellation line on pixel centers without perspective rounding.
      shell.setCamera({
        x: 0,
        y: 0,
        zoom: 1,
        camera3d: {
          target: [0, 0, 0],
          distance: 3,
          pitch: 0,
          yaw: 0,
          fovY: 1,
          aspect: 1,
          near: 0.1,
        },
      });
      const source = (
        await loadAppearanceCatalog(
          new URL("/assets/soldiers/candidates/blender-reference/catalog.json", location.href).href,
        )
      )[40];
      const bytes = new Uint8Array(await (await fetch("/raw-limit-normal.png")).arrayBuffer());
      const balancedBytes = new Uint8Array(
        await (await fetch("/raw-limit-balanced.png")).arrayBuffer(),
      );
      const negativeBytes = new Uint8Array(
        await (await fetch("/raw-limit-negative.png")).arrayBuffer(),
      );
      let pipeline;
      window.renderNormalLimit = async ({
        collapse,
        back = false,
        mapped = true,
        scale = 1,
        negativeZ = false,
        normalSign,
      }) => {
        pipeline?.dispose();
        const sign = normalSign ?? (back ? -1 : 1);
        const mesh = {
          positions: new Float32Array([0, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1]),
          normals: new Float32Array(
            collapse === "normal"
              ? [0, 1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0]
              : [sign, 0, 0, sign, 0, 0, sign, 0, 0, sign, 0, 0],
          ),
          tangents: new Float32Array(
            collapse === "tangent"
              ? [0, 1, 0, 1, 0, -1, 0, 1, 0, -1, 0, 1, 0, 1, 0, 1]
              : [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
          ),
          colors: new Float32Array([
            0.3, 0.3, 0.3, 1, 0.3, 0.3, 0.3, 1, 0.3, 0.3, 0.3, 1, 0.3, 0.3, 0.3, 1,
          ]),
          joints: new Uint16Array(16),
          weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
          uvs: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
          materialIds: new Float32Array(4),
          factionMasks: new Float32Array(4),
          indices: new Uint16Array(back ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]),
        };
        const surface = {
          materials: [
            {
              name: "normal-limit",
              baseColor: [1, 1, 1, 1],
              roughness: 1,
              metallic: 0,
              normalScale: scale,
              textures: mapped ? { normal: true } : undefined,
            },
          ],
          textures: {
            normal: {
              image: negativeZ ? negativeBytes : collapse === "map" ? balancedBytes : bytes,
              mimeType: "image/png",
              sampler: {
                magFilter: "linear",
                minFilter: "linear",
                mipmapFilter: "none",
                wrapS: "clamp-to-edge",
                wrapT: "clamp-to-edge",
              },
            },
          },
        };
        assertMappedTangentFrames(mesh, surface.materials);
        const animation = structuredClone(source.animation);
        animation.data.fill(0);
        for (let bone = 0; bone < animation.height / 4; bone++)
          for (let frame = 0; frame < animation.width; frame++)
            for (let axis = 0; axis < 4; axis++)
              animation.data[((bone * 4 + axis) * animation.width + frame) * 4 + axis] = 1;
        pipeline = await SkinnedCrowdPipeline.create(shell, {
          0: { ...source, surface, animation, tiers: [mesh, mesh, mesh] },
        });
        pipeline.upload(
          [
            {
              x: 0,
              y: 0,
              facing: Math.PI / 2,
              faction: 0,
              seed: 0,
              classId: 0,
              alive: true,
              clip: "bend",
              phase: 0,
            },
          ],
          { size: 1 },
        );
        shell.drawFrame({
          passes: [
            {
              id: "normal-limit",
              role: "world-opaque",
              phase: "world-depth",
              depth: "read-write",
              draw: (pass) => pipeline.draw(pass),
            },
          ],
        });
      };
      window.closeNormalLimit = () => {
        pipeline?.dispose();
        shell.destroy();
      };
    }, root);
    const sample = async (state) => {
      await page.evaluate((state) => window.renderNormalLimit(state), state);
      await page.waitForTimeout(100);
      const png = PNG.sync.read(await page.locator("canvas").screenshot());
      const offset = (64 * png.width + 64) * 4;
      return Array.from(png.data.subarray(offset, offset + 3));
    };
    for (const back of [false, true]) {
      const expected = await sample({ back, mapped: false });
      const actual = await sample({ back, collapse: "normal" });
      ctx.check(
        `raw collapsed normal uses authored ${back ? "back" : "front"} face orientation`,
        actual.every((v, i) => Math.abs(v - expected[i]) <= 1),
        JSON.stringify({ actual, expected }),
      );
      const zeroScale = await sample({ back, collapse: "normal", scale: 0 });
      ctx.check(
        `raw zero-scale collapsed normal keeps finite ${back ? "back" : "front"} face orientation`,
        zeroScale.every((v, i) => Math.abs(v - expected[i]) <= 1),
        JSON.stringify({ actual: zeroScale, expected }),
      );
    }
    const expected = await sample({ mapped: false });
    const tangent = await sample({ collapse: "tangent" });
    ctx.check(
      "raw collapsed tangent uses the geometric normal",
      tangent.every((v, i) => Math.abs(v - expected[i]) <= 1),
      JSON.stringify({ actual: tangent, expected }),
    );
    const map = await sample({ collapse: "map" });
    ctx.check(
      "raw zero decoded normal uses the geometric normal",
      map.every((v, i) => Math.abs(v - expected[i]) <= 1),
      JSON.stringify({ actual: map, expected }),
    );
    const negative = await sample({ negativeZ: true, scale: 0 });
    const negativeExpected = await sample({ mapped: false, normalSign: -1 });
    ctx.check(
      "raw zero normal scale preserves negative authored Z",
      negative.every((v, i) => Math.abs(v - negativeExpected[i]) <= 1),
      JSON.stringify({ actual: negative, expected: negativeExpected }),
    );
  } finally {
    await page.evaluate(() => window.closeNormalLimit?.());
    await page.close();
  }
}
