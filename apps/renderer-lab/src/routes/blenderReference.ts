import * as THREE from "three/webgpu";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import humanUrl from "@packages/soldier-assets/assets/test/blender-reference/human.glb?url";
import humanLandmarksUrl from "@packages/soldier-assets/assets/test/blender-reference/human.landmarks.json?url";
import mountedUrl from "@packages/soldier-assets/assets/test/blender-reference/mounted.glb?url";
import mountedLandmarksUrl from "@packages/soldier-assets/assets/test/blender-reference/mounted.landmarks.json?url";
import { el, type LabContext } from "../labShell";

interface LandmarkFixture {
  fixture: string;
  glbSha256: string;
  toleranceMetres: number;
  riderUpperBodyMask: string[];
  maximumNonzeroWeights: number;
  meshes: { node: string; primitive: number; sourceVertexByGltfVertex: number[] }[];
  samples: {
    name: string;
    clip: string;
    seconds: number;
    positions: Record<string, [number, number, number][]>;
  }[];
}

const fixtures = {
  human: { asset: humanUrl, landmarks: humanLandmarksUrl },
  mounted: { asset: mountedUrl, landmarks: mountedLandmarksUrl },
};

/** Standard glTF export oracle only; production crowd parity is a separate gate. */
export async function route(ctx: LabContext): Promise<void> {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const world = await PhotorealWorld.create(ctx.canvas, { antialias: false });
  world.scene.background = new THREE.Color(0x353c43);
  world.scene.add(new THREE.HemisphereLight(0xffffff, 0x677078, 2));
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(-3, -4, 7);
  world.scene.add(key);
  const holder = new THREE.Group();
  // glTF's Y-up basis enters the existing Z-up camera/world contract here only.
  holder.rotation.x = Math.PI / 2;
  world.scene.add(holder);
  const camera = new THREE.PerspectiveCamera();
  const ui = el("div", "reference-controls");
  ui.innerHTML = `<h2>Blender export oracle</h2><p>Standard GLTFLoader · not production art acceptance</p>
    <label>Fixture <select id="reference-fixture"><option>human</option><option>mounted</option></select></label>
    <label>Pose <select id="reference-pose"></select></label>
    <label>View <select id="reference-view"><option>front</option><option>side</option></select></label>`;
  ctx.panel.prepend(ui);
  const caption = el("div", "reference-caption");
  caption.style.cssText =
    "position:fixed;bottom:14px;left:14px;color:white;font:24px monospace;pointer-events:none";
  ctx.root.append(caption);
  const fixtureControl = ui.querySelector<HTMLSelectElement>("#reference-fixture")!;
  const poseControl = ui.querySelector<HTMLSelectElement>("#reference-pose")!;
  const viewControl = ui.querySelector<HTMLSelectElement>("#reference-view")!;
  let gltf: GLTF;
  let metadata: LandmarkFixture;
  let mixer: THREE.AnimationMixer;
  let fixtureId: keyof typeof fixtures = "human";
  let selectedSample = 0;
  let frame = 0;
  let dirty = true;
  let maxError = 0;
  let checkedVertices = 0;
  let hashMatches = false;
  let maxInfluences = 0;
  let weightSumError = 0;
  let composedClips: THREE.AnimationClip[] = [];
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const extent = new THREE.Vector3();
  const point = new THREE.Vector3();
  const expected = new THREE.Vector3();

  const sample = (index: number) => {
    const pose = metadata.samples[index];
    if (!pose) throw new Error(`Unknown export sample ${index}`);
    mixer.stopAllAction();
    const clips =
      pose.clip === "composed"
        ? composedClips
        : gltf.animations.filter((clip) => clip.name === pose.clip);
    if (clips.length === 0) throw new Error(`Missing exported clip ${pose.clip}`);
    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
    mixer.setTime(pose.seconds);
    holder.updateMatrixWorld(true);
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
    });
    maxError = 0;
    checkedVertices = 0;
    for (const mapping of metadata.meshes) {
      const object = gltf.scene.getObjectByName(mapping.node);
      if (!(object instanceof THREE.SkinnedMesh))
        throw new Error(`Expected a skinned surface at ${mapping.node}`);
      const positions = pose.positions[mapping.node];
      if (
        object.geometry.getAttribute("position").count !== mapping.sourceVertexByGltfVertex.length
      )
        throw new Error(`Surface mapping count differs for ${mapping.node}`);
      mapping.sourceVertexByGltfVertex.forEach((sourceVertex, vertex) => {
        object.getVertexPosition(vertex, point).applyMatrix4(object.matrixWorld);
        expected.fromArray(positions[sourceVertex]).applyMatrix4(holder.matrixWorld);
        maxError = Math.max(maxError, point.distanceTo(expected));
        checkedVertices++;
      });
    }
    selectedSample = index;
    poseControl.value = String(index);
    dirty = true;
  };
  // This oracle owns a fixed pair for its entire lifetime. Switching the
  // selection neither fetches nor allocates another mesh/texture set.
  const prepared = Object.fromEntries(
    await Promise.all(
      Object.entries(fixtures).map(async ([id, input]) => {
        const [buffer, evidence] = await Promise.all([
          fetch(input.asset).then((response) => response.arrayBuffer()),
          fetch(input.landmarks).then((response) => response.json() as Promise<LandmarkFixture>),
        ]);
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        const hash = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        return [
          id,
          {
            gltf: await new GLTFLoader().parseAsync(buffer, ""),
            evidence,
            hashMatches: hash === evidence.glbSha256,
          },
        ] as const;
      }),
    ),
  );
  const selectFixture = (id: keyof typeof fixtures) => {
    if (gltf) {
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
      gltf.scene.removeFromParent();
    }
    gltf = prepared[id].gltf;
    metadata = prepared[id].evidence;
    composedClips = metadata.riderUpperBodyMask.length
      ? ["gait", "rider-action"].map((name) => {
          const source = gltf.animations.find((clip) => clip.name === name);
          if (!source) throw new Error(`Missing exported clip ${name}`);
          const tracks = source.tracks.filter((track) => {
            const bone = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
            const upper = metadata.riderUpperBodyMask.includes(bone);
            return name === "rider-action" ? upper : !upper;
          });
          return new THREE.AnimationClip(`${name}-masked`, source.duration, tracks);
        })
      : [];
    maxInfluences = 0;
    weightSumError = 0;
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      const weights = object.geometry.getAttribute("skinWeight");
      for (let i = 0; i < weights.count; i++) {
        const values = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
        maxInfluences = Math.max(maxInfluences, values.filter((value) => value > 0).length);
        weightSumError = Math.max(
          weightSumError,
          Math.abs(values.reduce((sum, value) => sum + value, 0) - 1),
        );
      }
    });
    hashMatches = prepared[id].hashMatches;
    fixtureId = id;
    fixtureControl.value = id;
    holder.add(gltf.scene);
    mixer = new THREE.AnimationMixer(gltf.scene);
    poseControl.replaceChildren(
      ...metadata.samples.map((pose, i) => new Option(pose.name, String(i))),
    );
    bounds.makeEmpty();
    metadata.samples.forEach((_, index) => {
      sample(index);
      bounds.union(new THREE.Box3().setFromObject(gltf.scene, true));
    });
    bounds.getCenter(center);
    bounds.getSize(extent);
    sample(0);
  };
  const stats = () => ({
    fixture: fixtureId,
    sample: metadata.samples[selectedSample].name,
    sampleNames: metadata.samples.map((pose) => pose.name),
    view: viewControl.value,
    frame,
    maxError,
    checkedVertices,
    toleranceMetres: metadata.toleranceMetres,
    hashMatches,
    maximumNonzeroWeights: metadata.maximumNonzeroWeights,
    maxInfluences,
    weightSumError,
    activeFixtureScenes: holder.children.length,
    textures: world.renderer.info.memory.textures,
    oracle: "GLTFLoader/SkinnedMesh",
    render: world.stats(),
  });
  selectFixture("human");
  fixtureControl.onchange = () => {
    selectFixture(fixtureControl.value as keyof typeof fixtures);
  };
  poseControl.onchange = () => sample(Number(poseControl.value));
  viewControl.onchange = () => {
    dirty = true;
  };
  new ResizeObserver(() => {
    dirty = true;
  }).observe(ctx.canvas);
  const browserWindow = window as unknown as {
    __rendererLabReady: boolean;
    __blenderReference: {
      selectFixture: typeof selectFixture;
      sample: typeof sample;
      stats: typeof stats;
      world: PhotorealWorld;
    };
  };
  browserWindow.__blenderReference = { selectFixture, sample, stats, world };
  const draw = () => {
    if (dirty) {
      world.resize(ctx.canvas.clientWidth, ctx.canvas.clientHeight, 1);
      const pose = chartCamera3d(
        {
          x: center.x,
          y: center.y,
          zoom: 460 / Math.max(extent.x, extent.y, extent.z),
          yaw: viewControl.value === "front" ? 0.3 : 1.6,
          pitch: 1.15,
        },
        ctx.canvas.height,
      );
      pose.target = [center.x, center.y, center.z];
      pose.aspect = ctx.canvas.width / ctx.canvas.height;
      pose.far = 100;
      applyCamera3d(camera, pose);
      world.setTime(0);
      world.render(camera);
      frame++;
      dirty = false;
      ctx.status.textContent = `${metadata.samples[selectedSample].name} · ${checkedVertices} vertices · max error ${maxError.toExponential(2)} m`;
      caption.textContent = `${fixtureId} · ${metadata.samples[selectedSample].name} · ${viewControl.value} · export oracle`;
      browserWindow.__rendererLabReady = true;
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
