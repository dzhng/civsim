import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

export const meta = {
  name: "battle-model-normal-frame",
  kind: "flow",
  world: "production-blender-human-normal-direction",
  tier: "full",
  snapshots: [],
  describe:
    "Numerical production posed-normal directions against independent weighted-frame and ray-intersection controls; no aesthetic acceptance.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const normal = new PNG({ width: 8, height: 8 });
  // Spatial changes within authored triangles expose vertex-hoisted sampling.
  const texels = [
    [192, 128, 240],
    [64, 160, 240],
    [160, 64, 240],
    [96, 192, 240],
  ];
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=/assets/soldiers/candidates/blender-reference/catalog.json`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    for (const control of [
      { name: "bent-yawed", scale: 1 },
      { name: "mirrored-W", scale: 1, mirrored: true },
      { name: "scale-two", scale: 2 },
      { name: "scale-zero", scale: 0 },
      { name: "flat-map", scale: 1, flat: true },
      { name: "negative-Z-zero-scale", scale: 0, flat: true, negative: true },
      { name: "decoded-zero-linear", scale: 1, decodedZero: true },
      { name: "large-finite-scale", scale: 3e38 },
      { name: "unmapped-slot", scale: 1, unmapped: true },
      { name: "authored-corpse", scale: 1, corpse: true },
      { name: "collapsed-T-front", scale: 1, collapse: "tangent" },
      { name: "collapsed-T-back", scale: 1, collapse: "tangent", back: true },
      { name: "collapsed-N-front", scale: 1, collapse: "normal" },
      { name: "collapsed-N-back", scale: 1, collapse: "normal", back: true },
      { name: "residual-N-front", scale: 1, collapse: "normal", residual: true },
      { name: "residual-N-back", scale: 1, collapse: "normal", residual: true, back: true },
      { name: "residual-T-front", scale: 1, collapse: "tangent", residual: true },
      { name: "residual-T-back", scale: 1, collapse: "tangent", residual: true, back: true },
    ]) {
      const selectedTexels = control.flat
        ? texels.map(() => [128, 128, control.negative ? 0 : 255])
        : texels;
      if (control.flat) {
        for (let pixel = 0; pixel < 64; pixel++)
          normal.data.set([...selectedTexels[0], 255], pixel * 4);
      } else {
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            normal.data.set([...texels[(x + y * 3) % 4], 255], (y * 8 + x) * 4);
      }
      if (control.decodedZero)
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            const value = 127 + (x % 2);
            normal.data.set([value, value, value, 255], (y * 8 + x) * 4);
          }
      const result = await page.evaluate(
        async ({ image, texels, control }) => {
          const h = window.__battleModels,
            w = h.world,
            renderer = w.world.renderer;
          // Reuse the actual loaded Three module, not a second raw/optimized copy.
          const moduleUrl = performance
            .getEntriesByType("resource")
            .find((entry) => /\/three_webgpu\.js\?/.test(entry.name))?.name;
          if (!moduleUrl) throw new Error("production Three module URL missing");
          const THREE = await import(moduleUrl),
            T = THREE.TSL;
          if (!(w.camera instanceof THREE.PerspectiveCamera))
            throw new Error("diagnostic Three module identity differs");
          window.__normalFrameSource ??= structuredClone(w.soldierAssets[40]);
          const bundle = structuredClone(window.__normalFrameSource);
          const mesh = bundle.tiers[0];
          if (control.collapse) {
            // Valid vertex frames cancel only after interpolation at the center
            // ray. This is a local analytic limit fixture, not replacement art.
            mesh.positions = new Float32Array([-1, 0, 0, 1, 0, 0, 1, 0, 2, -1, 0, 2]);
            mesh.indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
            mesh.normals = new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]);
            mesh.tangents = new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
            if (control.collapse === "normal") {
              mesh.normals[4] = 1;
              mesh.normals[7] = 1;
              if (control.residual) for (let i = 0; i < 12; i += 3) mesh.normals[i] = 1e-8;
            } else {
              mesh.tangents[0] = -1;
              mesh.tangents[12] = -1;
              if (control.residual) for (let i = 2; i < 16; i += 4) mesh.tangents[i] = 1e-8;
            }
            mesh.uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
            mesh.colors = new Float32Array(16);
            mesh.materialIds = new Float32Array(4);
            mesh.factionMasks = new Float32Array(4);
            mesh.joints = new Uint16Array(16);
            mesh.weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
            // Identity rig keeps the analytic cancellation fixture stationary;
            // regenerate canonical local samples instead of patching GPU matrices.
            for (const bone of bundle.rig.bones) {
              bone.bind = { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] };
              bone.inverseBind = new THREE.Matrix4().toArray();
            }
            for (const clip of bundle.rig.clips) clip.tracks = {};
            const animationModule = performance
              .getEntriesByType("resource")
              .find((entry) => /\/localAnimation\.ts(?:\?|$)/.test(entry.name))?.name;
            if (!animationModule) throw new Error("canonical local animation module missing");
            const { bakeLocalAnimation } = await import(animationModule);
            bundle.animation = bakeLocalAnimation(bundle.rig);
          }
          mesh.colors.fill(1);
          mesh.materialIds.fill(0);
          mesh.factionMasks.fill(0);
          if (control.decodedZero) mesh.uvs.fill(0.5);
          if (control.mirrored)
            for (let i = 3; i < mesh.tangents.length; i += 4) mesh.tangents[i] *= -1;
          bundle.tiers = [mesh, mesh, mesh];
          bundle.farMesh = mesh;
          bundle.manifest.far.phase = 0.5;
          bundle.surface = {
            materials: [
              {
                name: "normal-control",
                baseColor: [0.5, 0.5, 0.5, 1],
                roughness: 0.7,
                metallic: 0,
                textures: control.unmapped ? {} : { normal: true },
                normalScale: control.scale,
              },
            ],
            textures: {
              normal: {
                image: new Uint8Array(image),
                mimeType: "image/png",
                sampler: {
                  magFilter: control.decodedZero ? "linear" : "nearest",
                  minFilter: control.decodedZero ? "linear" : "nearest",
                  mipmapFilter: "none",
                  wrapS: "clamp-to-edge",
                  wrapT: "clamp-to-edge",
                },
              },
            },
          };
          const replacement = await w.crowd.constructor.create(renderer, w.world.scene, {
            40: bundle,
          });
          w.crowd.dispose();
          w.crowd = replacement;
          w.soldierAssets = { 40: bundle };

          // Independent authored-track interpolation and Three matrix arithmetic,
          // not the canonical decoder, poseSoldierMesh or shader helper.
          const clip = bundle.animation.clips[0];
          const authored = bundle.rig.clips.find((value) => value.name === clip.name);
          const time = authored.duration * 0.5;
          const channel = (track, fallback, rotation = false) => {
            if (!track) return fallback;
            const size = rotation ? 4 : 3;
            let a = 0;
            while (a + 1 < track.times.length && track.times[a + 1] <= time) a++;
            const b = Math.min(a + 1, track.times.length - 1);
            const start = track.values.slice(a * size, a * size + size);
            if (a === b || track.interpolation === "STEP") return start;
            const end = track.values.slice(b * size, b * size + size);
            const alpha = Math.max(
              0,
              Math.min(1, (time - track.times[a]) / (track.times[b] - track.times[a])),
            );
            return rotation
              ? new THREE.Quaternion()
                  .fromArray(start)
                  .slerp(new THREE.Quaternion().fromArray(end), alpha)
                  .toArray()
              : start.map((value, index) => value + (end[index] - value) * alpha);
          };
          const worlds = [];
          const palette = bundle.rig.bones.map((bone, joint) => {
            const tracks = authored.tracks[joint] ?? {};
            const local = new THREE.Matrix4().compose(
              new THREE.Vector3().fromArray(channel(tracks.T, bone.bind.T)),
              new THREE.Quaternion().fromArray(channel(tracks.R, bone.bind.R, true)),
              new THREE.Vector3().fromArray(channel(tracks.S, bone.bind.S)),
            );
            worlds[joint] = bone.parent < 0 ? local : worlds[bone.parent].clone().multiply(local);
            return worlds[joint].clone().multiply(new THREE.Matrix4().fromArray(bone.inverseBind));
          });
          const posed = [],
            normals = [],
            tangents = [];
          const yaw = control.collapse ? 0 : 0.61;
          const rotation = new THREE.Matrix4().makeRotationZ(yaw);
          for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
            const matrix = new THREE.Matrix4();
            matrix.elements.fill(0);
            for (let influence = 0; influence < 4; influence++) {
              const weight = mesh.weights[vertex * 4 + influence],
                bone = mesh.joints[vertex * 4 + influence];
              for (let column = 0; column < 4; column++)
                for (let row = 0; row < 4; row++)
                  matrix.elements[column * 4 + row] +=
                    weight * palette[bone].elements[column * 4 + row];
            }
            const linear = new THREE.Matrix3().setFromMatrix4(matrix);
            posed.push(
              new THREE.Vector3()
                .fromArray(mesh.positions, vertex * 3)
                .applyMatrix4(matrix)
                .applyMatrix4(rotation),
            );
            normals.push(
              new THREE.Vector3()
                .fromArray(mesh.normals, vertex * 3)
                .applyMatrix3(linear)
                .normalize()
                .transformDirection(rotation),
            );
            tangents.push(
              new THREE.Vector3()
                .fromArray(mesh.tangents, vertex * 4)
                .applyMatrix3(linear)
                .normalize()
                .transformDirection(rotation),
            );
          }
          const center = new THREE.Box3().setFromPoints(posed).getCenter(new THREE.Vector3());
          h.set({
            classId: 40,
            clip: "bend",
            phase: 0.5,
            formation: false,
            yaw: 0.45,
            pitch: 1.15,
            zoom: 150,
            target: center.toArray(),
          });
          while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          const camera = structuredClone(w.stats().camera);
          w.drawInstances(
            [
              {
                x: 0,
                y: 0,
                elevation: 0,
                facing: Math.PI / 2 + yaw,
                classId: 40,
                faction: 0,
                alive: !control.corpse,
                clip: "bend",
                phase: 0.5,
                seed: 0,
                mounted: false,
                lod: 0,
              },
            ],
            camera,
          );
          w.render();
          await w.settlePresentedFrame();
          if (control.collapse) {
            w.camera.near = 0.01;
            w.camera.far = 100;
            w.camera.updateProjectionMatrix();
            w.camera.position.set(0, control.back ? 6 : -6, 0.9);
            w.camera.up.set(0, 0, 1);
            w.camera.lookAt(0, 0, 0.9);
            w.camera.updateMatrixWorld();
          }
          const visible = replacement.buckets[40].main.find((bucket) => bucket.mesh.visible).mesh;
          const material = visible.material;
          const width = control.collapse ? 641 : 640,
            height = control.collapse ? 401 : 400;
          const target = new THREE.RenderTarget(width, height, {
            type: THREE.FloatType,
            depthBuffer: true,
          });
          target.texture.colorSpace = THREE.LinearSRGBColorSpace;
          const savedTarget = renderer.getRenderTarget(),
            savedFragment = material.fragmentNode,
            savedTone = material.toneMapped,
            savedFog = material.fog;
          const visibility = w.world.scene.children.map((child) => [child, child.visible]);
          let pixels;
          try {
            try {
              // Change only the output representation of the actual production node.
              // The production position, palette, tangent and normal-map nodes still run.
              material.fragmentNode = T.vec4(material.normalNode.normalize().mul(0.5).add(0.5), 1);
              material.toneMapped = false;
              material.fog = false;
              material.needsUpdate = true;
              for (const [child] of visibility) child.visible = child === visible;
              renderer.setRenderTarget(target);
              renderer.render(w.world.scene, w.camera);
            } finally {
              renderer.setRenderTarget(savedTarget);
              for (const [child, value] of visibility) child.visible = value;
              material.fragmentNode = savedFragment;
              material.toneMapped = savedTone;
              material.fog = savedFog;
              material.needsUpdate = true;
            }
            pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
          } finally {
            target.dispose();
          }
          if (control.collapse) {
            const rowFloats = Math.ceil((width * 16) / 256) * 64;
            const offset = Math.floor(height / 2) * rowFloats + Math.floor(width / 2) * 4;
            const actual = new THREE.Vector3()
              .fromArray(pixels, offset)
              .multiplyScalar(2)
              .subScalar(1);
            const expected = new THREE.Vector3(0, -1, 0).transformDirection(
              w.camera.matrixWorldInverse,
            );
            return {
              collapsed: {
                actual: actual.toArray(),
                expected: expected.toArray(),
                dot: actual.normalize().dot(expected),
                coverage: pixels[offset + 3],
              },
            };
          }

          function measure(
            posed,
            normals,
            tangents,
            camera,
            width,
            height,
            readNormal,
            viewRotation,
            step,
          ) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(
                posed.flatMap((p) => p.toArray()),
                3,
              ),
            );
            geometry.setIndex(Array.from(mesh.indices));
            const rayMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
            const rayMesh = new THREE.Mesh(geometry, rayMaterial);
            rayMesh.updateMatrixWorld();
            const raycaster = new THREE.Raycaster();
            const samples = [];
            let unstableFootprints = 0;
            const uvTexels = new Set();
            try {
              for (let y = 4; y < height - 4; y += step)
                for (let x = 4; x < width - 4; x += step) {
                  raycaster.setFromCamera(
                    new THREE.Vector2(((x + 0.5) / width) * 2 - 1, 1 - ((y + 0.5) / height) * 2),
                    camera,
                  );
                  const hit = raycaster.intersectObject(rayMesh)[0];
                  if (!hit) continue;
                  const ids = [hit.face.a, hit.face.b, hit.face.c];
                  const bary = new THREE.Triangle(...ids.map((i) => posed[i]))
                    .getBarycoord(hit.point, new THREE.Vector3())
                    .toArray();
                  if (Math.min(...bary) < 0.08) continue; // Exclude raster edges, not interior map changes.
                  const n = new THREE.Vector3(),
                    t = new THREE.Vector3(),
                    uv = new THREE.Vector2();
                  let handedness = 0;
                  ids.forEach((id, i) => {
                    n.addScaledVector(normals[id], bary[i]);
                    t.addScaledVector(tangents[id], bary[i]);
                    uv.x += mesh.uvs[id * 2] * bary[i];
                    uv.y += mesh.uvs[id * 2 + 1] * bary[i];
                    handedness += mesh.tangents[id * 4 + 3] * bary[i];
                  });
                  n.normalize();
                  t.addScaledVector(n, -t.dot(n)).normalize();
                  const b = new THREE.Vector3().crossVectors(n, t).multiplyScalar(handedness);
                  const tx = Math.min(7, Math.max(0, Math.floor(uv.x * 8))),
                    ty = Math.min(7, Math.max(0, Math.floor(uv.y * 8)));
                  // Fixed-point GPU raster interpolation can straddle a nearest
                  // boundary on a small projected triangle. Require the entire
                  // pixel's independently projected UV footprint to stay in one
                  // texel, rather than excluding a handpicked failing pixel.
                  const triangle = new THREE.Triangle(...ids.map((i) => posed[i]));
                  const plane = new THREE.Plane().setFromCoplanarPoints(
                    ...ids.map((i) => posed[i]),
                  );
                  let stable = true;
                  for (const dx of [-0.5, 0.5])
                    for (const dy of [-0.5, 0.5]) {
                      raycaster.setFromCamera(
                        new THREE.Vector2(
                          ((x + 0.5 + dx) / width) * 2 - 1,
                          1 - ((y + 0.5 + dy) / height) * 2,
                        ),
                        camera,
                      );
                      const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
                      if (!point) {
                        stable = false;
                        continue;
                      }
                      const weights = triangle.getBarycoord(point, new THREE.Vector3()).toArray();
                      const corner = [0, 0];
                      ids.forEach((id, i) => {
                        corner[0] += mesh.uvs[id * 2] * weights[i];
                        corner[1] += mesh.uvs[id * 2 + 1] * weights[i];
                      });
                      if (
                        Math.min(7, Math.max(0, Math.floor(corner[0] * 8))) !== tx ||
                        Math.min(7, Math.max(0, Math.floor(corner[1] * 8))) !== ty
                      )
                        stable = false;
                    }
                  if (!stable) {
                    unstableFootprints++;
                    continue;
                  }
                  const texel = (tx + ty * 3) % 4;
                  uvTexels.add(texel);
                  const map = texels[texel].map((v) => (v / 255) * 2 - 1);
                  const scale = Math.fround(control.scale);
                  map[0] *= scale;
                  map[1] *= scale;
                  if (control.unmapped || control.decodedZero) map.splice(0, 3, 0, 0, 1);
                  const expected = t
                    .multiplyScalar(map[0])
                    .addScaledVector(b, map[1])
                    .addScaledVector(n, map[2])
                    .normalize()
                    .applyMatrix3(viewRotation)
                    .normalize();
                  const actual = readNormal(x, y).normalize();
                  samples.push({
                    pixel: [x, y],
                    texel,
                    dot: expected.dot(actual),
                    expected: expected.toArray(),
                    actual: actual.toArray(),
                  });
                }
            } finally {
              geometry.dispose();
              rayMaterial.dispose();
            }
            return {
              sampleCount: samples.length,
              unstableFootprints,
              texels: [...uvTexels],
              worst: samples.sort((a, b) => a.dot - b.dot).slice(0, 5),
              minDot: Math.min(...samples.map((s) => s.dot)),
            };
          }
          const near = measure(
            posed,
            normals,
            tangents,
            w.camera,
            width,
            height,
            (x, y) => {
              const offset = (y * width + x) * 4;
              return new THREE.Vector3(
                pixels[offset] * 2 - 1,
                pixels[offset + 1] * 2 - 1,
                pixels[offset + 2] * 2 - 1,
              );
            },
            new THREE.Matrix3().setFromMatrix4(w.camera.matrixWorldInverse),
            4,
          );

          // Read the actual baked model-space property, not a second shader.
          const atlas = replacement.impostors[40].atlas;
          const gpu = renderer.backend.get(atlas.textures.normal).texture;
          const device = renderer.backend.device;
          const row = Math.ceil((gpu.width * 4) / 256) * 256;
          const buffer = device.createBuffer({
            size: row * gpu.height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
          let atlasPixels;
          try {
            const encoder = device.createCommandEncoder();
            encoder.copyTextureToBuffer({ texture: gpu }, { buffer, bytesPerRow: row }, [
              gpu.width,
              gpu.height,
            ]);
            device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            atlasPixels = new Uint8Array(buffer.getMappedRange()).slice();
          } finally {
            buffer.destroy();
          }
          const tile = 5,
            span = atlas.worldSpan;
          // An independent ordinary camera reconstructs this one declared view.
          // No private clip/depth math from the atlas baker is reused.
          const farCamera = new THREE.OrthographicCamera(
            -span / 2,
            span / 2,
            span / 2,
            -span / 2,
            0.01,
            span * 4,
          );
          farCamera.up.set(0, 0, 1);
          farCamera.position.copy(atlas.center).addScaledVector(atlas.directions[tile], span * 2);
          farCamera.lookAt(atlas.center);
          farCamera.updateMatrixWorld();
          const undoInstance = rotation.clone().invert();
          const far = measure(
            posed.map((v) => v.clone().applyMatrix4(undoInstance)),
            normals.map((v) => v.clone().transformDirection(undoInstance)),
            tangents.map((v) => v.clone().transformDirection(undoInstance)),
            farCamera,
            atlas.tileSize,
            atlas.tileSize,
            (x, y) => {
              const offset =
                (Math.floor(tile / atlas.columns) * atlas.tileSize + y) * row +
                ((tile % atlas.columns) * atlas.tileSize + x) * 4;
              return new THREE.Vector3(
                (atlasPixels[offset] / 255) * 2 - 1,
                (atlasPixels[offset + 1] / 255) * 2 - 1,
                (atlasPixels[offset + 2] / 255) * 2 - 1,
              );
            },
            new THREE.Matrix3(),
            1,
          );
          return { near, far };
        },
        { image: Array.from(PNG.sync.write(normal)), texels: selectedTexels, control },
      );
      if (result.collapsed) {
        ctx.check(
          `${control.name}: finite authored geometric fallback`,
          result.collapsed.coverage === 1 &&
            result.collapsed.actual.every(Number.isFinite) &&
            result.collapsed.dot > 0.999,
          JSON.stringify(result.collapsed),
        );
        continue;
      }
      for (const [tier, measured] of Object.entries(result)) {
        ctx.check(
          `${control.name}/${tier}: Blender human samples map interiors`,
          measured.sampleCount >= 40 && measured.texels.length === (control.decodedZero ? 1 : 4),
          JSON.stringify(measured),
        );
        ctx.check(
          `${control.name}/${tier}: production directions match independent posed frame`,
          measured.minDot > 0.999,
          JSON.stringify(measured),
        );
      }
    }
  } finally {
    await page.close();
  }
}
