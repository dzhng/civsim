// Numerical GPU admission/sampling probe: no aesthetic or snapshot acceptance.
import { fileURLToPath } from "node:url";

export const meta = {
  name: "image-texture",
  kind: "flow",
  world: "isolated-webgpu-image-texture",
  tier: "quick",
  snapshots: [],
  describe:
    "Checked image upload, area-weighted mips, Three sampling and GPU ownership; numerical readback only.",
};
const modulePath = fileURLToPath(
  new URL("../../../packages/renderer-core/src/imageTexture.ts", import.meta.url),
);
export async function run(ctx) {
  const page = await ctx.newPage();
  const warnings = [];
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) warnings.push(message.text());
  });
  await page.route(`${ctx.target}/__image-texture-probe`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Image texture GPU probe</title>",
    }),
  );
  await page.goto(`${ctx.target}/__image-texture-probe`);
  const report = await page.evaluate(async (modulePath) => {
    const { uploadImageTexture } = await import(`/@fs${modulePath}`);
    const THREE = await import("/node_modules/three/build/three.webgpu.js");
    // Vite can rewrite three.tsl.js to its optimized Three module even when
    // this isolated page loaded the raw build. Keep renderer and node caches
    // in one module instance; an import map cannot override a rewritten URL.
    const T = THREE.TSL;
    const renderer = new THREE.WebGPURenderer();
    await renderer.init();
    const device = renderer.backend.device;
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok, detail });
    const textures = [];
    const wrappers = [];
    async function read(texture, level = 0) {
      const width = Math.max(1, texture.width >> level),
        height = Math.max(1, texture.height >> level);
      const row = Math.ceil((width * 4) / 256) * 256;
      const buffer = device.createBuffer({
        size: row * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      try {
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer({ texture, mipLevel: level }, { buffer, bytesPerRow: row }, [
          width,
          height,
        ]);
        device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ);
        const mapped = new Uint8Array(buffer.getMappedRange()),
          result = [];
        for (let y = 0; y < height; y++)
          result.push(...mapped.subarray(y * row, y * row + width * 4));
        return result;
      } finally {
        buffer.destroy();
      }
    }
    const decode = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    const encode = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055);
    function meanMip(data, width, height, srgb) {
      const dw = Math.max(1, width >> 1),
        dh = Math.max(1, height >> 1),
        out = [];
      for (let y = 0; y < dh; y++)
        for (let x = 0; x < dw; x++) {
          const sum = [0, 0, 0, 0];
          for (let sy = 0; sy < height; sy++)
            for (let sx = 0; sx < width; sx++) {
              const weight =
                Math.max(
                  0,
                  Math.min(((x + 1) * width) / dw, sx + 1) - Math.max((x * width) / dw, sx),
                ) *
                Math.max(
                  0,
                  Math.min(((y + 1) * height) / dh, sy + 1) - Math.max((y * height) / dh, sy),
                );
              for (let c = 0; c < 4; c++) {
                const v = data[(sy * width + sx) * 4 + c] / 255;
                sum[c] += (srgb && c < 3 ? decode(v) : v) * weight;
              }
            }
          out.push(
            ...sum.map((v, c) =>
              Math.round(
                255 *
                  (srgb && c < 3
                    ? encode(v / ((width * height) / dw / dh))
                    : v / ((width * height) / dw / dh)),
              ),
            ),
          );
        }
      return out;
    }
    let sampleLinear, sampleSrgb;
    for (const [width, height] of [
      [8, 4],
      [5, 3],
      [1, 5],
      [3, 1],
      [1, 1],
    ]) {
      for (const colorSpace of ["linear", "srgb"]) {
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            pixels.set(
              [x % 2 ? 255 : 0, y % 2 ? 192 : 64, x === width - 1 ? 255 : 32, 255],
              (y * width + x) * 4,
            );
          }
        const image = await createImageBitmap(new ImageData(pixels, width, height), {
          colorSpaceConversion: "none",
          premultiplyAlpha: "none",
        });
        const texture = await uploadImageTexture(device, image, {
          colorSpace,
          generateMipmaps: true,
        });
        textures.push(texture);
        check(
          `${width}x${height} ${colorSpace} caller retains image`,
          image.width === width,
          image.width,
        );
        image.close();
        let expected = Array.from(pixels),
          w = width,
          h = height;
        check(
          `${width}x${height} ${colorSpace} dimensions and levels`,
          texture.width === width &&
            texture.height === height &&
            texture.mipLevelCount === Math.floor(Math.log2(Math.max(width, height))) + 1,
          [texture.width, texture.height, texture.mipLevelCount],
        );
        for (let level = 0; level < texture.mipLevelCount; level++) {
          const actual = await read(texture, level);
          const maxError = Math.max(...actual.map((v, i) => Math.abs(v - expected[i])));
          check(`${width}x${height} ${colorSpace} mip ${level}`, maxError <= 2, {
            maxError,
            actual,
            expected,
          });
          expected = meanMip(expected, w, h, colorSpace === "srgb");
          w = Math.max(1, w >> 1);
          h = Math.max(1, h >> 1);
        }
        if (width === 8) {
          if (colorSpace === "linear") sampleLinear = texture;
          else sampleSrgb = texture;
        }
      }
    }
    // Fixed scalar/data values survive upload, and no mips are invented.
    const orm = await createImageBitmap(
      new ImageData(new Uint8ClampedArray([32, 64, 192, 255]), 1, 1),
    );
    const ormTexture = await uploadImageTexture(device, orm, {
      colorSpace: "linear",
      generateMipmaps: false,
    });
    textures.push(ormTexture);
    orm.close();
    check(
      "linear ORM channels unchanged",
      JSON.stringify(await read(ormTexture)) === "[32,64,192,255]",
      await read(ormTexture),
    );
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    camera.position.z = 1;
    const scene = new THREE.Scene(),
      material = new THREE.MeshBasicNodeMaterial();
    material.toneMapped = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    const output = new THREE.RenderTarget(1, 1, { depthBuffer: false });
    output.texture.colorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(output);
    function wrap(gpu, colorSpace, linear = false, repeat = false) {
      const texture = new THREE.ExternalTexture(gpu);
      texture.colorSpace = colorSpace;
      texture.flipY = false;
      texture.generateMipmaps = false;
      texture.minFilter = linear
        ? THREE.LinearMipmapLinearFilter
        : THREE.NearestMipmapNearestFilter;
      texture.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
      texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      renderer.initTexture(texture);
      wrappers.push(texture);
      return texture;
    }
    async function sample(texture, uv, level = 0) {
      material.colorNode = T.texture(texture, T.vec2(...uv)).level(level).rgb;
      material.needsUpdate = true;
      renderer.render(scene, camera);
      return Array.from(await renderer.readRenderTargetPixelsAsync(output, 0, 0, 1, 1)).slice(0, 3);
    }
    const near = (actual, expected) => actual.every((v, i) => Math.abs(v - expected[i]) <= 2);
    const linear = wrap(sampleLinear, THREE.NoColorSpace),
      srgb = wrap(sampleSrgb, THREE.SRGBColorSpace);
    check(
      "Three linear closed-image sampling",
      near(await sample(linear, [0.0625, 0.125]), [0, 64, 32]),
      await sample(linear, [0.0625, 0.125]),
    );
    check(
      "Three sRGB decodes once",
      near(await sample(srgb, [0.0625, 0.125]), [0, 13, 4]),
      await sample(srgb, [0.0625, 0.125]),
    );
    const smooth = wrap(sampleLinear, THREE.NoColorSpace, true);
    check(
      "Three linear interpolation",
      near(await sample(smooth, [0.125, 0.125]), [128, 64, 32]),
      await sample(smooth, [0.125, 0.125]),
    );
    const repeating = wrap(sampleLinear, THREE.NoColorSpace, false, true);
    check(
      "Three repeat",
      near(await sample(repeating, [1.0625, 0.125]), [0, 64, 32]),
      await sample(repeating, [1.0625, 0.125]),
    );
    check(
      "Three clamp",
      near(await sample(linear, [1.0625, 0.125]), [255, 64, 255]),
      await sample(linear, [1.0625, 0.125]),
    );
    const mip1 = (await read(sampleLinear, 1)).slice(0, 3),
      mip2 = (await read(sampleLinear, 2)).slice(0, 3);
    check(
      "Three nearest mip choice",
      near(await sample(linear, [0.01, 0.01], 1.7), mip2),
      await sample(linear, [0.01, 0.01], 1.7),
    );
    check(
      "Three mip interpolation",
      near(
        await sample(smooth, [0.01, 0.01], 1.5),
        mip1.map((v, i) => (v + mip2[i]) / 2),
      ),
      await sample(smooth, [0.01, 0.01], 1.5),
    );
    material.colorNode = T.texture(linear, T.uv()).rgb;
    material.needsUpdate = true;
    renderer.render(scene, camera);
    check(
      "Three implicit mip selection",
      near(
        Array.from(await renderer.readRenderTargetPixelsAsync(output, 0, 0, 1, 1)).slice(0, 3),
        (await read(sampleLinear, 3)).slice(0, 3),
      ),
    );
    material.colorNode = T.vec3(
      T.textureSize(T.texture(linear)).x.div(8),
      T.textureSize(T.texture(linear)).y.div(4),
      0,
    );
    material.needsUpdate = true;
    renderer.render(scene, camera);
    check(
      "Three reports GPU dimensions",
      near(
        Array.from(await renderer.readRenderTargetPixelsAsync(output, 0, 0, 1, 1)).slice(0, 3),
        [255, 255, 0],
      ),
    );
    linear.dispose();
    check(
      "Three wrapper disposal leaves GPU allocation alive",
      near(await sample(wrap(sampleLinear, THREE.NoColorSpace), [0.0625, 0.125]), [0, 64, 32]),
    );
    // Only the real GPU boundary is intercepted; allocation, shader, upload and rollback stay real.
    for (const failure of ["synchronous", "validation", "mip-validation"]) {
      let allocated;
      const queue = new Proxy(device.queue, {
        get(target, key) {
          if (key === "copyExternalImageToTexture")
            return (...args) => {
              if (failure === "synchronous") throw new Error("injected copy failure");
              return target.copyExternalImageToTexture(
                args[0],
                failure === "validation" ? { ...args[1], origin: [2, 0, 0] } : args[1],
                args[2],
              );
            };
          const v = Reflect.get(target, key, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
      const proxy = new Proxy(device, {
        get(target, key) {
          if (key === "queue") return queue;
          if (key === "createTexture")
            return (descriptor) => (allocated = target.createTexture(descriptor));
          if (key === "createRenderPipeline" && failure === "mip-validation")
            return (descriptor) =>
              target.createRenderPipeline({
                ...descriptor,
                fragment: { ...descriptor.fragment, targets: [{ format: "rgba8unorm" }] },
              });
          const v = Reflect.get(target, key, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
      const image = await createImageBitmap(
        new ImageData(new Uint8ClampedArray(Array(4).fill([1, 2, 3, 255]).flat()), 2, 2),
      );
      let message = "";
      try {
        await uploadImageTexture(proxy, image, {
          colorSpace: "srgb",
          generateMipmaps: failure === "mip-validation",
        });
      } catch (error) {
        message = String(error);
      }
      check(
        `${failure} upload rejects and caller retains bitmap`,
        message.includes("Image texture preparation failed") &&
          image.width === 2 &&
          (failure === "synchronous"
            ? message.includes("injected copy")
            : !message.includes("OperationError")),
        message,
      );
      image.close();
      device.pushErrorScope("validation");
      device.queue.writeTexture(
        { texture: allocated },
        new Uint8Array(4),
        { bytesPerRow: 4 },
        [1, 1],
      );
      const error = await device.popErrorScope();
      check(
        `${failure} partial GPU allocation destroyed`,
        !!error && /destroyed/i.test(error.message),
        error?.message,
      );
    }
    for (const texture of wrappers) texture.dispose();
    output.dispose();
    mesh.geometry.dispose();
    material.dispose();
    for (const texture of textures) texture.destroy();
    renderer.dispose();
    return { three: THREE.REVISION, checks, ok: checks.every((check) => check.ok) };
  }, modulePath);
  for (const check of report.checks)
    ctx.check(check.name, check.ok, check.detail === undefined ? "" : JSON.stringify(check.detail));
  ctx.check("no GPU or Three warnings", warnings.length === 0, warnings);
  await page.close();
}
