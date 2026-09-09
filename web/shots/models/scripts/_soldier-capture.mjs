import { PNG } from "pngjs";
import { chromium } from "playwright";
import { APPEARANCE_DESCRIPTORS } from "../../../../packages/soldier-assets/src/appearance.ts";
import { GPU_SWIFTSHADER_FLAGS } from "../../../renderer-probe-lib.mjs";
import { requireSwiftShaderBaseline } from "../../../scenes/models/_swiftshader-baseline.ts";

export const appearances = APPEARANCE_DESCRIPTORS.map((descriptor, id) => ({ id, ...descriptor }));

// The card consumer already names crew 08-artillery; keep that public artifact URL.
export const artifactStem = ({ id, name }) =>
  `${String(id).padStart(2, "0")}-${id === 8 ? "artillery" : name}`;

export function selectedAppearances(only = process.env.ONLY) {
  if (!only) return appearances;
  return [...new Set(only.split(",").map(Number))].map((id) => {
    const appearance = appearances.find((item) => item.id === id);
    if (!appearance) throw new Error(`Unknown appearance ${id}`);
    return appearance;
  });
}

export function roleClip(asset, role, { optional = false } = {}) {
  const binding = asset.manifest.presentation?.actions[role];
  if (!binding) {
    if (optional) return null;
    throw new Error(`Missing presentation role ${role}`);
  }
  const clip = asset.clips.find(({ name }) => name === binding.clip);
  if (!clip) throw new Error(`Missing exported clip ${binding.clip} for ${role}`);
  return clip;
}

export function sheetSamples(asset) {
  const action =
    roleClip(asset, "release", { optional: true }) ?? roleClip(asset, "melee", { optional: true });
  return [
    { clip: roleClip(asset, "atEase"), phase: 0.15 },
    { clip: roleClip(asset, "ready"), phase: 0 },
    ...(action ? [{ clip: action, phase: 0.52 }] : []),
    { clip: roleClip(asset, "walk"), phase: 0.32 },
  ];
}

export function motionSamples(clip) {
  return {
    phases: Array.from({ length: clip.loop ? 8 : 9 }, (_, i) => i / 8),
    delay: Math.max(1, Math.round((clip.duration * 100) / 8)),
  };
}

export function montage(buffers, columns) {
  const images = buffers.map((buffer) => PNG.sync.read(buffer));
  const { width, height } = images[0];
  const out = new PNG({
    width: columns * width,
    height: Math.ceil(images.length / columns) * height,
  });
  images.forEach((image, i) => {
    if (image.width !== width || image.height !== height) throw new Error("Unequal montage tiles");
    PNG.bitblt(
      image,
      out,
      0,
      0,
      width,
      height,
      (i % columns) * width,
      Math.floor(i / columns) * height,
    );
  });
  return PNG.sync.write(out);
}

