import { fileURLToPath } from "node:url";

export const meta = {
  name: "shadow-depth-range",
  kind: "flow",
  world: "isolated-shadow-depth-range",
  tier: "quick",
  snapshots: [],
  describe: "An empty shadow map cannot darken receivers beyond its depth range.",
};
const rigPath = fileURLToPath(
  new URL("../../../packages/photoreal-renderer/src/battle/shadowRig.ts", import.meta.url),
);
export async function run(ctx) {
  const page = await ctx.newPage();
  const warnings = [];
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) warnings.push(message.text());
  });
  await page.route(`${ctx.target}/__shadow-depth-probe`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Shadow depth probe</title>",
    }),
  );
  await page.goto(`${ctx.target}/__shadow-depth-probe`);
  const report = await page.evaluate(async (rigPath) => {
    const url = `/@fs${rigPath}`;
    const source = await (await fetch(url)).text();
    const threeUrl = source.match(/import \* as THREE from ["']([^"']+)["']/)?.[1];
    if (!threeUrl) throw Error("Shadow rig Three import missing");
    const THREE = await import(threeUrl);
    const { configureSunShadows } = await import(url);
    const rows = [];
    for (const reversedDepthBuffer of [false, true]) {
      const renderer = new THREE.WebGPURenderer({ reversedDepthBuffer });
      renderer.setSize(16, 16);
      await renderer.init();
      const target = new THREE.RenderTarget(16, 16);
      renderer.setRenderTarget(target);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
      camera.position.z = 5;
      camera.lookAt(0, 0, 0);
      const samples = [];
      const diagnostics = [];
      try {
        for (const shadows of [false, true]) {
          const scene = new THREE.Scene();
          const sun = new THREE.DirectionalLight(0xffffff, 2);
          sun.position.set(0, 0, 10);
          scene.add(sun, sun.target);
          const rig = configureSunShadows(
            renderer,
            sun,
            { physical: { turbidity: 2 } },
            shadows ? "single" : "off",
          );
          // The receiver is beyond this camera's far plane. There are no casters,
          // so even an out-of-range sample must remain fully illuminated.
          sun.position.set(0, 0, 10);
          sun.target.position.set(0, 0, 0);
          sun.shadow.camera.near = 1;
          sun.shadow.camera.far = 4;
          sun.shadow.camera.updateProjectionMatrix();
          const geometry = new THREE.PlaneGeometry(2, 2);
          const material = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1 });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.receiveShadow = shadows;
          scene.add(mesh);
          // Exercise the steady frame after Three has initialized the shadow camera.
          for (let frame = 0; frame < 3; frame++) {
            await new Promise(requestAnimationFrame);
            sun.shadow.camera.updateProjectionMatrix();
            renderer.render(scene, camera);
          }
          const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 16, 16);
          diagnostics.push(new THREE.Vector3(0, 0, 0).applyMatrix4(sun.shadow.matrix).z);
          samples.push(Array.from(pixels.slice((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 3)));
          rig.dispose();
          geometry.dispose();
          material.dispose();
        }
      } finally {
        target.dispose();
        renderer.dispose();
      }
      rows.push({
        reversedDepthBuffer,
        unshadowed: samples[0],
        shadowed: samples[1],
        receivingDepth: diagnostics[1],
      });
    }
    return rows;
  }, rigPath);
  for (const row of report)
    ctx.check(
      `${row.reversedDepthBuffer ? "reversed" : "normal"} depth leaves out-of-range receivers lit`,
      (row.reversedDepthBuffer ? row.receivingDepth < 0 : row.receivingDepth > 1) &&
        row.unshadowed.every((v, i) => v > 0 && v === row.shadowed[i]),
      JSON.stringify(row),
    );
  ctx.check("no GPU warnings", warnings.length === 0, warnings.join("\n"));
}
