import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { fileURLToPath } from "node:url";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

export const meta = {
  name: "battle-model-material-swatches",
  kind: "visual",
  world: "six-swatch-production-oracle",
  tier: "full",
  snapshots: ["battle/material-swatches/paired"],
  describe:
    "Locally authored bent material swatches through production and stock glTF in the same world.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  const catalog = "/assets/soldiers/candidates/material-swatches/catalog.json";
  const metadata = JSON.parse(
    await readFile(
      new URL(
        "../../../packages/soldier-assets/assets/test/material-swatches/swatches.landmarks.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const materials = JSON.parse(
    await readFile(
      new URL(
        "../../../packages/soldier-assets/assets/candidates/material-swatches/swatches/materials.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  let scalar = false;
  await page.route("**/candidates/material-swatches/swatches/materials.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        scalar
          ? {
              materials: materials.materials.map(({ textures, ...material }) => material),
              textures: {},
            }
          : materials,
      ),
    }),
  );
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=${encodeURIComponent(catalog)}`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    const identity = await page.evaluate(
      async (modules) => {
        const h = window.__battleModels;
        h.freeze();
        const caption = document.createElement("div");
        caption.id = "swatch-caption";
        caption.style.cssText =
          "position:fixed;left:290px;top:205px;color:#eee2c8;background:#211a12;padding:6px 10px;font:16px/20px Georgia;white-space:pre;pointer-events:none";
        document.body.append(caption);
        // Reuse Vite's already-loaded production Three module: importing the
        // raw build here creates a second Three instance beside the renderer.
        const threeUrl = performance
          .getEntriesByType("resource")
          .find((entry) => new URL(entry.name).pathname.endsWith("/three_webgpu.js"))?.name;
        if (!threeUrl) throw new Error("production Three module was not loaded");
        const THREE = await import(threeUrl);
        const { GLTFLoader } = await import(modules.loader);
        const url = "/assets/soldiers/candidates/material-swatches/swatches/source/tier-0.glb";
        const bytes = await (await fetch(url)).arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
        const gltf = await new GLTFLoader().parseAsync(bytes, new URL(".", location.href).href);
        const holder = new THREE.Group();
        holder.rotation.x = Math.PI / 2;
        holder.add(gltf.scene);
        holder.visible = false;
        h.world.world.scene.add(holder);
        let coreIdentity =
          h.world.world.scene instanceof THREE.Scene &&
          h.world.camera instanceof THREE.Camera &&
          gltf.scene instanceof THREE.Group;
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            coreIdentity &&=
              o instanceof THREE.SkinnedMesh && o.material instanceof THREE.MeshStandardMaterial;
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        const mixer = new THREE.AnimationMixer(gltf.scene);
        const action = mixer.clipAction(gltf.animations.find((c) => c.name === "bend"));
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        window.__swatchOracle = { holder, gltf, mixer, action, THREE };
        return { hash, coreIdentity, bounds: h.world.soldierAssets[42].manifest.bounds };
      },
      {
        loader:
          "/@fs" +
          fileURLToPath(
            new URL("../../node_modules/three/examples/jsm/loaders/GLTFLoader.js", import.meta.url),
          ),
      },
    );
    ctx.check(
      "source GLB provenance matches Blender evidence",
      identity.hash === metadata.glbSha256,
      identity.hash,
    );
    ctx.check("stock loader and world share production Three constructors", identity.coreIdentity);
    const tiles = [];
    let firstProduction;
    const controls = {};
    for (const mode of ["textured", "scalar"]) {
      if (mode === "scalar") {
        scalar = true;
        await page.evaluate(async () => {
          const result = await window.__battleModels.reload();
          if (!result.ok) throw new Error("scalar control reload failed");
          window.__swatchOracle.gltf.scene.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone();
            for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"])
              o.material[key] = null;
            o.material.needsUpdate = true;
          });
        });
      }
      for (const phase of mode === "scalar" ? [0.5] : [0, 0.5, 1])
        for (const [view, yaw] of mode === "scalar"
          ? [["front", 0.21]]
          : [
              ["front", 0.21],
              ["oblique", 0.7],
            ]) {
          const pose = {
            classId: 42,
            clip: "bend",
            phase,
            formation: false,
            target: identity.bounds.center,
            zoom: 125,
            yaw,
            pitch: 1.5,
          };
          await page.evaluate(
            (text) => (document.querySelector("#swatch-caption").textContent = text),
            `Production · ${mode} · phase ${phase} · ${view}\nskin · cloth · leather · mail · wood · metal`,
          );
          await page.evaluate((pose) => {
            window.__swatchOracle.holder.visible = false;
            window.__battleModels.set(pose);
          }, pose);
          await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
          await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
          const production = await page.screenshot();
          firstProduction ??= production;
          const sourceProof = await page.evaluate(
            ({ phase, sample, mappings, caption }) => {
              const h = window.__battleModels,
                w = h.world,
                o = window.__swatchOracle;
              document.querySelector("#swatch-caption").textContent = caption;
              w.drawInstances([], w.stats().camera);
              o.action.reset().play();
              o.mixer.setTime(phase);
              o.holder.visible = true;
              o.holder.updateMatrixWorld(true);
              w.render();
              const anchors = {};
              let maximumError = 0,
                checked = 0;
              o.gltf.scene.traverse((mesh) => {
                if (!mesh.isSkinnedMesh) return;
                const mapping = mappings.find((m) => m.node === mesh.name);
                for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
                  const point = new o.THREE.Vector3().fromBufferAttribute(
                    mesh.geometry.attributes.position,
                    vertex,
                  );
                  mesh.applyBoneTransform(vertex, point);
                  mesh.localToWorld(point);
                  const [x, y, z] =
                    sample.positions[mapping.node][mapping.sourceVertexByGltfVertex[vertex]];
                  maximumError = Math.max(
                    maximumError,
                    point.distanceTo(new o.THREE.Vector3(x, -z, y)),
                  );
                  checked++;
                }
                const points = [];
                const indices = mesh.geometry.index;
                for (let i = 0; i < indices.count; i += 3) {
                  const center = new o.THREE.Vector3();
                  for (let corner = 0; corner < 3; corner++) {
                    const index = indices.getX(i + corner);
                    const point = new o.THREE.Vector3().fromBufferAttribute(
                      mesh.geometry.attributes.position,
                      index,
                    );
                    mesh.applyBoneTransform(index, point);
                    center.add(mesh.localToWorld(point));
                  }
                  center.divideScalar(3).project(w.camera);
                  points.push([(center.x * 0.5 + 0.5) * 1280, (-center.y * 0.5 + 0.5) * 800]);
                }
                anchors[mesh.material.name] = points;
              });
              return { anchors, maximumError, checked };
            },
            {
              phase,
              sample: metadata.samples.find((s) => s.seconds === phase),
              mappings: metadata.meshes,
              caption: `Standard GLTFLoader · ${mode} · phase ${phase} · ${view}\nskin · cloth · leather · mail · wood · metal`,
            },
          );
          ctx.check(
            `${mode}/${phase}/${view}: stock-loader geometry matches Blender`,
            sourceProof.checked > 0 && sourceProof.maximumError < metadata.toleranceMetres,
            JSON.stringify({
              checked: sourceProof.checked,
              maximumError: sourceProof.maximumError,
            }),
          );
          await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
          const reference = await page.screenshot();
          const a = PNG.sync.read(production),
            b = PNG.sync.read(reference);
          let changed = 0,
            max = 0;
          for (let i = 0; i < a.data.length; i += 4) {
            // Only the explanatory captions differ intentionally; the material
            // geometry begins below this band and has independent interior probes.
            const x = (i / 4) % 1280,
              y = Math.floor(i / 4 / 1280);
            if (x >= 280 && x < 1000 && y >= 200 && y < 270) continue;
            const d = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])));
            if (d > 2) changed++;
            max = Math.max(max, d);
          }
          console.log(JSON.stringify({ mode, phase, view, changed, max }));
          // Stock vs VAT arithmetic and image upload quantization differ by ≤2 RGB
          // codes here. Regression snapshots remain strictly zero-tolerance.
          ctx.check(
            `${mode}/${phase}/${view}: matched material pixels`,
            changed === 0,
            JSON.stringify({ changed, max }),
          );
          for (const [name, points] of Object.entries(sourceProof.anchors)) {
            const values = [];
            let maximum = 0;
            for (const [x, y] of points)
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                  const index = ((Math.floor(y) + dy) * 1280 + Math.floor(x) + dx) * 4;
                  for (let channel = 0; channel < 3; channel++) {
                    maximum = Math.max(
                      maximum,
                      Math.abs(a.data[index + channel] - b.data[index + channel]),
                    );
                    values.push(a.data[index + channel]);
                  }
                }
            ctx.check(
              `${mode}/${phase}/${view}/${name}: matched triangle interiors`,
              maximum <= 2,
              `maximum=${maximum}`,
            );
            if (phase === 0.5 && view === "front") {
              if (mode === "textured") controls[name] = values;
              else
                ctx.check(
                  `${name}: authored images change production interiors`,
                  values.some((v, i) => Math.abs(v - controls[name][i]) > 10),
                );
            }
          }
          tiles.push(a, b);
          await page.evaluate((pose) => {
            window.__swatchOracle.holder.visible = false;
            window.__battleModels.set(pose);
          }, pose);
        }
    }
    scalar = false;
    await page.evaluate(async (target) => {
      const h = window.__battleModels;
      window.__swatchOracle.holder.visible = false;
      if (!(await h.reload()).ok) throw new Error("original surface restore failed");
      document.querySelector("#swatch-caption").textContent =
        "Production · textured · phase 0 · front\nskin · cloth · leather · mail · wood · metal";
      h.set({
        classId: 42,
        clip: "bend",
        phase: 0,
        formation: false,
        target,
        zoom: 125,
        yaw: 0.21,
        pitch: 1.5,
      });
    }, identity.bounds.center);
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    ctx.check(
      "original production image restored after oracle and scalar controls",
      firstProduction.equals(await page.screenshot()),
    );
    const sheet = new PNG({ width: 1440, height: (tiles.length / 2) * 380 });
    tiles.forEach((tile, index) => {
      for (let y = 0; y < 380; y++)
        for (let x = 0; x < 720; x++) {
          const from = ((y + 200) * tile.width + x + 280) * 4,
            to = ((Math.floor(index / 2) * 380 + y) * 1440 + (index % 2) * 720 + x) * 4;
          tile.data.copy(sheet.data, to, from, from + 4);
        }
    });
    await ctx.snap(page, "battle/material-swatches/paired", {
      shot: PNG.sync.write(sheet),
      threshold: 0,
      maxDiffRatio: 0,
    });
    ctx.check(
      "oracle reuses production Three without console warnings",
      warnings.length === 0,
      JSON.stringify(warnings),
    );
  } finally {
    await page.close();
  }
}