/** One production poser for cards, static sheets and motion samples. No simulation or second renderer. */
export async function openSoldierCapture() {
  requireSwiftShaderBaseline("soldier review");
  if (process.env.VERIFY_BROWSER_CHANNEL) throw new Error("Soldier baselines use bundled Chromium");
  const browser = await chromium.launch({ args: GPU_SWIFTSHADER_FLAGS });
  const errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const url = new URL(
      "/renderer/battle-models?ref=1",
      process.env.VERIFY_URL ?? "http://localhost:5173",
    );
    await page.goto(url.href);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    const assets = await page.evaluate(() => {
      const harness = window.__battleModels;
      harness.freeze();
      return Object.fromEntries(
        Object.entries(harness.world.soldierAssets).map(([id, asset]) => [
          id,
          {
            manifest: asset.manifest,
            clips: asset.animation.clips.map(({ name, duration, loop }) => ({
              name,
              duration,
              loop,
            })),
          },
        ]),
      );
    });
    const assertHealthy = () => {
      if (errors.length) throw new Error(errors.join("\n"));
    };
    assertHealthy();
    const clipBounds = new Map();
    return {
      assets,
      page,
      async capture(
        appearance,
        clip,
        phase,
        {
          width = 360,
          height = 360,
          yaw = Math.PI / 4,
          pitch = 1.15,
          alive = true,
          framing = "fullKit",
        } = {},
      ) {
        const bodyHeight = appearance.look.mounted ? 2.6 : 1.95;
        const key = `${appearance.id}:${clip.name}`;
        if (framing === "fullKit" && !clipBounds.has(key)) {
          clipBounds.set(
            key,
            await page.evaluate(
              async ({ id, name, phases }) => {
                const entry = performance
                  .getEntriesByType("resource")
                  .find((resource) =>
                    /\/soldier-assets\/src\/localAnimation\.ts(?:\?|$)/.test(resource.name),
                  );
                if (!entry) throw new Error("Production local animation module URL missing");
                const { decodeLocalSample, resolveLocalSample } = await import(entry.name);
                const { localPoseToJointMatrices } = await import(
                  new URL("localPose.ts", entry.name).href
                );
                const { poseSoldierMesh } = await import(new URL("skin.ts", entry.name).href);
                const asset = window.__battleModels.world.soldierAssets[id];
                const exported = asset.animation.clips.find((candidate) => candidate.name === name);
                const min = [Infinity, Infinity, Infinity],
                  max = [-Infinity, -Infinity, -Infinity];
                // A clip-wide focus stays still in motion films; conservative culling spheres
                // include unrelated motion and waste most of a small review panel.
                const samples = new Set([
                  ...phases,
                  ...Array.from(exported.times, (time) =>
                    exported.duration ? time / exported.duration : 0,
                  ),
                ]);
                for (const phase of samples) {
                  const locals = decodeLocalSample(
                    asset.animation,
                    resolveLocalSample(asset.animation, name, phase),
                  );
                  const { positions } = poseSoldierMesh(
                    asset.tiers[0],
                    localPoseToJointMatrices(asset.rig, locals),
                  );
                  for (let i = 0; i < positions.length; i++) {
                    const axis = i % 3;
                    min[axis] = Math.min(min[axis], positions[i]);
                    max[axis] = Math.max(max[axis], positions[i]);
                  }
                }
                return {
                  center: min.map((value, axis) => (value + max[axis]) / 2),
                  radius: Math.hypot(...min.map((value, axis) => max[axis] - value)) / 2,
                };
              },
              {
                id: appearance.id,
                name: clip.name,
                phases: [
                  phase,
                  ...motionSamples(clip).phases,
                  ...sheetSamples(assets[appearance.id]).map((sample) => sample.phase),
                ],
              },
            ),
          );
        }
        const kitBounds = framing === "fullKit" ? clipBounds.get(key) : null;
        const extent = kitBounds ? kitBounds.radius * 2 : appearance.look.mounted ? 4.3 : 3;
        const zoom = (Math.min(width, height) * 0.86) / extent;
        const before = await page.evaluate(
          (pose) => {
            const harness = window.__battleModels;
            const frame = harness.stats().frame;
            harness.set(pose);
            return frame;
          },
          {
            classId: appearance.id,
            clip: clip.name,
            phase,
            alive,
            formation: false,
            yaw,
            pitch,
            zoom,
            target: kitBounds ? kitBounds.center : [0, 0, bodyHeight / 2],
          },
        );
        await page.waitForFunction((frame) => window.__battleModels.stats().frame > frame, before);
        await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
        const state = await page.evaluate(() => window.__battleModels.stats());
        if (
          state.error ||
          state.sampled?.clip !== clip.name ||
          Math.abs(state.sampled.phase - phase) > 1e-6
        )
          throw new Error(`Production pose not submitted: ${JSON.stringify(state.sampled)}`);
        assertHealthy();
        return cropPixels(await page.screenshot(), {
          x: (1280 - width) / 2,
          y: (800 - height) / 2,
          width,
          height,
        });
      },
      async close() {
        await browser.close();
        assertHealthy();
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** Fixed framing only: never classify model colours as removable background. */
export function cropPixels(buffer, { x, y, width, height }) {
  const source = PNG.sync.read(buffer);
  if (
    ![x, y, width, height].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > source.width ||
    y + height > source.height
  )
    throw new Error("Crop lies outside the captured viewport");
  const result = new PNG({ width, height });
  PNG.bitblt(source, result, x, y, width, height, 0, 0);
  return PNG.sync.write(result);
}
